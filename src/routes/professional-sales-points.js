import express from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../auth.js';
import pool from '../server_config/db.js';
import { getBusinessProfileByAuthUserId } from '../services/auth-profile-service.js';
import { GeocodingError, geocodeAddress } from '../services/geocoding-service.js';
import {
	attachExistingSalesPoint,
	createSalesPointAndAttach,
	detachSalesPoint,
	getManagedCompany,
	listSalesPointsForCompany,
	SalesPointValidationError
} from '../services/sales-points-service.js';

export function createProfessionalSalesPointsRouter({
	authClient = auth,
	db = pool,
	getProfileByAuthUserId = getBusinessProfileByAuthUserId,
	headersFromNode = fromNodeHeaders,
	geocodeAddressFn = geocodeAddress
} = {}) {
	const router = express.Router();

	async function requireProfessionalSession(req, res) {
		const session = await authClient.api.getSession({
			headers: headersFromNode(req.headers)
		});

		if (!session) {
			res.status(401).json({ error: 'Non authentifié.' });
			return null;
		}

		const profile = await getProfileByAuthUserId(session.user.id);
		if (profile?.accountType !== 'professionnel' || !profile.professionnel) {
			res.status(403).json({ error: 'Compte professionnel requis.' });
			return null;
		}

		return { session, profile };
	}

	async function requireManagedCompany(req, res) {
		const idProfessionnel = Number(req.params.idProfessionnel);
		const idEntreprise = Number(req.params.idEntreprise);

		if (!Number.isInteger(idProfessionnel) || idProfessionnel <= 0 || !Number.isInteger(idEntreprise) || idEntreprise <= 0) {
			res.status(400).json({ error: 'Identifiants invalides.' });
			return null;
		}

		const context = await requireProfessionalSession(req, res);
		if (!context) return null;

		if (context.profile.professionnel.id !== idProfessionnel) {
			res.status(403).json({ error: 'Acces interdit pour ce professionnel.' });
			return null;
		}

		const company = await getManagedCompany(db, idProfessionnel, idEntreprise);
		return { ...context, company, idEntreprise, idProfessionnel };
	}

	router.get('/:idProfessionnel/entreprises/:idEntreprise/lieux-vente', async (req, res, next) => {
		try {
			const context = await requireManagedCompany(req, res);
			if (!context) return;

			const salesPoints = await listSalesPointsForCompany(db, context.idEntreprise);
			return res.json({
				company: context.company,
				...salesPoints
			});
		} catch (error) {
			return next(error);
		}
	});

	router.post('/:idProfessionnel/entreprises/:idEntreprise/lieux-vente/attach', express.json(), async (req, res, next) => {
		try {
			const context = await requireManagedCompany(req, res);
			if (!context) return;

			const idLieu = Number(req.body?.idLieu);
			if (!Number.isInteger(idLieu) || idLieu <= 0) {
				return res.status(400).json({ error: 'Identifiant de lieu invalide.' });
			}

			const salesPoint = await attachExistingSalesPoint(db, context.idEntreprise, idLieu);
			return res.status(201).json(salesPoint);
		} catch (error) {
			return next(error);
		}
	});

	router.post('/:idProfessionnel/entreprises/:idEntreprise/lieux-vente', express.json(), async (req, res, next) => {
		try {
			const context = await requireManagedCompany(req, res);
			if (!context) return;

			const salesPoint = await createSalesPointAndAttach(db, context.idEntreprise, req.body || {}, geocodeAddressFn);
			return res.status(201).json(salesPoint);
		} catch (error) {
			return next(error);
		}
	});

	router.delete('/:idProfessionnel/entreprises/:idEntreprise/lieux-vente/:idLieu', async (req, res, next) => {
		try {
			const context = await requireManagedCompany(req, res);
			if (!context) return;

			const idLieu = Number(req.params.idLieu);
			if (!Number.isInteger(idLieu) || idLieu <= 0) {
				return res.status(400).json({ error: 'Identifiant de lieu invalide.' });
			}

			await detachSalesPoint(db, context.idEntreprise, idLieu);
			return res.status(204).send();
		} catch (error) {
			return next(error);
		}
	});

	router.use((error, req, res, next) => {
		if (error instanceof SalesPointValidationError || error instanceof GeocodingError) {
			return res.status(error.status || 400).json({ error: error.message });
		}
		return next(error);
	});

	return router;
}

export default createProfessionalSalesPointsRouter;
