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
        // Gets the list ID and returns the associated shopping list object
        const [rows] = await pool.query(`SELECT * FROM Panier WHERE idPanier=${req.params.id}`);
        res.json(rows[0]);
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
        // Gets all the products linked to the given list ID (parameterized)
        const [rows] = await pool.query('SELECT * FROM Panier_Produit WHERE idPanier = ?', [req.params.id]);

        // Fetch each product row in parallel and return the product objects
        const items = await Promise.all(rows.map(async (r) => {
            const [prodRows] = await pool.query('SELECT * FROM Produit WHERE idProduit = ?', [r.idProduit]);
            return prodRows[0] || null;
        }));

        res.json(items);
    }
    catch (err) { next(err); }
});


/**
 * @openapi
 * /shoppingCart/individual:
 *   get:
 *     summary: Get shopping carts of individuals
 *     responses:
 *       200:
 *         description: List of shopping carts of individuals
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
router.get('/individual', async (req, res, next) => {
    try {
        const [rows] = await pool.query(`SELECT * FROM Panier WHERE idParticulier IS NOT NULL`);
        res.json(rows);
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
        const [rows] = await pool.query(`SELECT * FROM Panier WHERE idParticulier=${req.params.id}`);
        res.json(rows);
    }
    catch (err) { next(err); }
});


/**
 * @openapi
 * /shoppingCart/professional:
 *   get:
 *     summary: Get shopping carts of professionals
 *     responses:
 *       200:
 *         description: List of shopping carts of professionals
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
router.get('/professional', async (req, res, next) => {
    try {
        const [rows] = await pool.query(`SELECT * FROM Panier WHERE idProfessionnel IS NOT NULL`);
        res.json(rows);
    }
    catch (err) { next(err); }
});


/**
 * @openapi
 * /shoppingCart/professional/:id:
 *   get:
 *     summary: Get shopping carts of a professional specified by ID
 *     responses:
 *       200:
 *         description: List of shopping carts from a professional
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
router.get('/professional/:id', async (req, res, next) => {
    try {
        const [rows] = await pool.query(`SELECT * FROM Panier WHERE idProfessionnel=${req.params.id}`);
        res.json(rows);
    }
    catch (err) { next(err); }
});


/**
 * @openapi
 * /shoppingCart:
 *   post:
 *     summary: Create a shopping cart
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
 *         description: Created shopping list
 */
router.post('/', async (req, res, next) => {
    try {
        const { name, idIndividual, idProfessional } = req.body;

        const errorMsg = "";
        const error = false;
        if (!name) {
            error = true;
            errorMsg += "Name is required. "
        }
        if (!idIndividual && !idProfessional) {
            error = true;
            errorMsg += "An ID (Individual or Professional) is required. "
        }
        else if (idIndividual && idProfessional) {
            error = true;
            errorMsg += "Only provide a singular ID (Individual or Professional). "
        }

        if (error) return res.status(400).json({ error: errorMsg });
        // Insert the new shopping list linked to an individual
        if (idIndividual) {
            const [result] = await pool.execute('INSERT INTO Panier (nom, estLivrable, idParticulier) VALUES (?, ?, ?)', [name, true, idIndividual]);
            const insertedId = result.insertId;
            const [rows] = await pool.query('SELECT idPanier, nom, estLivrable, idParticulier FROM Panier WHERE id = ?', [insertedId]);
        }
        // Insert the new shopping list linked to a professional
        else {
            const [result] = await pool.execute('INSERT INTO Panier (nom, estLivrable, idProfessionnel) VALUES (?, ?, ?)', [name, true, idProfessional]);
            const insertedId = result.insertId;
            const [rows] = await pool.query('SELECT idPanier, nom, estLivrable, idProfessionnel FROM Panier WHERE id = ?', [insertedId]);
        }
        res.status(201).json(rows[0]);
    }
    catch (err) {
        if (err && err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Some attributes already exists' });
        next(err);
    }
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

        const errorMsg = "";
        const error = false;
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
            const [result] = await pool.execute('INSERT INTO Panier_Produit (idPanier, idProduit, quantite) VALUES (?, ?, ?)', [idPanier, idProduit, check[0].quantite + 1]);
        }
        // Else, insert the product into the shopping cart with quantity 1
        else {
            const [result] = await pool.execute('INSERT INTO Panier_Produit (idPanier, idProduit, quantite) VALUES (?, ?, ?)', [idPanier, idProduit, 1]);
        }

        const insertedId = result.insertId;
        const [rows] = await pool.query('SELECT idPanier, idProduit, quantite FROM Panier_Produit WHERE id = ?', [insertedId]);
        res.status(201).json(rows[0]);
    }
    catch (err) {
        if (err && err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Some attributes already exists' });
        next(err);
    }
});


/**
 * @openapi
 * /shoppingCart:
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
router.delete('/list', async (req, res, next) => {
    try {
        const [result] = await pool.execute('DELETE FROM Panier_Produit WHERE idPanier = ?', [req.params.idPanier]);
        res.status(201);
    } catch (err) {
        if (err && err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Couldn\'t empty the shopping list.' });
        next(err);
    }
});


/**
 * @openapi
 * /shoppingCart/item:
 *   delete:
 *     summary: Remove an item from a shopping cart
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
router.delete('/single', async (req, res, next) => {
    try {
        const [result] = await pool.execute('DELETE FROM Panier_Produit WHERE idPanier = ? and idProduit = ?', [req.params.idPanier, req.params.idProduit]);
        res.status(201);
    } catch (err) {
        if (err && err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Couldn\'t remove item.' });
        next(err);
    }
});

module.exports = router;