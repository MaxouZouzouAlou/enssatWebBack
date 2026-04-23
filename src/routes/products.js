import express from 'express';
import pool from '../server_config/db.js';

const router = express.Router();


/** 
 * @openapi
 * /products:
 *   get:
 *     summary: Get products
 *     responses:
 *       200:
 *         description: List of products
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   name:
 *                     type: string
 *                   price:
 *                     type: number
 */
router.get('/', async (req, res, next) => {
	try {
		const [rows] = await pool.query(
			`SELECT
				p.*,
				COALESCE(vp.noteMoyenne, 0) AS noteMoyenneProduit,
				COALESCE(vp.nombreAvis, 0) AS nombreAvisProduit,
				COALESCE(vpro.noteMoyenne, 0) AS noteMoyenneProducteur,
				COALESCE(vpro.nombreAvis, 0) AS nombreAvisProducteur
			 FROM Produit p
			 LEFT JOIN Vue_Note_Moyenne_Produit vp ON vp.idProduit = p.idProduit
			 LEFT JOIN Vue_Note_Moyenne_Professionnel vpro ON vpro.idProfessionnel = p.idProfessionnel
			 ORDER BY p.idProduit ASC`
		);
		res.json(rows);
	} catch (err) {
		next(err);
	}
});

export default router;