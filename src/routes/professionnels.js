import express from 'express';
import PDFDocument from 'pdfkit';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../auth.js';
import pool from '../server_config/db.js';
import { getBusinessProfileByAuthUserId } from '../services/auth-profile-service.js';

const router = express.Router();

function csvEscape(value) {
	const asString = String(value ?? '');
	if (asString.includes(',') || asString.includes('"') || asString.includes('\n')) {
		return `"${asString.replace(/"/g, '""')}"`;
	}
	return asString;
}

function pctChange(current, previous) {
	const c = Number(current || 0);
	const p = Number(previous || 0);

	if (p === 0) {
		return c > 0 ? 100 : 0;
	}

	return ((c - p) / p) * 100;
}

function parseCompanyId(value) {
	if (value == null || value === '') return null;
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : NaN;
}

async function resolveScopedCompanyId(idProfessionnel, requestedCompanyId) {
	if (requestedCompanyId == null) return null;
	const [rows] = await pool.query(
		`SELECT pe.idEntreprise
		 FROM Professionnel_Entreprise pe
		 WHERE pe.idProfessionnel = ? AND pe.idEntreprise = ?
		 LIMIT 1`,
		[idProfessionnel, requestedCompanyId]
	);
	return rows[0]?.idEntreprise || null;
}

async function requireProfessionalSession(req, res, next) {
	try {
		const session = await auth.api.getSession({
			headers: fromNodeHeaders(req.headers)
		});

		if (!session) {
			return res.status(401).json({ error: 'Non authentifié.' });
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
	const requestedCompanyId = parseCompanyId(req.query?.idEntreprise);

	if (!Number.isInteger(idProfessionnel) || idProfessionnel <= 0) {
		return res.status(400).json({ error: 'Identifiant professionnel invalide.' });
	}

	if (Number.isNaN(requestedCompanyId)) {
		return res.status(400).json({ error: 'Identifiant entreprise invalide.' });
	}

	if (req.businessProfile.professionnel.id !== idProfessionnel) {
		return res.status(403).json({ error: 'Acces interdit pour ce professionnel.' });
	}

	try {
		const scopedCompanyId = await resolveScopedCompanyId(idProfessionnel, requestedCompanyId);
		if (requestedCompanyId != null && !scopedCompanyId) {
			return res.status(403).json({ error: 'Entreprise non autorisee pour ce professionnel.' });
		}

		const companyFilter = scopedCompanyId != null ? ' AND p.idEntreprise = ?' : '';
		const companyParams = scopedCompanyId != null ? [scopedCompanyId] : [];

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
			 WHERE p.idProfessionnel = ?${companyFilter}
				 AND c.dateCommande >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
			[idProfessionnel, ...companyParams]
		);

		const [previousPeriodRows] = await pool.query(
			`SELECT
				 COALESCE(SUM(lc.prixTTC), 0) AS revenue,
				 COALESCE(SUM(lc.quantite), 0) AS sales,
				 COALESCE(COUNT(DISTINCT c.idCommande), 0) AS orders
			 FROM LigneCommande lc
			 JOIN Produit p ON p.idProduit = lc.idProduit
			 JOIN Commande c ON c.idCommande = lc.idCommande
			 WHERE p.idProfessionnel = ?${companyFilter}
				 AND c.dateCommande >= DATE_SUB(CURDATE(), INTERVAL 60 DAY)
				 AND c.dateCommande < DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
			[idProfessionnel, ...companyParams]
		);

		const [stockRows] = await pool.query(
			`SELECT
				 COALESCE(COUNT(*), 0) AS totalProducts,
				 COALESCE(SUM(CASE WHEN stock <= 0 THEN 1 ELSE 0 END), 0) AS outOfStockProducts
			 FROM Produit p
			 WHERE p.idProfessionnel = ?${companyFilter}`,
			[idProfessionnel, ...companyParams]
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
			 WHERE p.idProfessionnel = ?${companyFilter}
				 AND c.dateCommande >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
			 GROUP BY monthKey, monthLabel
			 ORDER BY monthKey`,
			[idProfessionnel, ...companyParams]
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
			 WHERE p.idProfessionnel = ?${companyFilter}
			 GROUP BY p.idProduit, p.nom
			 ORDER BY sales DESC
			 LIMIT 5`,
			[idProfessionnel, ...companyParams]
		);

		const [channelsRows] = await pool.query(
			`SELECT
				 COALESCE(c.modeLivraison, 'non_renseigne') AS name,
				 COUNT(DISTINCT c.idCommande) AS value
			 FROM LigneCommande lc
			 JOIN Produit p ON p.idProduit = lc.idProduit
			 JOIN Commande c ON c.idCommande = lc.idCommande
			 WHERE p.idProfessionnel = ?${companyFilter}
			 GROUP BY COALESCE(c.modeLivraison, 'non_renseigne')
			 ORDER BY value DESC`,
			[idProfessionnel, ...companyParams]
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
				 WHERE p.idProfessionnel = ?${companyFilter}
				 GROUP BY c.idCommande, c.idParticulier
			 ) AS perOrder
			 JOIN Commande c ON c.idCommande = perOrder.idCommande
			 LEFT JOIN Particulier particulier ON particulier.idParticulier = c.idParticulier
			 LEFT JOIN Utilisateur u ON u.id = particulier.id
			 GROUP BY customer
			 ORDER BY revenue DESC
			 LIMIT 5`,
			[idProfessionnel, ...companyParams]
		);

		const [recentOrdersRows] = await pool.query(
			`SELECT
				c.idCommande,
				c.dateCommande,
				c.modeLivraison,
				c.status,
				ROUND(COALESCE(SUM(lc.prixTTC), 0), 2) AS total
			 FROM Commande c
			 JOIN LigneCommande lc ON lc.idCommande = c.idCommande
			 JOIN Produit p ON p.idProduit = lc.idProduit
			 WHERE p.idProfessionnel = ?${companyFilter}
			 GROUP BY c.idCommande, c.dateCommande, c.modeLivraison, c.status
			 ORDER BY c.dateCommande DESC
			 LIMIT 12`,
			[idProfessionnel, ...companyParams]
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
			scope: {
				idEntreprise: scopedCompanyId || null
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
			})),
			recentOrders: recentOrdersRows.map((row) => ({
				idCommande: row.idCommande,
				dateCommande: row.dateCommande,
				modeLivraison: row.modeLivraison,
				status: row.status,
				total: Number(row.total),
			}))
		});
	} catch (error) {
		return next(error);
	}
});

router.get('/:idProfessionnel/documents/commande/:idCommande/facture', requireProfessionalSession, async (req, res, next) => {
	const idProfessionnel = Number(req.params.idProfessionnel);
	const idCommande = Number(req.params.idCommande);
	const requestedCompanyId = parseCompanyId(req.query?.idEntreprise);

	if (!Number.isInteger(idProfessionnel) || idProfessionnel <= 0) {
		return res.status(400).json({ error: 'Identifiant professionnel invalide.' });
	}

	if (!Number.isInteger(idCommande) || idCommande <= 0) {
		return res.status(400).json({ error: 'Identifiant commande invalide.' });
	}
	if (Number.isNaN(requestedCompanyId)) {
		return res.status(400).json({ error: 'Identifiant entreprise invalide.' });
	}

	if (req.businessProfile.professionnel.id !== idProfessionnel) {
		return res.status(403).json({ error: 'Acces interdit pour ce professionnel.' });
	}

	try {
		const scopedCompanyId = await resolveScopedCompanyId(idProfessionnel, requestedCompanyId);
		if (requestedCompanyId != null && !scopedCompanyId) {
			return res.status(403).json({ error: 'Entreprise non autorisee pour ce professionnel.' });
		}
		const [lineRows] = await pool.query(
			`SELECT
				p.idProduit,
				p.nom,
				lc.quantite,
				lc.prixTTC
			 FROM LigneCommande lc
			 JOIN Produit p ON p.idProduit = lc.idProduit
			 WHERE lc.idCommande = ?
			   AND p.idProfessionnel = ?
			   ${scopedCompanyId != null ? 'AND p.idEntreprise = ?' : ''}
			 ORDER BY p.nom ASC`,
			scopedCompanyId != null ? [idCommande, idProfessionnel, scopedCompanyId] : [idCommande, idProfessionnel]
		);

		if (!lineRows.length) {
			return res.status(404).json({ error: 'Commande introuvable pour ce professionnel.' });
		}

		const [[orderRow]] = await pool.query(
			`SELECT
				c.idCommande,
				c.dateCommande,
				c.modeLivraison,
				c.status,
				COALESCE(
					NULLIF(CONCAT(uPart.prenom, ' ', uPart.nom), ' '),
					NULLIF(CONCAT(uPro.prenom, ' ', uPro.nom), ' '),
					'Client inconnu'
				) AS clientNom
			 FROM Commande c
			 LEFT JOIN Particulier part ON part.idParticulier = c.idParticulier
			 LEFT JOIN Utilisateur uPart ON uPart.id = part.id
			 LEFT JOIN Professionnel proClient ON proClient.idProfessionnel = c.idProfessionnel
			 LEFT JOIN Utilisateur uPro ON uPro.id = proClient.id
			 WHERE c.idCommande = ?
			 LIMIT 1`,
			[idCommande]
		);

		const total = lineRows.reduce((sum, row) => sum + Number(row.prixTTC || 0), 0);

		const content = [
			`FACTURE COMMANDE #${idCommande}`,
			`Professionnel: ${idProfessionnel}`,
			`Date commande: ${orderRow?.dateCommande ? new Date(orderRow.dateCommande).toISOString() : 'N/A'}`,
			`Client: ${orderRow?.clientNom || 'Client inconnu'}`,
			`Mode livraison: ${orderRow?.modeLivraison || 'N/A'}`,
			`Statut: ${orderRow?.status || 'N/A'}`,
			'',
			'Produits',
			'----------------------------------------',
			...lineRows.map((row) => `${row.nom} | qte=${Number(row.quantite)} | montant=${Number(row.prixTTC).toFixed(2)} EUR`),
			'----------------------------------------',
			`TOTAL: ${total.toFixed(2)} EUR`,
		].join('\n');

		res.setHeader('Content-Type', 'text/plain; charset=utf-8');
		res.setHeader('Content-Disposition', `attachment; filename="facture-commande-${idCommande}-pro-${idProfessionnel}.txt"`);
		return res.status(200).send(content);
	} catch (error) {
		return next(error);
	}
});

router.get('/:idProfessionnel/documents/commande/:idCommande/facture.pdf', requireProfessionalSession, async (req, res, next) => {
	const idProfessionnel = Number(req.params.idProfessionnel);
	const idCommande = Number(req.params.idCommande);
	const requestedCompanyId = parseCompanyId(req.query?.idEntreprise);

	if (!Number.isInteger(idProfessionnel) || idProfessionnel <= 0) {
		return res.status(400).json({ error: 'Identifiant professionnel invalide.' });
	}

	if (!Number.isInteger(idCommande) || idCommande <= 0) {
		return res.status(400).json({ error: 'Identifiant commande invalide.' });
	}
	if (Number.isNaN(requestedCompanyId)) {
		return res.status(400).json({ error: 'Identifiant entreprise invalide.' });
	}

	if (req.businessProfile.professionnel.id !== idProfessionnel) {
		return res.status(403).json({ error: 'Acces interdit pour ce professionnel.' });
	}

	try {
		const scopedCompanyId = await resolveScopedCompanyId(idProfessionnel, requestedCompanyId);
		if (requestedCompanyId != null && !scopedCompanyId) {
			return res.status(403).json({ error: 'Entreprise non autorisee pour ce professionnel.' });
		}
		const [lineRows] = await pool.query(
			`SELECT
				p.idProduit,
				p.nom,
				lc.quantite,
				lc.prixTTC
			 FROM LigneCommande lc
			 JOIN Produit p ON p.idProduit = lc.idProduit
			 WHERE lc.idCommande = ?
			   AND p.idProfessionnel = ?
			   ${scopedCompanyId != null ? 'AND p.idEntreprise = ?' : ''}
			 ORDER BY p.nom ASC`,
			scopedCompanyId != null ? [idCommande, idProfessionnel, scopedCompanyId] : [idCommande, idProfessionnel]
		);

		if (!lineRows.length) {
			return res.status(404).json({ error: 'Commande introuvable pour ce professionnel.' });
		}

		const [[orderRow]] = await pool.query(
			`SELECT
				c.idCommande,
				c.dateCommande,
				c.modeLivraison,
				c.status,
				COALESCE(
					NULLIF(CONCAT(uPart.prenom, ' ', uPart.nom), ' '),
					NULLIF(CONCAT(uPro.prenom, ' ', uPro.nom), ' '),
					'Client inconnu'
				) AS clientNom
			 FROM Commande c
			 LEFT JOIN Particulier part ON part.idParticulier = c.idParticulier
			 LEFT JOIN Utilisateur uPart ON uPart.id = part.id
			 LEFT JOIN Professionnel proClient ON proClient.idProfessionnel = c.idProfessionnel
			 LEFT JOIN Utilisateur uPro ON uPro.id = proClient.id
			 WHERE c.idCommande = ?
			 LIMIT 1`,
			[idCommande]
		);

		const total = lineRows.reduce((sum, row) => sum + Number(row.prixTTC || 0), 0);
		const fileName = `facture-commande-${idCommande}-pro-${idProfessionnel}.pdf`;

		res.setHeader('Content-Type', 'application/pdf');
		res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

		const doc = new PDFDocument({ margin: 50, size: 'A4' });
		doc.pipe(res);

		doc.fontSize(20).text('FACTURE', { align: 'left' });
		doc.moveDown(0.5);
		doc.fontSize(11);
		doc.text(`Commande #${idCommande}`);
		doc.text(`Professionnel #${idProfessionnel}`);
		doc.text(`Date: ${orderRow?.dateCommande ? new Date(orderRow.dateCommande).toLocaleDateString('fr-FR') : 'N/A'}`);
		doc.text(`Client: ${orderRow?.clientNom || 'Client inconnu'}`);
		doc.text(`Mode livraison: ${orderRow?.modeLivraison || 'N/A'}`);
		doc.text(`Statut: ${orderRow?.status || 'N/A'}`);

		doc.moveDown(1);
		doc.fontSize(13).text('Lignes de commande');
		doc.moveDown(0.5);

		for (const row of lineRows) {
			doc
				.fontSize(10)
				.text(
					`${row.nom}  |  Quantite: ${Number(row.quantite)}  |  Montant: ${Number(row.prixTTC || 0).toFixed(2)} EUR`
				);
		}

		doc.moveDown(1);
		doc.fontSize(12).text(`TOTAL: ${total.toFixed(2)} EUR`, { align: 'right' });
		doc.moveDown(2);
		doc.fontSize(9).fillColor('#666666').text('Document genere automatiquement par ENSSAT Market.', { align: 'left' });

		doc.end();
		return undefined;
	} catch (error) {
		return next(error);
	}
});

router.get('/:idProfessionnel/documents/ventes.csv', requireProfessionalSession, async (req, res, next) => {
	const idProfessionnel = Number(req.params.idProfessionnel);
	const requestedCompanyId = parseCompanyId(req.query?.idEntreprise);

	if (!Number.isInteger(idProfessionnel) || idProfessionnel <= 0) {
		return res.status(400).json({ error: 'Identifiant professionnel invalide.' });
	}
	if (Number.isNaN(requestedCompanyId)) {
		return res.status(400).json({ error: 'Identifiant entreprise invalide.' });
	}

	if (req.businessProfile.professionnel.id !== idProfessionnel) {
		return res.status(403).json({ error: 'Acces interdit pour ce professionnel.' });
	}

	const days = Number.parseInt(String(req.query.days || '90'), 10);
	const safeDays = Number.isInteger(days) && days > 0 && days <= 365 ? days : 90;

	try {
		const scopedCompanyId = await resolveScopedCompanyId(idProfessionnel, requestedCompanyId);
		if (requestedCompanyId != null && !scopedCompanyId) {
			return res.status(403).json({ error: 'Entreprise non autorisee pour ce professionnel.' });
		}
		const [rows] = await pool.query(
			`SELECT
				c.idCommande,
				DATE_FORMAT(c.dateCommande, '%Y-%m-%d %H:%i:%s') AS dateCommande,
				c.modeLivraison,
				c.status,
				p.idProduit,
				p.nom AS produit,
				lc.quantite,
				lc.prixTTC
			 FROM LigneCommande lc
			 JOIN Produit p ON p.idProduit = lc.idProduit
			 JOIN Commande c ON c.idCommande = lc.idCommande
			 WHERE p.idProfessionnel = ?
			   ${scopedCompanyId != null ? 'AND p.idEntreprise = ?' : ''}
			   AND c.dateCommande >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
			 ORDER BY c.dateCommande DESC, c.idCommande DESC`,
			scopedCompanyId != null ? [idProfessionnel, scopedCompanyId, safeDays] : [idProfessionnel, safeDays]
		);

		const headers = ['idCommande', 'dateCommande', 'modeLivraison', 'status', 'idProduit', 'produit', 'quantite', 'prixTTC'];
		const lines = [headers.join(',')];

		for (const row of rows) {
			lines.push([
				csvEscape(row.idCommande),
				csvEscape(row.dateCommande),
				csvEscape(row.modeLivraison),
				csvEscape(row.status),
				csvEscape(row.idProduit),
				csvEscape(row.produit),
				csvEscape(row.quantite),
				csvEscape(Number(row.prixTTC || 0).toFixed(2)),
			].join(','));
		}

		const csvContent = lines.join('\n');

		res.setHeader('Content-Type', 'text/csv; charset=utf-8');
		res.setHeader('Content-Disposition', `attachment; filename="rapport-ventes-pro-${idProfessionnel}-${safeDays}j.csv"`);
		return res.status(200).send(csvContent);
	} catch (error) {
		return next(error);
	}
});

export default router;
