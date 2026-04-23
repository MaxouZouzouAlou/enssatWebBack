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
	modeLivraison
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

		const prixTotal = roundCurrency(items.reduce((sum, item) => sum + item.lineTotalTtc, 0));
		const ownerColumns = buildOwnerOrderColumns(owner);
		const normalizedModeLivraison = normalizeModeLivraison(modeLivraison);

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

		await conn.execute('DELETE FROM Panier_Produit WHERE idPanier = ?', [cart.idPanier]);

		await conn.commit();

		return {
			order: {
				idCommande: orderResult.insertId,
				idPanier: cart.idPanier,
				modeLivraison: normalizedModeLivraison,
				prixTotal,
				status: 'en_attente'
			},
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

export { CheckoutError };
