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
 *                   type_utilisateur:
 *                     type: string
 *                   nom:
 *                     type: string
 *                   prenom:
 *                     type: string
 *                   email:
 *                     type: string
 */
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, type_utilisateur, nom, prenom, email, num_telephone, adresse_ligne, code_postal, ville
       FROM Utilisateur
       ORDER BY id ASC`
    );
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
 *               type_utilisateur:
 *                 type: string
 *               nom:
 *                 type: string
 *               prenom:
 *                 type: string
 *               email:
 *                 type: string
 *     responses:
 *       201:
 *         description: Created user
 */
router.post('/', async (req, res, next) => {
  try {
    const {
      type_utilisateur,
      nom,
      prenom,
      email,
      num_telephone,
      adresse_ligne,
      code_postal,
      ville
    } = req.body;

    if (!type_utilisateur || !nom || !prenom) {
      return res.status(400).json({ error: 'type_utilisateur, nom and prenom are required' });
    }

    const [result] = await pool.execute(
      `INSERT INTO Utilisateur (
        type_utilisateur, nom, prenom, email, num_telephone, adresse_ligne, code_postal, ville
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [type_utilisateur, nom, prenom, email || null, num_telephone || null, adresse_ligne || null, code_postal || null, ville || null]
    );
    const insertedId = result.insertId;
    const [rows] = await pool.query(
      `SELECT id, type_utilisateur, nom, prenom, email, num_telephone, adresse_ligne, code_postal, ville
       FROM Utilisateur
       WHERE id = ?`,
      [insertedId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'email already exists' });
    next(err);
  }
});

export default router;
