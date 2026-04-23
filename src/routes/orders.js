import express from 'express';
import PDFDocument from 'pdfkit';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../auth.js';
import pool from '../server_config/db.js';
import { getBusinessProfileByAuthUserId } from '../services/auth-profile-service.js';
import { geocodeAddress } from '../services/geocoding-service.js';
import { CheckoutError, checkoutCart, getCheckoutContext, previewCheckout } from '../services/order-service.js';
import { annotatePickupRoute } from '../services/pickup-route-service.js';
import {
	createRecurringOrder,
	deleteRecurringOrder,
	executeRecurringOrderById,
	listRecurringOrdersByOwner,
	updateRecurringOrder
} from '../services/recurring-order-service.js';
import { createOrderNotification } from '../services/notifications-service.js';
import { sendOrderConfirmationEmail } from '../services/email-service.js';

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

function getOwnerWhereClause(owner) {
	if (owner.column === 'idParticulier') {
		return {
			clause: 'c.idParticulier = ?',
			params: [owner.id]
		};
	}

	if (owner.column === 'idProfessionnel') {
		return {
			clause: 'c.idProfessionnel = ?',
			params: [owner.id]
		};
	}

	throw new Error('Unsupported order owner.');
}

function buildOwnerOrderSequenceSelect(ownerFilterClause) {
	return `(
		SELECT ranked.numeroCommandeUtilisateur
		FROM (
			SELECT
				c2.idCommande,
				ROW_NUMBER() OVER (
					PARTITION BY ${ownerFilterClause.includes('idParticulier') ? 'c2.idParticulier' : 'c2.idProfessionnel'}
					ORDER BY c2.dateCommande ASC, c2.idCommande ASC
				) AS numeroCommandeUtilisateur
			FROM Commande c2
			WHERE ${ownerFilterClause.replaceAll('c.', 'c2.')}
		) AS ranked
		WHERE ranked.idCommande = c.idCommande
		LIMIT 1
	)`;
}

function recurringErrorStatus(message = '') {
	if (/introuvable/i.test(message)) return 404;
	return 400;
}

function getOwnerInvoiceLabel(profile) {
	if (profile?.particulier) {
		return {
			type: 'Particulier',
			id: profile.particulier.id
		};
	}

	if (profile?.professionnel) {
		return {
			type: 'Professionnel',
			id: profile.professionnel.id
		};
	}

	return {
		type: 'Compte',
		id: 'N/A'
	};
}

export function createOrdersRouter({
	authClient = auth,
	db = pool,
	getProfileByAuthUserId = getBusinessProfileByAuthUserId,
	headersFromNode = fromNodeHeaders,
	checkoutCartFn = checkoutCart,
	geocodeAddressFn = geocodeAddress
} = {}) {
	const router = express.Router();

	async function requireProfile(req, res) {
		const session = await authClient.api.getSession({
			headers: headersFromNode(req.headers)
		});

		if (!session) {
			res.status(401).json({ error: 'Non authentifié.' });
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
				profile: context.profile,
				modeLivraison: req.body?.modeLivraison,
				modePaiement: req.body?.modePaiement,
				relayId: req.body?.relayId,
				adresseLivraison: req.body?.adresseLivraison,
				voucherId: req.body?.voucherId,
				pickupAssignments: req.body?.pickupAssignments,
				geocodeAddressFn
			});

			void createOrderNotification(
				context.session.user.id,
				result.order.idCommande,
				result.order.numeroCommandeUtilisateur
			).catch(() => {});
			void sendOrderConfirmationEmail({
				user: { email: context.session.user.email, name: context.session.user.name || '' },
				order: result.order,
				items: result.items,
				delivery: result.delivery,
				loyalty: result.loyalty,
				appliedVoucher: result.appliedVoucher
			}).catch(() => {});
			return res.status(201).json(result);
		} catch (error) {
			if (error instanceof CheckoutError) {
				return res.status(error.status).json({ error: error.message });
			}
			return next(error);
		}
	});

	router.get('/checkout/context', async (req, res, next) => {
		try {
			const context = await requireProfile(req, res);
			if (!context) return;

			const result = await getCheckoutContext({
				db,
				owner: context.owner,
				profile: context.profile,
				geocodeAddressFn
			});

			return res.json(result);
		} catch (error) {
			return next(error);
		}
	});

	router.post('/checkout/preview', async (req, res, next) => {
		try {
			const context = await requireProfile(req, res);
			if (!context) return;

			const result = await previewCheckout({
				db,
				owner: context.owner,
				profile: context.profile,
				modeLivraison: req.body?.modeLivraison,
				modePaiement: req.body?.modePaiement,
				relayId: req.body?.relayId,
				adresseLivraison: req.body?.adresseLivraison,
				voucherId: req.body?.voucherId,
				pickupAssignments: req.body?.pickupAssignments,
				geocodeAddressFn
			});

			return res.json(result);
		} catch (error) {
			if (error instanceof CheckoutError) {
				return res.status(error.status).json({ error: error.message });
			}
			return next(error);
		}
	});

	router.get('/', async (req, res, next) => {
		try {
			const context = await requireProfile(req, res);
			if (!context) return;

			const ownerFilter = getOwnerWhereClause(context.owner);
			const ownerOrderSequenceSelect = buildOwnerOrderSequenceSelect(ownerFilter.clause);
			const [rows] = await db.query(
				`SELECT
					c.idCommande,
					${ownerOrderSequenceSelect} AS numeroCommandeUtilisateur,
					c.dateCommande,
					c.modeLivraison,
					c.modePaiement,
					c.prixTotal,
					c.status,
					COUNT(lc.idProduit) AS lignesCount,
					COALESCE(SUM(lc.quantite), 0) AS quantiteTotale
				 FROM Commande c
				 LEFT JOIN LigneCommande lc ON lc.idCommande = c.idCommande
				 WHERE ${ownerFilter.clause}
				 GROUP BY c.idCommande, c.dateCommande, c.modeLivraison, c.modePaiement, c.prixTotal, c.status
				 ORDER BY c.dateCommande DESC, c.idCommande DESC`,
				ownerFilter.params
			);

			return res.json({
				items: rows.map((row) => ({
					idCommande: row.idCommande,
					numeroCommandeUtilisateur: Number(row.numeroCommandeUtilisateur || 0),
					dateCommande: row.dateCommande,
					modeLivraison: row.modeLivraison,
					modePaiement: row.modePaiement,
					prixTotal: Number(row.prixTotal || 0),
					status: row.status,
					lignesCount: Number(row.lignesCount || 0),
					quantiteTotale: Number(row.quantiteTotale || 0)
				}))
			});
		} catch (error) {
			return next(error);
		}
	});

	router.get('/recurring', async (req, res, next) => {
		try {
			const context = await requireProfile(req, res);
			if (!context) return;

			const items = await listRecurringOrdersByOwner(context.owner, { db });
			return res.json({ items });
		} catch (error) {
			return next(error);
		}
	});

	router.post('/recurring', async (req, res, next) => {
		try {
			const context = await requireProfile(req, res);
			if (!context) return;

			const created = await createRecurringOrder(context.owner, req.body || {}, { db });
			return res.status(201).json({ recurringOrder: created });
		} catch (error) {
			if (error instanceof Error) {
				return res.status(recurringErrorStatus(error.message)).json({ error: error.message });
			}
			return next(error);
		}
	});

	router.patch('/recurring/:idAuto', async (req, res, next) => {
		try {
			const context = await requireProfile(req, res);
			if (!context) return;

			const result = await updateRecurringOrder(context.owner, req.params.idAuto, req.body || {}, { db });
			return res.json(result);
		} catch (error) {
			if (error instanceof Error) {
				return res.status(recurringErrorStatus(error.message)).json({ error: error.message });
			}
			return next(error);
		}
	});

	router.delete('/recurring/:idAuto', async (req, res, next) => {
		try {
			const context = await requireProfile(req, res);
			if (!context) return;

			const result = await deleteRecurringOrder(context.owner, req.params.idAuto, { db });
			return res.json(result);
		} catch (error) {
			if (error instanceof Error) {
				return res.status(recurringErrorStatus(error.message)).json({ error: error.message });
			}
			return next(error);
		}
	});

	router.post('/recurring/:idAuto/run', async (req, res, next) => {
		try {
			const context = await requireProfile(req, res);
			if (!context) return;

			const result = await executeRecurringOrderById(context.owner, req.params.idAuto, { db });
			return res.json(result);
		} catch (error) {
			if (error instanceof Error) {
				return res.status(recurringErrorStatus(error.message)).json({ error: error.message });
			}
			return next(error);
		}
	});

	router.get('/:idCommande', async (req, res, next) => {
		try {
			const context = await requireProfile(req, res);
			if (!context) return;

			const idCommande = Number(req.params.idCommande);
			if (!Number.isInteger(idCommande) || idCommande <= 0) {
				return res.status(400).json({ error: 'Identifiant commande invalide.' });
			}

			const ownerFilter = getOwnerWhereClause(context.owner);
			const ownerOrderSequenceSelect = buildOwnerOrderSequenceSelect(ownerFilter.clause);
			const [orderRows] = await db.query(
				`SELECT
					c.idCommande,
					${ownerOrderSequenceSelect} AS numeroCommandeUtilisateur,
					c.dateCommande,
					c.modeLivraison,
					c.modePaiement,
					c.prixTotal,
					c.status
				 FROM Commande c
				 WHERE c.idCommande = ?
				   AND ${ownerFilter.clause}
				 LIMIT 1`,
				[idCommande, ...ownerFilter.params]
			);

			if (!orderRows.length) {
				return res.status(404).json({ error: 'Commande introuvable.' });
			}

			const [[lineRows], [deliveryRows]] = await Promise.all([
				db.query(
					`SELECT
						lc.idProduit,
						lc.idLieu,
						lc.quantite,
						lc.prixTTC,
						p.nom,
						p.nature,
						p.unitaireOuKilo,
						MIN(i.path) AS imagePath,
						lv.nom AS lieuNom,
						lv.horaires AS lieuHoraires,
						lv.adresse_ligne AS lieuAdresseLigne,
						lv.code_postal AS lieuCodePostal,
						lv.ville AS lieuVille
					 FROM LigneCommande lc
					 INNER JOIN Produit p ON p.idProduit = lc.idProduit
					 LEFT JOIN Produit_Image pi ON pi.idProduit = p.idProduit
					 LEFT JOIN Image i ON i.idImage = pi.idImage
					 LEFT JOIN LieuVente lv ON lv.idLieu = lc.idLieu
					 WHERE lc.idCommande = ?
					 GROUP BY lc.idProduit, lc.idLieu, lc.quantite, lc.prixTTC, p.nom, p.nature, p.unitaireOuKilo, lv.nom, lv.horaires, lv.adresse_ligne, lv.code_postal, lv.ville
					 ORDER BY p.nom ASC, lc.idProduit ASC`,
					[idCommande]
				),
				db.query(
					`SELECT
						l.idLivraison,
						l.idLieu,
						l.modeLivraison,
						l.adresse,
						l.idRelais,
						pr.nom AS relaisNom,
						pr.adresse_ligne AS relaisAdresseLigne,
						pr.code_postal AS relaisCodePostal,
						pr.ville AS relaisVille,
						lv.nom,
						lv.horaires,
						lv.adresse_ligne,
						lv.code_postal,
						lv.ville,
						lv.latitude,
						lv.longitude
					 FROM Livraison l
					 LEFT JOIN PointRelais pr ON pr.idRelais = l.idRelais
					 LEFT JOIN LieuVente lv ON lv.idLieu = l.idLieu
					 WHERE l.idCommande = ?
					 ORDER BY l.idLivraison ASC`,
					[idCommande]
				),
			]);

			const pickupStops = deliveryRows
				.filter((row) => row.modeLivraison === 'lieu_vente' && row.idLieu && row.latitude != null && row.longitude != null)
				.map((row) => ({
					idLieu: Number(row.idLieu),
					nom: row.nom,
					horaires: row.horaires,
					adresse: {
						ligne: row.adresse_ligne,
						codePostal: row.code_postal,
						ville: row.ville
					},
					coordinates: {
						latitude: Number(row.latitude),
						longitude: Number(row.longitude)
					}
				}));
			const pickupRouteStops = pickupStops.length ? annotatePickupRoute(pickupStops) : [];
			const pickupRoute = pickupRouteStops.length
				? {
					stops: pickupRouteStops,
					totalDistanceKm: pickupRouteStops[pickupRouteStops.length - 1]?.totalDistanceKm ?? 0
				}
				: null;
			const primaryDelivery = deliveryRows[0] || null;
			const delivery = !primaryDelivery ? null : {
				modeLivraison: primaryDelivery.modeLivraison,
				adresse: primaryDelivery.adresse || null,
				pointRelais: primaryDelivery.idRelais ? {
					idRelais: Number(primaryDelivery.idRelais),
					nom: primaryDelivery.relaisNom,
					adresse: {
						ligne: primaryDelivery.relaisAdresseLigne,
						codePostal: primaryDelivery.relaisCodePostal,
						ville: primaryDelivery.relaisVille
					}
				} : null
			};

			return res.json({
				order: {
					idCommande: orderRows[0].idCommande,
					numeroCommandeUtilisateur: Number(orderRows[0].numeroCommandeUtilisateur || 0),
					dateCommande: orderRows[0].dateCommande,
					modeLivraison: orderRows[0].modeLivraison,
					modePaiement: orderRows[0].modePaiement,
					prixTotal: Number(orderRows[0].prixTotal || 0),
					status: orderRows[0].status
				},
				delivery,
				pickupRoute,
				items: lineRows.map((row) => ({
					idProduit: row.idProduit,
					nom: row.nom,
					nature: row.nature,
					unitaireOuKilo: Boolean(row.unitaireOuKilo),
					quantite: Number(row.quantite || 0),
					prixTTC: Number(row.prixTTC || 0),
					imagePath: row.imagePath || null,
					selectedLieu: row.idLieu ? {
						idLieu: Number(row.idLieu),
						nom: row.lieuNom,
						horaires: row.lieuHoraires,
						adresse: {
							ligne: row.lieuAdresseLigne,
							codePostal: row.lieuCodePostal,
							ville: row.lieuVille
						}
					} : null
				}))
			});
		} catch (error) {
			return next(error);
		}
	});

	router.get('/:idCommande/facture.pdf', async (req, res, next) => {
		try {
			const context = await requireProfile(req, res);
			if (!context) return;

			const idCommande = Number(req.params.idCommande);
			if (!Number.isInteger(idCommande) || idCommande <= 0) {
				return res.status(400).json({ error: 'Identifiant commande invalide.' });
			}

			const ownerFilter = getOwnerWhereClause(context.owner);
			const ownerOrderSequenceSelect = buildOwnerOrderSequenceSelect(ownerFilter.clause);
			const [orderRows] = await db.query(
				`SELECT
					c.idCommande,
					${ownerOrderSequenceSelect} AS numeroCommandeUtilisateur,
					c.dateCommande,
					c.modeLivraison,
					c.modePaiement,
					c.prixTotal,
					c.status
				 FROM Commande c
				 WHERE c.idCommande = ?
				   AND ${ownerFilter.clause}
				 LIMIT 1`,
				[idCommande, ...ownerFilter.params]
			);

			if (!orderRows.length) {
				return res.status(404).json({ error: 'Commande introuvable.' });
			}

			const [lineRows] = await db.query(
				`SELECT
					lc.idProduit,
					lc.quantite,
					lc.prixTTC,
					p.nom
				 FROM LigneCommande lc
				 INNER JOIN Produit p ON p.idProduit = lc.idProduit
				 WHERE lc.idCommande = ?
				 ORDER BY p.nom ASC, lc.idProduit ASC`,
				[idCommande]
			);

			const order = orderRows[0];
			const total = lineRows.reduce((sum, row) => sum + Number(row.prixTTC || 0), 0);
			const ownerLabel = getOwnerInvoiceLabel(context.profile);
			const fileName = `facture-commande-${idCommande}.pdf`;

			res.setHeader('Content-Type', 'application/pdf');
			res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

			const doc = new PDFDocument({ margin: 50, size: 'A4' });
			doc.pipe(res);

			doc.fontSize(20).text('FACTURE', { align: 'left' });
			doc.moveDown(0.5);
			doc.fontSize(11);
			doc.text(`Commande #${order?.numeroCommandeUtilisateur || idCommande}`);
			doc.text(`${ownerLabel.type} #${ownerLabel.id}`);
			doc.text(`Date: ${order?.dateCommande ? new Date(order.dateCommande).toLocaleDateString('fr-FR') : 'N/A'}`);
			doc.text(`Mode livraison: ${order?.modeLivraison || 'N/A'}`);
			doc.text(`Paiement: ${order?.modePaiement || 'N/A'}`);
			doc.text(`Statut: ${order?.status || 'N/A'}`);

			doc.moveDown(1);
			doc.fontSize(13).text('Lignes de commande');
			doc.moveDown(0.5);

			for (const row of lineRows) {
				doc
					.fontSize(10)
					.text(`${row.nom}  |  Quantite: ${Number(row.quantite)}  |  Montant: ${Number(row.prixTTC || 0).toFixed(2)} EUR`);
			}

			doc.moveDown(1);
			doc.fontSize(12).text(`TOTAL: ${total.toFixed(2)} EUR`, { align: 'right' });
			doc.moveDown(2);
			doc.fontSize(9).fillColor('#666666').text('Document genere automatiquement par ENSSAT Market.', { align: 'left' });

			doc.end();
			return undefined;
		} catch (error) {
			return next(error);
		}
	});

	return router;
}

export default createOrdersRouter;
