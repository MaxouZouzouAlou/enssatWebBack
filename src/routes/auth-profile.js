import express from 'express';
import { APIError } from 'better-auth/api';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../auth.js';
import {
	assertRegistrationAvailable,
	ConflictError,
	createProfessionalCompanyByAuthUserId,
	deleteProfessionalCompanyByAuthUserId,
	ensureBusinessProfile,
	deletePersonalAccountByAuthUserId,
	getBusinessProfileByAuthUserId,
	updatePersonalProfileByAuthUserId,
	updatePersonalAddressByAuthUserId,
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
			return res.status(401).json({ error: 'Non authentifié.' });
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

router.put('/profile/address', express.json(), async (req, res) => {
	try {
		const session = await auth.api.getSession({
			headers: fromNodeHeaders(req.headers)
		});

		if (!session) {
			return res.status(401).json({ error: 'Non authentifié.' });
		}

		const profile = await updatePersonalAddressByAuthUserId(session.user.id, req.body || {});
		return res.json({ profile });
	} catch (error) {
		return handleAuthError(error, res);
	}
});

router.put('/profile', express.json(), async (req, res) => {
	try {
		const session = await auth.api.getSession({
			headers: fromNodeHeaders(req.headers)
		});

		if (!session) {
			return res.status(401).json({ error: 'Non authentifié.' });
		}

		const profile = await updatePersonalProfileByAuthUserId(session.user.id, req.body || {});
		return res.json({ profile });
	} catch (error) {
		return handleAuthError(error, res);
	}
});

router.post('/profile/companies', express.json(), async (req, res) => {
	try {
		const session = await auth.api.getSession({
			headers: fromNodeHeaders(req.headers)
		});

		if (!session) {
			return res.status(401).json({ error: 'Non authentifié.' });
		}

		const profile = await createProfessionalCompanyByAuthUserId(session.user.id, req.body || {});
		return res.status(201).json({ profile });
	} catch (error) {
		return handleAuthError(error, res);
	}
});

router.delete('/profile/companies/:idEntreprise', async (req, res) => {
	try {
		const session = await auth.api.getSession({
			headers: fromNodeHeaders(req.headers)
		});

		if (!session) {
			return res.status(401).json({ error: 'Non authentifié.' });
		}

		const profile = await deleteProfessionalCompanyByAuthUserId(session.user.id, req.params.idEntreprise);
		return res.json({ profile });
	} catch (error) {
		return handleAuthError(error, res);
	}
});

router.post('/profile/change-email', express.json(), async (req, res) => {
	try {
		const result = await auth.api.changeEmail({
			body: {
				newEmail: String(req.body?.newEmail || '').trim(),
				callbackURL: `${process.env.FRONTEND_ORIGIN || 'http://localhost:3000'}/compte?emailChanged=1`
			},
			headers: fromNodeHeaders(req.headers)
		});

		return res.json({
			status: Boolean(result?.status ?? true),
			message: 'Un email de vérification a été envoyé à votre nouvelle adresse.'
		});
	} catch (error) {
		return handleAuthError(error, res);
	}
});

router.delete('/profile', async (req, res) => {
	try {
		const session = await auth.api.getSession({
			headers: fromNodeHeaders(req.headers)
		});

		if (!session) {
			return res.status(401).json({ error: 'Non authentifié.' });
		}

		await deletePersonalAccountByAuthUserId(session.user.id);
		return res.status(200).json({ success: true });
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
		return res.status(409).json({ error: 'Une donnée existe déjà avec ces informations.' });
	}

	console.error('Auth error:', error);
	if (error && error.stack) console.error(error.stack);
	return res.status(500).json({ error: 'Erreur serveur.' });
}

export default router;
