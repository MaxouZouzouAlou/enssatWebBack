const express = require('express');
const router = express.Router();
const pool = require('../server_config/db.js');

/**
 * @openapi
 * /shoppingCart:
 *   get:
 *     summary: Get shopping carts
 *     responses:
 *       200:
 *         description: List of shopping cart objects
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   idPanier:
 *                     type: integer
 *                   nom:
 *                     type: string
 *                   idClient:
 *                     type: int
 */
router.get('/', async (req, res, next) => {
    try {
        const [rows] = await pool.query('SELECT * FROM Panier');
        res.json(rows);
    }
    catch (err) { next(err); }
});

/**
 * @openapi
 * /shoppingCart/:id:
 *   get:
 *     summary: Get a shopping cart specified by ID
 *     responses:
 *       200:
 *         description: Shopping cart object
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   idPanier:
 *                     type: integer
 *                   nom:
 *                     type: string
 *                   idClient:
 *                     type: int
 */
router.get('/:id', async (req, res, next) => {
    try {
        // Accept id from params, body or query for consistency
        const id = req.params?.id ?? req.body?.idPanier ?? req.query?.idPanier;
        if (typeof id === 'undefined') return res.status(400).json({ error: 'idPanier is required' });

        const [rows] = await pool.query('SELECT * FROM Panier WHERE idPanier = ?', [id]);
        res.status(200).json(rows[0]);
    }
    catch (err) { next(err); }
});

/**
 * @openapi
 * /shoppingCart/:id/items:
 *   get:
 *     summary: Get items of a shopping cart specified by id
 *     responses:
 *       200:
 *         description: List of items from a shopping cart
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   idPanier:
 *                     type: integer
 *                   nom:
 *                     type: string
 *                   idClient:
 *                     type: int
 * 
 */
router.get('/:id/items', async (req, res, next) => {
    try {
        // Accept id from params, body or query for consistency
        const id = req.params?.id ?? req.body?.idPanier ?? req.query?.idPanier;
        if (typeof id === 'undefined') return res.status(400).json({ error: 'idPanier is required' });

        // Get products details from the view for the given cart
        const [rows] = await pool.query('SELECT * FROM Vue_Panier_Produit WHERE idPanier = ?', [id]);
        res.status(200).json(rows);
    }
    catch (err) { next(err); }
});

/**
 * @openapi
 * /shoppingCart/individual/:id:
 *   get:
 *     summary: Get shopping carts of an individual specified by ID
 *     responses:
 *       200:
 *         description: List of shopping carts from an individual
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   idPanier:
 *                     type: integer
 *                   nom:
 *                     type: string
 *                   idClient:
 *                     type: int
 */
router.get('/individual/:id', async (req, res, next) => {
    try {
        const id = req.params?.id ?? req.body?.idParticulier ?? req.query?.idParticulier;
        if (typeof id === 'undefined') return res.status(400).json({ error: 'idParticulier is required' });

        const [rows] = await pool.query('SELECT * FROM Panier WHERE idParticulier = ?', [id]);
        res.status(200).json(rows);
    }
    catch (err) { next(err); }
});

/**
 * @openapi
 * /shoppingCart/item:
 *   post:
 *     summary: Create a shopping cart item
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               idPanier:
 *                 type: integer
 *               nom:
 *                 type: string
 *               idClient:
 *                 type: int
 *     responses:
 *       201:
 *         description: Created shopping cart item
 */
router.post('/item', async (req, res, next) => {
    try {
        const { idPanier, idProduit } = req.body;
        let result;

        let errorMsg = "";
        let error = false;
        if (!idPanier) {
            error = true;
            errorMsg += "Shopping cart ID is required. "
        }
        if (!idProduit) {
            error = true;
            errorMsg += "Product ID is required. "
        }
        if (error) return res.status(400).json({ error: errorMsg });

        const [prod] = await pool.execute('SELECT * FROM Produit WHERE idProduit = ?', [idProduit]);
        if (prod[0].stock == 0) return res.status(409).json({ error: 'This product is out of stock.' });
        
        const [check] = await pool.execute('SELECT * FROM Panier_Produit WHERE idPanier = ? AND idProduit = ?', [idPanier, idProduit]);
        // If the product is already in the shopping cart, increase quantity by 1
        if (check.length > 0) {
            [result] = await pool.execute('UPDATE Panier_Produit SET quantite = ? WHERE idPanier = ? AND idProduit = ?', [check[0].quantite + 1, idPanier, idProduit]);
        } else {
            [result] = await pool.execute('INSERT INTO Panier_Produit (idPanier, idProduit, quantite) VALUES (?, ?, ?)', [idPanier, idProduit, 1]);
        }

        res.status(201).json();
    }
    catch (err) {
        if (err && err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Some attributes already exists' });
        next(err);
    }
});


router.delete('/list', async (req, res, next) => {
    try {
        const idPanier = req.body?.idPanier ?? req.query?.idPanier ?? req.params?.idPanier;
        const idProduit = req.body?.idProduit ?? req.query?.idProduit ?? req.params?.idProduit;

        if (typeof idPanier === 'undefined' || typeof idProduit === 'undefined') return res.status(400).json({ error: 'idPanier and idProduit are required' });

        await pool.execute('DELETE FROM Panier_Produit WHERE idPanier = ? AND idProduit = ?', [idPanier, idProduit]);
        res.status(201).json();
    } catch (err) {
        if (err && err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Couldn\'t empty the shopping list.' });
        next(err);
    }
});


router.delete('/single', async (req, res, next) => {
    try {
        const idPanier = req.body?.idPanier ?? req.query?.idPanier ?? req.params?.idPanier;
        const idProduit = req.body?.idProduit ?? req.query?.idProduit ?? req.params?.idProduit;

        if (typeof idPanier === 'undefined' || typeof idProduit === 'undefined') return res.status(400).json({ error: 'idPanier and idProduit are required' });

        const [rows] = await pool.execute('SELECT quantite FROM Panier_Produit WHERE idPanier = ? AND idProduit = ?', [idPanier, idProduit]);
        const current = rows[0];
        if (!current) return res.status(404).json({ error: 'Item not found in cart' });

        if (current.quantite > 1) {
            await pool.execute('UPDATE Panier_Produit SET quantite = ? WHERE idPanier = ? AND idProduit = ?', [current.quantite - 1, idPanier, idProduit]);
        } else {
            await pool.execute('DELETE FROM Panier_Produit WHERE idPanier = ? AND idProduit = ?', [idPanier, idProduit]);
        }

        res.status(201).json();
    } catch (err) {
        if (err && err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Couldn\'t remove item.' });
        next(err);
    }
});

/**
 * @openapi
 * /shoppingCart/empty:
 *   delete:
 *     summary: Empty a shopping cart
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               idPanier:
 *                 type: integer
 *               nom:
 *                 type: string
 *               idClient:
 *                 type: int
 */
router.delete('/empty', async (req, res, next) => {
    try {
        const idPanier = req.body?.idPanier ?? req.query?.idPanier ?? req.params?.idPanier;
        if (typeof idPanier === 'undefined') return res.status(400).json({ error: 'idPanier is required' });

        await pool.execute('DELETE FROM Panier_Produit WHERE idPanier = ?', [idPanier]);
        res.status(201).json();
    } catch (err) {
        if (err && err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Couldn\'t empty the shopping list.' });
        next(err);
    }
});

module.exports = router;