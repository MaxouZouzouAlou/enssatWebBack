import express from 'express';
import pool from '../server_config/db.js';

const router = express.Router();

/**
 * @openapi
 * /users:
 *   get:
 *     summary: Get users
 *     responses:
 *       200:
 *         description: List of users
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
 *                   email:
 *                     type: string
 */
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM users');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /users:
 *   post:
 *     summary: Create user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *     responses:
 *       201:
 *         description: Created user
 */
router.post('/', async (req, res, next) => {
  try {
    const { name, email } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'name and email required' });
    const [result] = await pool.execute('INSERT INTO users (name, email) VALUES (?, ?)', [name, email]);
    const insertedId = result.insertId;
    const [rows] = await pool.query('SELECT id, name, email FROM users WHERE id = ?', [insertedId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'email already exists' });
    next(err);
  }
});

export default router;
