import express from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../auth.js';
import pool from '../server_config/db.js';
import { getBusinessProfileByAuthUserId } from '../services/auth-profile-service.js';
import { CheckoutError, checkoutCart } from '../services/order-service.js';

function getCartOwner(profile) {
	if (profile?.particulier?.id) {
		return {
			column: 'idParticulier',
			id: profile.particulier.id
		};
	}

	if (profile?.professionnel?.id) {
		return {
			column: 'idProfessionnel',
			id: profile.professionnel.id
		};
	}

	return null;
}

export function createOrdersRouter({
	authClient = auth,
	db = pool,
	getProfileByAuthUserId = getBusinessProfileByAuthUserId,
	headersFromNode = fromNodeHeaders,
	checkoutCartFn = checkoutCart
} = {}) {
	const router = express.Router();

	async function requireProfile(req, res) {
		const session = await authClient.api.getSession({
			headers: headersFromNode(req.headers)
		});

		if (!session) {
			res.status(401).json({ error: 'Non authentifie.' });
			return null;
		}

		const profile = await getProfileByAuthUserId(session.user.id);
		if (!profile) {
			res.status(404).json({ error: 'Profil introuvable.' });
			return null;
		}

		const owner = getCartOwner(profile);
		if (!owner) {
			res.status(404).json({ error: 'Aucun panier disponible pour ce compte.' });
			return null;
		}

		return { owner, profile, session };
	}

	/**
	 * @openapi
	 * /orders/checkout:
	 *   post:
	 *     summary: Validate the current authenticated cart into a persisted order
	 *     description: Recalculates totals from the current cart and creates `Commande` and `LigneCommande`.
	 *     requestBody:
	 *       required: false
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             properties:
	 *               modeLivraison:
	 *                 type: string
	 *               voucherId:
	 *                 type: integer
	 *     responses:
	 *       201:
	 *         description: Order created
	 *       401:
	 *         description: Unauthenticated
	 *       404:
	 *         description: Business profile not found
	 *       409:
	 *         description: Empty cart or stock conflict
	 */
	router.post('/checkout', async (req, res, next) => {
		try {
			const context = await requireProfile(req, res);
			if (!context) return;

			const result = await checkoutCartFn({
				db,
				owner: context.owner,
				modeLivraison: req.body?.modeLivraison,
				voucherId: req.body?.voucherId
			});

			return res.status(201).json(result);
		} catch (error) {
			if (error instanceof CheckoutError) {
				return res.status(error.status).json({ error: error.message });
			}
			return next(error);
		}
	});

	return router;
}

export default createOrdersRouter;
