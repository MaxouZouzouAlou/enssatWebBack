import express from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../auth.js';
import pool from '../server_config/db.js';
import { getBusinessProfileByAuthUserId } from '../services/auth-profile-service.js';

const router = express.Router();

function pctChange(current, previous) {
	const c = Number(current || 0);
	const p = Number(previous || 0);

	if (p === 0) {
		return c > 0 ? 100 : 0;
	}

	return ((c - p) / p) * 100;
}

async function requireProfessionalSession(req, res, next) {
	try {
		const session = await auth.api.getSession({
			headers: fromNodeHeaders(req.headers)
		});

		if (!session) {
			return res.status(401).json({ error: 'Non authentifie.' });
		}

		const profile = await getBusinessProfileByAuthUserId(session.user.id);
		if (profile?.accountType !== 'professionnel' || !profile.professionnel) {
			return res.status(403).json({ error: 'Compte professionnel requis.' });
		}

		req.authSession = session;
		req.businessProfile = profile;
		return next();
	} catch (error) {
		return next(error);
	}
}

/**
 * @openapi
 * /professionnels/{idProfessionnel}/dashboard:
 *   get:
 *     summary: Get seller dashboard analytics
 *     description: Returns metrics and chart data for the authenticated professional account.
 *     parameters:
 *       - in: path
 *         name: idProfessionnel
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Dashboard payload
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Professional account required or forbidden professional id
 *       404:
 *         description: Professional not found
 */
router.get('/:idProfessionnel/dashboard', requireProfessionalSession, async (req, res, next) => {
	const idProfessionnel = Number(req.params.idProfessionnel);

	if (!Number.isInteger(idProfessionnel) || idProfessionnel <= 0) {
		return res.status(400).json({ error: 'Identifiant professionnel invalide.' });
	}

	if (req.businessProfile.professionnel.id !== idProfessionnel) {
		return res.status(403).json({ error: 'Acces interdit pour ce professionnel.' });
	}

	try {
		const [proRows] = await pool.query(
			`SELECT p.idProfessionnel, u.nom, u.prenom, u.email
			 FROM Professionnel p
			 JOIN Utilisateur u ON u.id = p.id
			 WHERE p.idProfessionnel = ?`,
			[idProfessionnel]
		);

		if (!proRows.length) {
			return res.status(404).json({ error: 'Professionnel introuvable.' });
		}

		const [currentPeriodRows] = await pool.query(
			`SELECT
				 COALESCE(SUM(lc.prixTTC), 0) AS revenue,
				 COALESCE(SUM(lc.quantite), 0) AS sales,
				 COALESCE(COUNT(DISTINCT c.idCommande), 0) AS orders
			 FROM LigneCommande lc
			 JOIN Produit p ON p.idProduit = lc.idProduit
			 JOIN Commande c ON c.idCommande = lc.idCommande
			 WHERE p.idProfessionnel = ?
				 AND c.dateCommande >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
			[idProfessionnel]
		);

		const [previousPeriodRows] = await pool.query(
			`SELECT
				 COALESCE(SUM(lc.prixTTC), 0) AS revenue,
				 COALESCE(SUM(lc.quantite), 0) AS sales,
				 COALESCE(COUNT(DISTINCT c.idCommande), 0) AS orders
			 FROM LigneCommande lc
			 JOIN Produit p ON p.idProduit = lc.idProduit
			 JOIN Commande c ON c.idCommande = lc.idCommande
			 WHERE p.idProfessionnel = ?
				 AND c.dateCommande >= DATE_SUB(CURDATE(), INTERVAL 60 DAY)
				 AND c.dateCommande < DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
			[idProfessionnel]
		);

		const [stockRows] = await pool.query(
			`SELECT
				 COALESCE(COUNT(*), 0) AS totalProducts,
				 COALESCE(SUM(CASE WHEN stock <= 0 THEN 1 ELSE 0 END), 0) AS outOfStockProducts
			 FROM Produit
			 WHERE idProfessionnel = ?`,
			[idProfessionnel]
		);

		const [monthlyRows] = await pool.query(
			`SELECT
				 DATE_FORMAT(c.dateCommande, '%Y-%m') AS monthKey,
				 DATE_FORMAT(c.dateCommande, '%b') AS monthLabel,
				 ROUND(COALESCE(SUM(lc.prixTTC), 0), 2) AS revenue,
				 COALESCE(SUM(lc.quantite), 0) AS sales
			 FROM LigneCommande lc
			 JOIN Produit p ON p.idProduit = lc.idProduit
			 JOIN Commande c ON c.idCommande = lc.idCommande
			 WHERE p.idProfessionnel = ?
				 AND c.dateCommande >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
			 GROUP BY monthKey, monthLabel
			 ORDER BY monthKey`,
			[idProfessionnel]
		);

		const [topProductsRows] = await pool.query(
			`SELECT
				 p.idProduit,
				 p.nom,
				 COALESCE(SUM(lc.quantite), 0) AS sales,
				 ROUND(COALESCE(SUM(lc.prixTTC), 0), 2) AS revenue
			 FROM LigneCommande lc
			 JOIN Produit p ON p.idProduit = lc.idProduit
			 JOIN Commande c ON c.idCommande = lc.idCommande
			 WHERE p.idProfessionnel = ?
			 GROUP BY p.idProduit, p.nom
			 ORDER BY sales DESC
			 LIMIT 5`,
			[idProfessionnel]
		);

		const [channelsRows] = await pool.query(
			`SELECT
				 COALESCE(c.modeLivraison, 'non_renseigne') AS name,
				 COUNT(DISTINCT c.idCommande) AS value
			 FROM LigneCommande lc
			 JOIN Produit p ON p.idProduit = lc.idProduit
			 JOIN Commande c ON c.idCommande = lc.idCommande
			 WHERE p.idProfessionnel = ?
			 GROUP BY COALESCE(c.modeLivraison, 'non_renseigne')
			 ORDER BY value DESC`,
			[idProfessionnel]
		);

		const [topCustomersRows] = await pool.query(
			`SELECT
				 COALESCE(NULLIF(CONCAT(u.prenom, ' ', u.nom), ' '), 'Client inconnu') AS customer,
				 COUNT(DISTINCT c.idCommande) AS orders,
				 ROUND(COALESCE(SUM(perOrder.orderRevenue), 0), 2) AS revenue
			 FROM (
				 SELECT c.idCommande, c.idParticulier, COALESCE(SUM(lc.prixTTC), 0) AS orderRevenue
				 FROM LigneCommande lc
				 JOIN Produit p ON p.idProduit = lc.idProduit
				 JOIN Commande c ON c.idCommande = lc.idCommande
				 WHERE p.idProfessionnel = ?
				 GROUP BY c.idCommande, c.idParticulier
			 ) AS perOrder
			 JOIN Commande c ON c.idCommande = perOrder.idCommande
			 LEFT JOIN Particulier particulier ON particulier.idParticulier = c.idParticulier
			 LEFT JOIN Utilisateur u ON u.id = particulier.id
			 GROUP BY customer
			 ORDER BY revenue DESC
			 LIMIT 5`,
			[idProfessionnel]
		);

		const current = currentPeriodRows[0] || { revenue: 0, sales: 0, orders: 0 };
		const previous = previousPeriodRows[0] || { revenue: 0, sales: 0, orders: 0 };
		const stock = stockRows[0] || { totalProducts: 0, outOfStockProducts: 0 };
		const avgBasket = Number(current.orders) > 0 ? Number(current.revenue) / Number(current.orders) : 0;
		const outOfStockRate = Number(stock.totalProducts) > 0
			? (Number(stock.outOfStockProducts) / Number(stock.totalProducts)) * 100
			: 0;

		return res.json({
			seller: {
				idProfessionnel: proRows[0].idProfessionnel,
				name: `${proRows[0].prenom} ${proRows[0].nom}`.trim(),
				email: proRows[0].email
			},
			metrics: {
				revenue30d: Number(current.revenue),
				revenueTrendPct: Number(pctChange(current.revenue, previous.revenue).toFixed(2)),
				sales30d: Number(current.sales),
				salesTrendPct: Number(pctChange(current.sales, previous.sales).toFixed(2)),
				orders30d: Number(current.orders),
				averageBasket30d: Number(avgBasket.toFixed(2)),
				outOfStockRatePct: Number(outOfStockRate.toFixed(2)),
				outOfStockProducts: Number(stock.outOfStockProducts)
			},
			charts: {
				monthlyRevenue: monthlyRows.map((row) => ({
					month: row.monthLabel,
					monthKey: row.monthKey,
					revenue: Number(row.revenue),
					sales: Number(row.sales)
				})),
				topProducts: topProductsRows.map((row) => ({
					idProduit: row.idProduit,
					name: row.nom,
					sales: Number(row.sales),
					revenue: Number(row.revenue)
				})),
				channels: channelsRows.map((row) => ({
					name: row.name,
					value: Number(row.value)
				}))
			},
			topCustomers: topCustomersRows.map((row) => ({
				customer: row.customer,
				orders: Number(row.orders),
				revenue: Number(row.revenue)
			}))
		});
	} catch (error) {
		return next(error);
	}
});

export default router;
