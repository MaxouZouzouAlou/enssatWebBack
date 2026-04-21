const express = require('express');
const router = express.Router();
const pool = require('../server_config/db.js');

/**
 * @openapi
 * /shoppingList:
 *   get:
 *     summary: Get shopping lists
 *     responses:
 *       200:
 *         description: List of shopping list objects
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
 * /shoppingList/:id:
 *   get:
 *     summary: Get a shopping list specified by ID
 *     responses:
 *       200:
 *         description: Shopping list object
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
 * /shoppingList/:id/items:
 *   get:
 *     summary: Get items of a shopping list specified by id
 *     responses:
 *       200:
 *         description: List of items from a shopping list
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
        // Gets all the products linked to the given list ID
        const [rows] = await pool.query(`SELECT * FROM Panier_Produit WHERE idPanier=${req.params.id}`);
        const items = [];

        rows.forEach((idPanier, idProduit, quantite) => {
            items.push(await pool.query(`SELECT * FROM Produit WHERE idProduit=${idProduit}`))
        });

        res.json(items);
    }
    catch (err) { next(err); }
});


/**
 * @openapi
 * /shoppingList/individual:
 *   get:
 *     summary: Get shopping lists of individuals
 *     responses:
 *       200:
 *         description: List of shopping lists of individuals
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
 * /shoppingList/individual/:id:
 *   get:
 *     summary: Get shopping lists of an individual specified by ID
 *     responses:
 *       200:
 *         description: List of shopping lists from an individual
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
 * /shoppingList/professional:
 *   get:
 *     summary: Get shopping lists of professionals
 *     responses:
 *       200:
 *         description: List of shopping lists of professionals
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
 * /shoppingList/professional/:id:
 *   get:
 *     summary: Get shopping lists of a professional specified by ID
 *     responses:
 *       200:
 *         description: List of shopping lists from a professional
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
 * /shoppingList:
 *   post:
 *     summary: Create a shopping list
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
 * /shoppingList:
 *   post:
 *     summary: Create a shopping list
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
router.post('/item', async (req, res, next) => {
    try {
        const { idPanier, idProduit } = req.body;

        const errorMsg = "";
        const error = false;
        if (!idPanier) {
            error = true;
            errorMsg += "Shopping list ID is required. "
        }
        if (!idProduit) {
            error = true;
            errorMsg += "Product ID is required. "
        }
        if (error) return res.status(400).json({ error: errorMsg });

        const [prod] = await pool.execute('SELECT * FROM Produit WHERE idProduit = ?', [idProduit]);
        if (prod[0].stock == 0) return res.status(409).json({ error: 'This product is out of stock.' });
        
        const [check] = await pool.execute('SELECT * FROM Panier_Produit WHERE idPanier = ? AND idProduit = ?', [idPanier, idProduit]);
        // If the product is already in the shopping list, increase quantity by 1
        if (check.length > 0) {
            const [result] = await pool.execute('INSERT INTO Panier_Produit (idPanier, idProduit, quantite) VALUES (?, ?, ?)', [idPanier, idProduit, check[0].quantite + 1]);
        }
        // Else, insert the product into the shopping list with quantity 1
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
 * /shoppingList:
 *   delete:
 *     summary: Empty a shopping list
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
 * /shoppingList:
 *   delete:
 *     summary: Remove an item from a shopping list
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