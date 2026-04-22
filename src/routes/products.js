import express from 'express';
import pool from '../server_config/db.js';

export default function createProductsRouter({ db = pool } = {}) {
const router = express.Router();

function parsePositiveInteger(value, fallback, max = 100) {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
	return Math.min(parsed, max);
}

/** 
 * @openapi
 * /products:
 *   get:
 *     summary: Get paginated visible products
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 9
 *     responses:
 *       200:
 *         description: Paginated products payload
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
router.get('/', async (req, res, next) => {
	try {
		const page = parsePositiveInteger(req.query.page, 1, 100000);
		const limit = parsePositiveInteger(req.query.limit, 9, 30);
		const offset = (page - 1) * limit;
		const [[countRow]] = await db.query('SELECT COUNT(*) AS total FROM Produit WHERE visible = TRUE');
		const [rows] = await db.query(
			`SELECT
				p.*,
				MIN(i.path) AS imagePath
			 FROM Produit p
			 LEFT JOIN Produit_Image pi ON pi.idProduit = p.idProduit
			 LEFT JOIN Image i ON i.idImage = pi.idImage
			 WHERE p.visible = TRUE
			 GROUP BY p.idProduit
			 ORDER BY p.idProduit
			 LIMIT ? OFFSET ?`,
			[limit, offset]
		);
		const total = Number(countRow?.total || 0);
		res.json({
			items: rows,
			page,
			limit,
			total,
			totalPages: Math.max(1, Math.ceil(total / limit))
		});
	} catch (err) {
		next(err);
	}
});

return router;
}
