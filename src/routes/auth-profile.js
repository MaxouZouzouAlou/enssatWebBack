import express from 'express';
import { APIError } from 'better-auth/api';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../auth.js';
import {
	assertRegistrationAvailable,
	ConflictError,
	ensureBusinessProfile,
	getBusinessProfileByAuthUserId,
	validateRegistrationPayload,
	ValidationError
} from '../services/auth-profile-service.js';

const router = express.Router();

router.post('/register', express.json(), async (req, res) => {
	try {
		const payload = validateRegistrationPayload(req.body || {});
		await assertRegistrationAvailable({
			email: payload.email,
			accountType: payload.accountType,
			siret: payload.entreprise?.siret
		});

		const result = await auth.api.signUpEmail({
			body: {
				email: payload.email,
				password: payload.password,
				name: `${payload.prenom} ${payload.nom}`,
				accountType: payload.accountType,
				firstName: payload.prenom,
				lastName: payload.nom,
				nom: payload.nom,
				prenom: payload.prenom,
				entreprise: payload.entreprise,
				callbackURL: process.env.AUTH_CALLBACK_URL || `${process.env.FRONTEND_ORIGIN || 'http://localhost:3000'}/?verified=1`
			},
			headers: fromNodeHeaders(req.headers),
			returnHeaders: true
		});

		applyBetterAuthHeaders(res, result.headers);

		const authPayload = result.response || result.data || result;
		const profile = await ensureBusinessProfile(authPayload.user, payload);

		return res.status(201).json({
			user: authPayload.user,
			profile
		});
	} catch (error) {
		return handleAuthError(error, res);
	}
});

router.get('/profile', async (req, res) => {
	try {
		const session = await auth.api.getSession({
			headers: fromNodeHeaders(req.headers)
		});

		if (!session) {
			return res.status(401).json({ error: 'Non authentifie.' });
		}

		let profile = await getBusinessProfileByAuthUserId(session.user.id);
		if (!profile) {
			if (session.user.accountType === 'superadmin') {
				return res.json({
					session,
					profile: {
						authUserId: session.user.id,
						accountType: 'superadmin',
						user: {
							email: session.user.email,
							name: session.user.name,
							image: session.user.image || null,
							emailVerified: Boolean(session.user.emailVerified),
							nom: session.user.lastName || null,
							prenom: session.user.firstName || null
						},
						particulier: null,
						client: null,
						professionnel: null
					}
				});
			}
			profile = await ensureBusinessProfile(session.user, {
				accountType: session.user.accountType || 'particulier'
			});
		}

		return res.json({
			session,
			profile
		});
	} catch (error) {
		return handleAuthError(error, res);
	}
});

function applyBetterAuthHeaders(res, headers) {
	if (!headers) return;

	const setCookies = typeof headers.getSetCookie === 'function'
		? headers.getSetCookie()
		: [headers.get?.('set-cookie')].filter(Boolean);

	for (const cookie of setCookies) {
		res.append('Set-Cookie', cookie);
	}
}

function handleAuthError(error, res) {
	if (error instanceof ValidationError || error instanceof ConflictError) {
		return res.status(error.status).json({ error: error.message, details: error.details });
	}

	if (error instanceof APIError) {
		return res.status(error.statusCode || error.status || 400).json({
			error: error.message || 'Erreur authentification.'
		});
	}

	if (error?.code === 'ER_DUP_ENTRY') {
		return res.status(409).json({ error: 'Une donnee existe deja avec ces informations.' });
	}

	console.error('Auth error:', error.message);
	return res.status(500).json({ error: 'Erreur serveur.' });
}

export default router;
