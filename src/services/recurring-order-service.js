import pool from '../server_config/db.js';

const FREQUENCY_DAYS = {
	weekly: 7,
	biweekly: 14,
	monthly: 30
};

function toOwnerColumns(owner) {
	if (owner?.column === 'idParticulier') {
		return { idParticulier: Number(owner.id), idProfessionnel: null };
	}
	if (owner?.column === 'idProfessionnel') {
		return { idParticulier: null, idProfessionnel: Number(owner.id) };
	}
	throw new Error('Proprietaire de commande recurrente invalide.');
}

function addDays(date, days) {
	const next = new Date(date);
	next.setDate(next.getDate() + days);
	return next;
}

function toSqlDateOnly(date) {
	return new Date(date).toISOString().slice(0, 10);
}

function normalizeFrequency(value) {
	if (typeof value !== 'string') return null;
	const normalized = value.trim().toLowerCase();
	return Object.prototype.hasOwnProperty.call(FREQUENCY_DAYS, normalized) ? normalized : null;
}

function validateStartDate(startDate) {
	if (!startDate) return new Date();
	const parsed = new Date(startDate);
	if (Number.isNaN(parsed.getTime())) {
		throw new Error('Date de debut invalide.');
	}
	return parsed;
}

function parsePositiveInt(value) {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function ensureSameOwner(row, owner) {
	if (!row) return false;
	if (owner.column === 'idParticulier') return Number(row.idParticulier) === Number(owner.id);
	if (owner.column === 'idProfessionnel') return Number(row.idProfessionnel) === Number(owner.id);
	return false;
}

async function loadOrderForOwner(conn, orderId, owner) {
	const [rows] = await conn.query(
		`SELECT idCommande, idParticulier, idProfessionnel, modeLivraison, modePaiement
		 FROM Commande
		 WHERE idCommande = ?
		 LIMIT 1`,
		[orderId]
	);
	const row = rows[0] || null;
	if (!ensureSameOwner(row, owner)) return null;
	return row;
}

async function loadOrderLines(conn, orderId) {
	const [rows] = await conn.query(
		`SELECT lc.idProduit, lc.quantite, lc.idLieu,
				p.prix, p.tva, p.reductionProfessionnel, p.stock, p.visible, p.unitaireOuKilo
		 FROM LigneCommande lc
		 INNER JOIN Produit p ON p.idProduit = lc.idProduit
		 WHERE lc.idCommande = ?`,
		[orderId]
	);
	return rows;
}

async function loadDeliveryRows(conn, orderId) {
	const [rows] = await conn.query(
		`SELECT modeLivraison, adresse, idRelais, idLieu
		 FROM Livraison
		 WHERE idCommande = ?
		 ORDER BY idLivraison ASC`,
		[orderId]
	);
	return rows;
}

function computeLinePriceTtc(line) {
	const quantity = Number(line.quantite || 0);
	const price = Number(line.prix || 0);
	const vatRate = Number(line.tva || 0) / 100;
	const discountRate = Number(line.reductionProfessionnel || 0) / 100;
	const discountedUnitPrice = price * (1 - discountRate);
	const unitPriceTtc = discountedUnitPrice * (1 + vatRate);
	return Number((quantity * unitPriceTtc).toFixed(2));
}

function resolveDeliveryFees(modeLivraison) {
	if (modeLivraison === 'domicile') return 7.9;
	if (modeLivraison === 'point_relais') return 3.9;
	return 0;
}

export async function listRecurringOrdersByOwner(owner, { db = pool } = {}) {
	const ownerWhere = owner.column === 'idParticulier' ? 'c.idParticulier = ?' : 'c.idProfessionnel = ?';
	const [rows] = await db.query(
		`SELECT
			ca.idAuto,
			ca.idRefCommande,
			ca.frequence,
			ca.estActif,
			ca.prochaineEcheance,
			c.modeLivraison,
			c.modePaiement,
			c.prixTotal,
			c.dateCommande
		 FROM CommandeAuto ca
		 INNER JOIN Commande c ON c.idCommande = ca.idRefCommande
		 WHERE ${ownerWhere}
		 ORDER BY ca.idAuto DESC`,
		[owner.id]
	);

	return rows.map((row) => ({
		idAuto: Number(row.idAuto),
		idRefCommande: Number(row.idRefCommande),
		frequence: row.frequence,
		estActif: Boolean(row.estActif),
		prochaineEcheance: row.prochaineEcheance,
		referenceCommande: {
			modeLivraison: row.modeLivraison,
			modePaiement: row.modePaiement,
			prixTotal: Number(row.prixTotal || 0),
			dateCommande: row.dateCommande
		}
	}));
}

export async function createRecurringOrder(owner, payload = {}, { db = pool } = {}) {
	const idRefCommande = parsePositiveInt(payload.idRefCommande);
	const frequence = normalizeFrequency(payload.frequence);
	const startDate = validateStartDate(payload.prochaineEcheance || payload.startDate);

	if (!idRefCommande) {
		throw new Error('Commande de reference invalide.');
	}
	if (!frequence) {
		throw new Error('Frequence invalide. Utilisez weekly, biweekly ou monthly.');
	}

	const conn = await db.getConnection();
	try {
		await conn.beginTransaction();

		const order = await loadOrderForOwner(conn, idRefCommande, owner);
		if (!order) {
			throw new Error('Commande de reference introuvable.');
		}

		const [insertResult] = await conn.execute(
			`INSERT INTO CommandeAuto (idRefCommande, frequence, estActif, prochaineEcheance)
			 VALUES (?, ?, TRUE, ?)`,
			[idRefCommande, frequence, toSqlDateOnly(startDate)]
		);

		await conn.commit();
		return {
			idAuto: Number(insertResult.insertId),
			idRefCommande,
			frequence,
			estActif: true,
			prochaineEcheance: toSqlDateOnly(startDate)
		};
	} catch (error) {
		await conn.rollback();
		if (error?.code === 'ER_DUP_ENTRY') {
			throw new Error('Cette commande est deja abonnee avec cette configuration.');
		}
		throw error;
	} finally {
		conn.release();
	}
}

export async function updateRecurringOrder(owner, idAuto, payload = {}, { db = pool } = {}) {
	const recurringId = parsePositiveInt(idAuto);
	if (!recurringId) {
		throw new Error('Identifiant abonnement invalide.');
	}

	const nextFrequency = payload.frequence != null ? normalizeFrequency(payload.frequence) : null;
	if (payload.frequence != null && !nextFrequency) {
		throw new Error('Frequence invalide. Utilisez weekly, biweekly ou monthly.');
	}

	const updates = [];
	const params = [];

	if (payload.estActif != null) {
		updates.push('estActif = ?');
		params.push(Boolean(payload.estActif));
	}
	if (nextFrequency) {
		updates.push('frequence = ?');
		params.push(nextFrequency);
	}
	if (payload.prochaineEcheance != null) {
		const parsedDate = validateStartDate(payload.prochaineEcheance);
		updates.push('prochaineEcheance = ?');
		params.push(toSqlDateOnly(parsedDate));
	}

	if (!updates.length) {
		throw new Error('Aucune modification demandee.');
	}

	const ownerWhere = owner.column === 'idParticulier' ? 'c.idParticulier = ?' : 'c.idProfessionnel = ?';
	const [rows] = await db.query(
		`SELECT ca.idAuto
		 FROM CommandeAuto ca
		 INNER JOIN Commande c ON c.idCommande = ca.idRefCommande
		 WHERE ca.idAuto = ? AND ${ownerWhere}
		 LIMIT 1`,
		[recurringId, owner.id]
	);
	if (!rows.length) {
		throw new Error('Abonnement introuvable.');
	}

	await db.execute(
		`UPDATE CommandeAuto SET ${updates.join(', ')} WHERE idAuto = ?`,
		[...params, recurringId]
	);

	return { idAuto: recurringId, updated: true };
}

export async function deleteRecurringOrder(owner, idAuto, { db = pool } = {}) {
	const recurringId = parsePositiveInt(idAuto);
	if (!recurringId) {
		throw new Error('Identifiant abonnement invalide.');
	}

	const ownerWhere = owner.column === 'idParticulier' ? 'c.idParticulier = ?' : 'c.idProfessionnel = ?';
	const [rows] = await db.query(
		`SELECT ca.idAuto
		 FROM CommandeAuto ca
		 INNER JOIN Commande c ON c.idCommande = ca.idRefCommande
		 WHERE ca.idAuto = ? AND ${ownerWhere}
		 LIMIT 1`,
		[recurringId, owner.id]
	);

	if (!rows.length) {
		throw new Error('Abonnement introuvable.');
	}

	await db.execute('DELETE FROM CommandeAuto WHERE idAuto = ?', [recurringId]);
	return { idAuto: recurringId, deleted: true };
}

export async function executeRecurringOrderById(owner, idAuto, { db = pool } = {}) {
	const recurringId = parsePositiveInt(idAuto);
	if (!recurringId) {
		throw new Error('Identifiant abonnement invalide.');
	}

	const ownerWhere = owner.column === 'idParticulier' ? 'c.idParticulier = ?' : 'c.idProfessionnel = ?';
	const [rows] = await db.query(
		`SELECT ca.idAuto, ca.idRefCommande, ca.frequence, ca.estActif, ca.prochaineEcheance
		 FROM CommandeAuto ca
		 INNER JOIN Commande c ON c.idCommande = ca.idRefCommande
		 WHERE ca.idAuto = ? AND ${ownerWhere}
		 LIMIT 1`,
		[recurringId, owner.id]
	);
	const recurringOrder = rows[0] || null;
	if (!recurringOrder) {
		throw new Error('Abonnement introuvable.');
	}

	const result = await executeRecurringOrderInternal(recurringOrder, { db });
	return result;
}

async function executeRecurringOrderInternal(recurringOrder, { db = pool } = {}) {
	const conn = await db.getConnection();
	try {
		await conn.beginTransaction();

		const [refRows] = await conn.query(
			`SELECT idCommande, modeLivraison, modePaiement, idParticulier, idProfessionnel
			 FROM Commande
			 WHERE idCommande = ?
			 LIMIT 1
			 FOR UPDATE`,
			[recurringOrder.idRefCommande]
		);
		const referenceOrder = refRows[0];
		if (!referenceOrder) {
			throw new Error('Commande de reference introuvable.');
		}

		const orderOwner = toOwnerColumns({
			column: referenceOrder.idParticulier ? 'idParticulier' : 'idProfessionnel',
			id: referenceOrder.idParticulier || referenceOrder.idProfessionnel
		});

		const lines = await loadOrderLines(conn, referenceOrder.idCommande);
		if (!lines.length) {
			throw new Error('La commande de reference ne contient aucun produit.');
		}

		for (const line of lines) {
			const quantity = Number(line.quantite || 0);
			const stock = Number(line.stock || 0);
			const visible = Boolean(line.visible);
			if (!visible) {
				throw new Error(`Produit indisponible (${line.idProduit}).`);
			}
			if (stock < quantity) {
				throw new Error(`Stock insuffisant pour le produit ${line.idProduit}.`);
			}
		}

		const deliveryRows = await loadDeliveryRows(conn, referenceOrder.idCommande);
		if (!deliveryRows.length) {
			throw new Error('Configuration de livraison introuvable sur la commande de reference.');
		}

		const lineTotals = lines.map((line) => ({
			...line,
			prixTTC: computeLinePriceTtc(line)
		}));
		const sousTotal = Number(lineTotals.reduce((sum, line) => sum + Number(line.prixTTC || 0), 0).toFixed(2));
		const deliveryFee = resolveDeliveryFees(referenceOrder.modeLivraison);
		const total = Number((sousTotal + deliveryFee).toFixed(2));

		const [orderResult] = await conn.execute(
			`INSERT INTO Commande
			 (modeLivraison, modePaiement, prixTotal, status, idParticulier, idProfessionnel)
			 VALUES (?, ?, ?, 'en_attente', ?, ?)`,
			[
				referenceOrder.modeLivraison,
				referenceOrder.modePaiement,
				total,
				orderOwner.idParticulier,
				orderOwner.idProfessionnel
			]
		);
		const newOrderId = Number(orderResult.insertId);

		for (const line of lineTotals) {
			await conn.execute(
				`INSERT INTO LigneCommande (idCommande, idProduit, quantite, prixTTC, idLieu)
				 VALUES (?, ?, ?, ?, ?)`,
				[newOrderId, line.idProduit, line.quantite, line.prixTTC, line.idLieu || null]
			);

			await conn.execute(
				'UPDATE Produit SET stock = stock - ? WHERE idProduit = ?',
				[line.quantite, line.idProduit]
			);
		}

		for (const delivery of deliveryRows) {
			await conn.execute(
				`INSERT INTO Livraison
				 (idCommande, idParticulier, idProfessionnel, modeLivraison, adresse, idRelais, idLieu)
				 VALUES (?, ?, ?, ?, ?, ?, ?)`,
				[
					newOrderId,
					orderOwner.idParticulier,
					orderOwner.idProfessionnel,
					delivery.modeLivraison,
					delivery.adresse || null,
					delivery.idRelais || null,
					delivery.idLieu || null
				]
			);
		}

		const currentDueDate = recurringOrder.prochaineEcheance ? new Date(recurringOrder.prochaineEcheance) : new Date();
		const daysToAdd = FREQUENCY_DAYS[recurringOrder.frequence] || FREQUENCY_DAYS.weekly;
		const nextDueDate = addDays(currentDueDate, daysToAdd);

		await conn.execute(
			'UPDATE CommandeAuto SET prochaineEcheance = ? WHERE idAuto = ?',
			[toSqlDateOnly(nextDueDate), recurringOrder.idAuto]
		);

		await conn.commit();
		return {
			idAuto: Number(recurringOrder.idAuto),
			createdOrderId: newOrderId,
			nextDueDate: toSqlDateOnly(nextDueDate)
		};
	} catch (error) {
		await conn.rollback();
		throw error;
	} finally {
		conn.release();
	}
}

export async function processDueRecurringOrders({ db = pool, now = new Date() } = {}) {
	const today = toSqlDateOnly(now);
	const [rows] = await db.query(
		`SELECT idAuto, idRefCommande, frequence, estActif, prochaineEcheance
		 FROM CommandeAuto
		 WHERE estActif = TRUE
		   AND prochaineEcheance IS NOT NULL
		   AND prochaineEcheance <= ?
		 ORDER BY prochaineEcheance ASC, idAuto ASC`,
		[today]
	);

	const results = [];
	for (const recurringOrder of rows) {
		try {
			const result = await executeRecurringOrderInternal(recurringOrder, { db });
			results.push({ idAuto: Number(recurringOrder.idAuto), ok: true, createdOrderId: result.createdOrderId });
		} catch (error) {
			results.push({ idAuto: Number(recurringOrder.idAuto), ok: false, error: error.message || 'Erreur inconnue' });
		}
	}

	return results;
}
