class CheckoutError extends Error {
	constructor(status, message) {
		super(message);
		this.name = 'CheckoutError';
		this.status = status;
	}
}

function roundCurrency(value) {
	return Number(Number(value || 0).toFixed(2));
}

function normalizeModeLivraison(value) {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed ? trimmed.slice(0, 100) : null;
}

function parseVoucherId(value) {
	if (value == null || value === '') return null;
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function computeRewardPoints(totalPaid) {
	const normalizedTotal = Number(totalPaid || 0);
	if (!Number.isFinite(normalizedTotal) || normalizedTotal <= 0) return 0;
	return Math.max(Math.floor(normalizedTotal), 0);
}

function buildOwnerOrderColumns(owner) {
	if (owner.column === 'idParticulier') {
		return { idParticulier: owner.id, idProfessionnel: null };
	}

	if (owner.column === 'idProfessionnel') {
		return { idParticulier: null, idProfessionnel: owner.id };
	}

	throw new CheckoutError(500, 'Type de panier non gere.');
}

function validateCartLine(item) {
	const quantity = Number(item.quantite || 0);
	const stock = Number(item.stock || 0);
	const isUnitProduct = item.unitaireOuKilo === 1 || item.unitaireOuKilo === true;

	if (!Number.isFinite(quantity) || quantity <= 0) {
		throw new CheckoutError(409, `Quantite invalide pour le produit ${item.idProduit}.`);
	}

	if (isUnitProduct && !Number.isInteger(quantity)) {
		throw new CheckoutError(409, `La quantite du produit ${item.idProduit} doit etre entiere.`);
	}

	if (!item.visible) {
		throw new CheckoutError(409, `Le produit ${item.idProduit} n'est plus disponible.`);
	}

	if (quantity > stock) {
		throw new CheckoutError(409, `Stock insuffisant pour le produit ${item.idProduit}.`);
	}
}

function computeLineTotal(item) {
	const quantity = Number(item.quantite || 0);
	const price = Number(item.prix || 0);
	const vatRate = Number(item.tva || 0) / 100;
	const discountRate = Number(item.reductionProfessionnel || 0) / 100;
	const discountedUnitPrice = price * (1 - discountRate);
	const unitPriceTtc = discountedUnitPrice * (1 + vatRate);
	return roundCurrency(quantity * unitPriceTtc);
}

export async function checkoutCart({
	db,
	owner,
	modeLivraison,
	voucherId
}) {
	const conn = await db.getConnection();

	try {
		await conn.beginTransaction();

		const [cartRows] = await conn.query(
			`SELECT *
			 FROM Panier
			 WHERE ${owner.column} = ?
			 LIMIT 1
			 FOR UPDATE`,
			[owner.id]
		);

		const cart = cartRows[0];
		if (!cart) {
			throw new CheckoutError(409, 'Aucun panier a valider.');
		}

		const [itemRows] = await conn.query(
			`SELECT
				pp.idPanier,
				pp.idProduit,
				pp.quantite,
				p.nom,
				p.prix,
				p.tva,
				p.reductionProfessionnel,
				p.stock,
				p.unitaireOuKilo,
				p.visible
			 FROM Panier_Produit pp
			 JOIN Produit p ON p.idProduit = pp.idProduit
			 WHERE pp.idPanier = ?
			 FOR UPDATE`,
			[cart.idPanier]
		);

		if (!itemRows.length) {
			throw new CheckoutError(409, 'Le panier est vide.');
		}

		const items = itemRows.map((item) => {
			validateCartLine(item);
			return {
				...item,
				lineTotalTtc: computeLineTotal(item)
			};
		});

		const totalBeforeVoucher = roundCurrency(items.reduce((sum, item) => sum + item.lineTotalTtc, 0));
		const ownerColumns = buildOwnerOrderColumns(owner);
		const normalizedModeLivraison = normalizeModeLivraison(modeLivraison);
		const normalizedVoucherId = parseVoucherId(voucherId);
		let appliedVoucher = null;

		if (voucherId != null && normalizedVoucherId == null) {
			throw new CheckoutError(400, 'Identifiant de bon invalide.');
		}

		if (normalizedVoucherId != null) {
			if (owner.column !== 'idParticulier') {
				throw new CheckoutError(403, 'Bon d achat reserve aux comptes particuliers.');
			}

			const [voucherRows] = await conn.query(
				`SELECT idBon, idParticulier, codeBon, valeurEuros, statut, dateExpiration
				 FROM BonAchat
				 WHERE idBon = ?
				 LIMIT 1
				 FOR UPDATE`,
				[normalizedVoucherId]
			);

			const voucher = voucherRows[0];
			if (!voucher || Number(voucher.idParticulier) !== Number(owner.id)) {
				throw new CheckoutError(404, 'Bon d achat introuvable.');
			}

			if (voucher.statut !== 'actif') {
				throw new CheckoutError(409, 'Ce bon d achat n est plus utilisable.');
			}

			if (voucher.dateExpiration && new Date(voucher.dateExpiration).getTime() <= Date.now()) {
				await conn.execute(
					"UPDATE BonAchat SET statut = 'expire' WHERE idBon = ?",
					[voucher.idBon]
				);
				throw new CheckoutError(409, 'Ce bon d achat a expire.');
			}

			appliedVoucher = {
				idBon: voucher.idBon,
				codeBon: voucher.codeBon,
				valeurEuros: roundCurrency(voucher.valeurEuros)
			};
		}

		const prixTotal = roundCurrency(
			Math.max(totalBeforeVoucher - Number(appliedVoucher?.valeurEuros || 0), 0)
		);
		const gainedPoints = owner.column === 'idParticulier' ? computeRewardPoints(prixTotal) : 0;
		let updatedPointsBalance = null;

		const [orderResult] = await conn.execute(
			`INSERT INTO Commande
			 (modeLivraison, prixTotal, status, idParticulier, idProfessionnel)
			 VALUES (?, ?, 'en_attente', ?, ?)`,
			[
				normalizedModeLivraison,
				prixTotal,
				ownerColumns.idParticulier,
				ownerColumns.idProfessionnel
			]
		);

		for (const item of items) {
			await conn.execute(
				`INSERT INTO LigneCommande (idCommande, idProduit, quantite, prixTTC)
				 VALUES (?, ?, ?, ?)`,
				[orderResult.insertId, item.idProduit, item.quantite, item.lineTotalTtc]
			);

			await conn.execute(
				'UPDATE Produit SET stock = stock - ? WHERE idProduit = ?',
				[item.quantite, item.idProduit]
			);
		}

		if (appliedVoucher) {
			await conn.execute(
				`UPDATE BonAchat
				 SET statut = 'utilise',
				     dateUtilisation = NOW()
				 WHERE idBon = ?`,
				[appliedVoucher.idBon]
			);
		}

		if (owner.column === 'idParticulier') {
			if (gainedPoints > 0) {
				await conn.execute(
					'UPDATE Particulier SET pointsFidelite = pointsFidelite + ? WHERE idParticulier = ?',
					[gainedPoints, owner.id]
				);
			}

			const [particulierRows] = await conn.query(
				'SELECT pointsFidelite FROM Particulier WHERE idParticulier = ? LIMIT 1',
				[owner.id]
			);
			updatedPointsBalance = Number(particulierRows[0]?.pointsFidelite || 0);
		}

		await conn.execute('DELETE FROM Panier_Produit WHERE idPanier = ?', [cart.idPanier]);

		await conn.commit();

		return {
			order: {
				idCommande: orderResult.insertId,
				idPanier: cart.idPanier,
				modeLivraison: normalizedModeLivraison,
				totalBeforeVoucher,
				prixTotal,
				status: 'en_attente'
			},
			loyalty: owner.column === 'idParticulier'
				? {
					gainedPoints,
					pointsFidelite: updatedPointsBalance
				}
				: null,
			appliedVoucher,
			items: items.map((item) => ({
				idProduit: item.idProduit,
				nom: item.nom,
				quantite: Number(item.quantite),
				prixTTC: item.lineTotalTtc
			}))
		};
	} catch (error) {
		await conn.rollback();
		throw error;
	} finally {
		conn.release();
	}
}

export { CheckoutError, computeRewardPoints };
