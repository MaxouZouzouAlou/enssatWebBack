import express from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../auth.js';
import pool from '../server_config/db.js';
import { getBusinessProfileByAuthUserId } from '../services/auth-profile-service.js';

export function createShoppingCartRouter({
    authClient = auth,
    db = pool,
    getProfileByAuthUserId = getBusinessProfileByAuthUserId,
    headersFromNode = fromNodeHeaders
} = {}) {
const router = express.Router();

async function getSessionProfile(req) {
    const session = await authClient.api.getSession({
        headers: headersFromNode(req.headers)
    });

    if (!session) return { session: null, profile: null };

    const profile = await getProfileByAuthUserId(session.user.id);
    return { session, profile };
}

function getCartOwner(profile) {
    if (profile?.particulier?.id) {
        return {
            column: 'idParticulier',
            id: profile.particulier.id,
            cartName: `Panier de ${profile.user.prenom || profile.user.nom || 'client'}`,
            deliverable: true
        };
    }

    if (profile?.professionnel?.id) {
        return {
            column: 'idProfessionnel',
            id: profile.professionnel.id,
            cartName: `Panier pro de ${profile.user.prenom || profile.user.nom || 'professionnel'}`,
            deliverable: false
        };
    }

    return null;
}

function parsePositiveInteger(value) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parsePositiveQuantity(value) {
    const parsed = Number(value ?? 1);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Number(parsed.toFixed(3));
}

async function requireProfile(req, res) {
    const { session, profile } = await getSessionProfile(req);

    if (!session) {
        res.status(401).json({ error: 'Non authentifié.' });
        return null;
    }

    if (!profile) {
        res.status(404).json({ error: 'Profil introuvable.' });
        return null;
    }

    const owner = getCartOwner(profile);
    if (!owner) {
        res.status(404).json({ error: 'Aucun panier disponible pour ce compte.' });
        return null;
    }

    return { session, profile, owner };
}

async function getOwnedCartById(idPanier, owner) {
    const [rows] = await db.query(
        `SELECT * FROM Panier WHERE idPanier = ? AND ${owner.column} = ? LIMIT 1`,
        [idPanier, owner.id]
    );
    return rows[0] || null;
}

async function getOrCreateCurrentCart(owner) {
    const [rows] = await db.query(
        `SELECT * FROM Panier WHERE ${owner.column} = ? LIMIT 1`,
        [owner.id]
    );

    if (rows[0]) return rows[0];

    const [result] = await db.execute(
        `INSERT INTO Panier (nom, estLivrable, ${owner.column}) VALUES (?, ?, ?)`,
        [owner.cartName, owner.deliverable, owner.id]
    );
    const [createdRows] = await db.query('SELECT * FROM Panier WHERE idPanier = ? LIMIT 1', [result.insertId]);
    return createdRows[0] || null;
}

async function resolveOwnedCart(req, res, { createIfMissing = true } = {}) {
    const context = await requireProfile(req, res);
    if (!context) return null;

    const rawId = req.params?.id ?? req.body?.idPanier ?? req.query?.idPanier;
    if (typeof rawId !== 'undefined') {
        const idPanier = parsePositiveInteger(rawId);
        if (!idPanier) {
            res.status(400).json({ error: 'Identifiant panier invalide.' });
            return null;
        }

        const cart = await getOwnedCartById(idPanier, context.owner);
        if (!cart) {
            res.status(403).json({ error: 'Acces interdit pour ce panier.' });
            return null;
        }
        return { ...context, cart };
    }

    if (!createIfMissing) {
        res.status(400).json({ error: 'idPanier is required' });
        return null;
    }

    const cart = await getOrCreateCurrentCart(context.owner);
    if (!cart) {
        res.status(404).json({ error: 'Aucun panier disponible pour ce compte.' });
        return null;
    }

    return { ...context, cart };
}

async function getValidatedProduct(idProduit, requestedQuantity, currentQuantity = 0) {
    const productId = parsePositiveInteger(idProduit);
    if (!productId) {
        return { status: 400, error: 'Product ID is required.' };
    }

    const [products] = await db.execute('SELECT * FROM Produit WHERE idProduit = ?', [productId]);
    const product = products[0];
    if (!product) {
        return { status: 404, error: 'Produit introuvable.' };
    }

    const quantity = parsePositiveQuantity(requestedQuantity);
    if (!quantity) {
        return { status: 400, error: 'Quantite invalide.' };
    }

    const isUnitProduct = product.unitaireOuKilo === 1 || product.unitaireOuKilo === true;
    if (isUnitProduct && !Number.isInteger(quantity)) {
        return { status: 400, error: 'La quantite doit etre entiere pour ce produit.' };
    }

    const nextQuantity = Number(currentQuantity) + quantity;
    if (nextQuantity > Number(product.stock)) {
        return { status: 409, error: 'Stock insuffisant pour ce produit.' };
    }

    return { product, productId, quantity };
}

/**
 * @openapi
 * /shoppingCart/me:
 *   post:
 *     summary: Resolve the authenticated user's current shopping cart
 *     description: Creates a cart for the authenticated profile when none exists yet.
 *     responses:
 *       200:
 *         description: Current shopping cart
 *       401:
 *         description: Unauthenticated
 *       404:
 *         description: Business profile or cart owner not found
 */
router.post('/me', async (req, res, next) => {
    try {
        const context = await resolveOwnedCart(req, res);
        if (!context) return;
        return res.json(context.cart);
    } catch (err) {
        next(err);
    }
});

/**
 * @openapi
 * /shoppingCart/me/items:
 *   get:
 *     summary: Get items from the authenticated user's current shopping cart
 *     description: The cart is resolved from the session; clients do not need to send idPanier.
 *     responses:
 *       200:
 *         description: Current cart items
 *       401:
 *         description: Unauthenticated
 *       404:
 *         description: Business profile or cart owner not found
 */
router.get('/me/items', async (req, res, next) => {
    try {
        const context = await resolveOwnedCart(req, res);
        if (!context) return;

        const [rows] = await db.query('SELECT * FROM Vue_Panier_Produit WHERE idPanier = ?', [context.cart.idPanier]);
        res.status(200).json(rows);
    } catch (err) {
        next(err);
    }
});


/**
 * @openapi
 * /shoppingCart:
 *   get:
 *     summary: Get current user's shopping carts
 *     description: Returns only carts owned by the authenticated profile.
 *     responses:
 *       200:
 *         description: Owned shopping carts
 *       401:
 *         description: Unauthenticated
 */
router.get('/', async (req, res, next) => {
    try {
        const context = await requireProfile(req, res);
        if (!context) return;

        const [rows] = await db.query(
            `SELECT * FROM Panier WHERE ${context.owner.column} = ?`,
            [context.owner.id]
        );
        res.json(rows);
    }
    catch (err) { next(err); }
});

/**
 * @openapi
 * /shoppingCart/{id}:
 *   get:
 *     summary: Get an owned shopping cart by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Owned shopping cart
 *       400:
 *         description: Invalid cart ID
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Cart does not belong to the authenticated profile
 */
router.get('/:id', async (req, res, next) => {
    try {
        const context = await resolveOwnedCart(req, res, { createIfMissing: false });
        if (!context) return;
        res.status(200).json(context.cart);
    }
    catch (err) { next(err); }
});

/**
 * @openapi
 * /shoppingCart/{id}/items:
 *   get:
 *     summary: Get items of an owned shopping cart
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Owned cart items
 *       400:
 *         description: Invalid cart ID
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Cart does not belong to the authenticated profile
 */
router.get('/:id/items', async (req, res, next) => {
    try {
        const context = await resolveOwnedCart(req, res, { createIfMissing: false });
        if (!context) return;

        const [rows] = await db.query('SELECT * FROM Vue_Panier_Produit WHERE idPanier = ?', [context.cart.idPanier]);
        res.status(200).json(rows);
    }
    catch (err) { next(err); }
});

/**
 * @openapi
 * /shoppingCart/item:
 *   post:
 *     summary: Add a product to the current user's shopping cart
 *     description: The cart is resolved from the session. Decimal quantities are accepted only for kilo products.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - idProduit
 *             properties:
 *               idProduit:
 *                 type: integer
 *               quantite:
 *                 type: number
 *                 default: 1
 *     responses:
 *       201:
 *         description: Product added or quantity increased
 *       400:
 *         description: Invalid product ID or quantity
 *       401:
 *         description: Unauthenticated
 *       404:
 *         description: Product not found
 *       409:
 *         description: Stock insufficient
 */
router.post('/item', async (req, res, next) => {
    try {
        const context = await resolveOwnedCart(req, res);
        if (!context) return;

        const { idProduit, quantite } = req.body;
        const productId = parsePositiveInteger(idProduit);
        if (!productId) return res.status(400).json({ error: 'Product ID is required.' });

        const [existingRows] = await db.execute(
            'SELECT quantite FROM Panier_Produit WHERE idPanier = ? AND idProduit = ?',
            [context.cart.idPanier, productId]
        );
        const currentQuantity = Number(existingRows[0]?.quantite || 0);

        const validated = await getValidatedProduct(productId, quantite, currentQuantity);
        if (validated.error) return res.status(validated.status).json({ error: validated.error });

        const nextQuantity = Number((currentQuantity + validated.quantity).toFixed(3));
        if (existingRows.length > 0) {
            await db.execute(
                'UPDATE Panier_Produit SET quantite = ? WHERE idPanier = ? AND idProduit = ?',
                [nextQuantity, context.cart.idPanier, validated.productId]
            );
        } else {
            await db.execute(
                'INSERT INTO Panier_Produit (idPanier, idProduit, quantite) VALUES (?, ?, ?)',
                [context.cart.idPanier, validated.productId, validated.quantity]
            );
        }

        res.status(201).json({
            idPanier: context.cart.idPanier,
            idProduit: validated.productId,
            quantite: nextQuantity
        });
    }
    catch (err) {
        if (err && err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Some attributes already exists' });
        next(err);
    }
});


/**
 * @openapi
 * /shoppingCart/list:
 *   delete:
 *     summary: Remove a product line from the current user's shopping cart
 *     description: Removes all quantity for the given product from the session-owned cart.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - idProduit
 *             properties:
 *               idProduit:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Product line removed
 *       400:
 *         description: Invalid product ID
 *       401:
 *         description: Unauthenticated
 */
router.delete('/list', async (req, res, next) => {
    try {
        const context = await resolveOwnedCart(req, res);
        if (!context) return;

        const idProduit = parsePositiveInteger(req.body?.idProduit ?? req.query?.idProduit ?? req.params?.idProduit);
        if (!idProduit) return res.status(400).json({ error: 'idProduit is required' });

        await db.execute(
            'DELETE FROM Panier_Produit WHERE idPanier = ? AND idProduit = ?',
            [context.cart.idPanier, idProduit]
        );
        res.status(200).json({ idPanier: context.cart.idPanier, idProduit });
    } catch (err) {
        next(err);
    }
});


/**
 * @openapi
 * /shoppingCart/single:
 *   delete:
 *     summary: Decrease a product quantity in the current user's shopping cart
 *     description: Removes the line when the remaining quantity reaches zero.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - idProduit
 *             properties:
 *               idProduit:
 *                 type: integer
 *               quantite:
 *                 type: number
 *                 default: 1
 *     responses:
 *       200:
 *         description: Product quantity decreased
 *       400:
 *         description: Invalid product ID or quantity
 *       401:
 *         description: Unauthenticated
 *       404:
 *         description: Product not found in cart
 */
router.delete('/single', async (req, res, next) => {
    try {
        const context = await resolveOwnedCart(req, res);
        if (!context) return;

        const idProduit = parsePositiveInteger(req.body?.idProduit ?? req.query?.idProduit ?? req.params?.idProduit);
        const quantity = parsePositiveQuantity(req.body?.quantite ?? req.query?.quantite ?? 1);
        if (!idProduit) return res.status(400).json({ error: 'idProduit is required' });
        if (!quantity) return res.status(400).json({ error: 'Quantite invalide.' });

        const [rows] = await db.execute(
            'SELECT quantite FROM Panier_Produit WHERE idPanier = ? AND idProduit = ?',
            [context.cart.idPanier, idProduit]
        );
        const currentQuantity = Number(rows[0]?.quantite || 0);
        if (currentQuantity <= 0) return res.status(404).json({ error: 'Item not found in cart' });

        const nextQuantity = Number((currentQuantity - quantity).toFixed(3));
        if (nextQuantity > 0) {
            await db.execute(
                'UPDATE Panier_Produit SET quantite = ? WHERE idPanier = ? AND idProduit = ?',
                [nextQuantity, context.cart.idPanier, idProduit]
            );
        } else {
            await db.execute(
                'DELETE FROM Panier_Produit WHERE idPanier = ? AND idProduit = ?',
                [context.cart.idPanier, idProduit]
            );
        }

        res.status(200).json({
            idPanier: context.cart.idPanier,
            idProduit,
            quantite: Math.max(nextQuantity, 0)
        });
    } catch (err) {
        next(err);
    }
});

/**
 * @openapi
 * /shoppingCart/empty:
 *   delete:
 *     summary: Empty the current user's shopping cart
 *     description: The cart is resolved from the authenticated session.
 *     responses:
 *       200:
 *         description: Cart emptied
 *       401:
 *         description: Unauthenticated
 */
router.delete('/empty', async (req, res, next) => {
    try {
        const context = await resolveOwnedCart(req, res);
        if (!context) return;

        await db.execute('DELETE FROM Panier_Produit WHERE idPanier = ?', [context.cart.idPanier]);
        res.status(200).json({ idPanier: context.cart.idPanier });
    } catch (err) {
        next(err);
    }
});

return router;
}

export default createShoppingCartRouter();
