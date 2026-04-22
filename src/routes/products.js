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
		const [rows] = await pool.query('SELECT * FROM Produit');
		res.json(rows);
	} catch (err) {
		next(err);
	}
});

export default router;