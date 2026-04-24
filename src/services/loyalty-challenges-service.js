const REVIEW_CHALLENGE_BATCH_SIZE = 3;
const CIRCUIT_COURT_BATCH_SIZE = 3;

async function getScalarCount(conn, sql, params) {
	const [rows] = await conn.query(sql, params);
	return Number(rows[0]?.total || 0);
}

async function countValidatedOrders(conn, particulierId) {
	return getScalarCount(
		conn,
		`SELECT COUNT(*) AS total
		 FROM Commande
		 WHERE idParticulier = ?`,
		[particulierId]
	);
}

async function countReviewedPurchasedProducts(conn, particulierId) {
	return getScalarCount(
		conn,
		`SELECT COUNT(DISTINCT ap.idProduit) AS total
		 FROM AvisProduit ap
		 JOIN LigneCommande lc ON lc.idProduit = ap.idProduit
		 JOIN Commande c ON c.idCommande = lc.idCommande
		 WHERE ap.idParticulier = ?
		   AND c.idParticulier = ?`,
		[particulierId, particulierId]
	);
}

async function countDistinctOrderedProfessionals(conn, particulierId) {
	return getScalarCount(
		conn,
		`SELECT COUNT(DISTINCT idProfessionnel) AS total
		 FROM Commande
		 WHERE idParticulier = ?
		   AND idProfessionnel IS NOT NULL`,
		[particulierId]
	);
}

export async function evaluateChallengeConditions(conn, { code, particulierId, claimsCount = 0 }) {
	switch (String(code || '').trim().toUpperCase()) {
		case 'PREMIERE_COMMANDE': {
			const completedOrders = await countValidatedOrders(conn, particulierId);
			return {
				conditionsRemplies: completedOrders >= 1 && claimsCount < completedOrders,
				progressValue: completedOrders,
				requiredValue: 1,
			};
		}
		case 'AVIS_MULTI_PRODUITS': {
			const reviewedPurchasedProducts = await countReviewedPurchasedProducts(conn, particulierId);
			const requiredValue = (claimsCount + 1) * REVIEW_CHALLENGE_BATCH_SIZE;
			return {
				conditionsRemplies: reviewedPurchasedProducts >= requiredValue,
				progressValue: reviewedPurchasedProducts,
				requiredValue,
			};
		}
		case 'ACHAT_CIRCUIT_COURT': {
			const distinctProfessionals = await countDistinctOrderedProfessionals(conn, particulierId);
			const requiredValue = (claimsCount + 1) * CIRCUIT_COURT_BATCH_SIZE;
			return {
				conditionsRemplies: distinctProfessionals >= requiredValue,
				progressValue: distinctProfessionals,
				requiredValue,
			};
		}
		default:
			return {
				conditionsRemplies: false,
				progressValue: 0,
				requiredValue: null,
			};
	}
}
