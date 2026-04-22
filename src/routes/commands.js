const express = require('express');
const router = express.Router();
const pool = require('../server_config/db.js');
const moment = require('moment-timezone');



/**
 * @openapi
 * /commands:
 *   get:
 *     summary: Get commands
 *     responses:
 *       200:
 *         description: List of commands
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   idCommand:
 *                     type: integer
 *                   dateCommand:
 *                     type: date
 *                   modeLivraison:
 *                     type: string
 *                   prixTotal:
 *                     type: integer
 *                   status:
 *                      type: string
 */
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT idCommande as idCommand, dateCommande as dateCommand, modeLivraison, prixTotal, status FROM Commande');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /commands:
 *   post:
 *     summary: Create a command
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               idCommand:
 *                 type: integer
 *               dateCommand:
 *                 type: date
 *               modeLivraison:
 *                 type: string
 *               prixTotal:
 *                 type: integer
 *               status:
 *                 type: string = "Not delivered" 
 * 
 *     responses:
 *       201:
 *         description: Created command
 */
router.post('/', async (req, res, next) => {
  try {
    const { modeLivraison, prixTotal } = req.body;
    const dateCommande = moment().format('YYYY-MM-DD HH:mm:ss');
    if (!modeLivraison || !prixTotal) return res.status(400).json({ error: 'modeLivraison and prixTotal required' });
    const [result] = await pool.execute('INSERT INTO Commande (dateCommande, modeLivraison, prixTotal, status) VALUES (?, ?, ?, ?)', [dateCommande, modeLivraison, prixTotal, 'en_attente']);
    res.status(201).json({ message: 'Command created successfully', idCommand: result.insertId });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /commands/{idCommand}:
 *   delete:
 *     summary: Delete a command
 *     parameters:
 *       - in: path
 *         name: idCommand
 *         required: true
 *         schema:
 *           type: integer
 *         description: The command ID
 *     responses:
 *       200:
 *         description: Command deleted successfully
 *       404:
 *         description: Command not found
 */
router.delete('/:idCommand', async (req, res, next) => {
  try {
    const { idCommand } = req.params;
    if (!idCommand) return res.status(400).json({ error: 'idCommand required' });
    const [result] = await pool.execute('DELETE FROM Commande WHERE idCommande = ?', [idCommand]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Command not found' });
    res.status(200).json({ message: 'Command deleted successfully' });
  } catch (err) {
    next(err);
  }
});



module.exports = router;
