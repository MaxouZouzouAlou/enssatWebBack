const express = require('express');
const router = express.Router();
const pool = require('../server_config/db.js');

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
		const [rows] = await pool.query('SELECT * FROM produit');
		res.json(rows);
	} catch (err) {
		next(err);
	}
});

module.exports = router;
