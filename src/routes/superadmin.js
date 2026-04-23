import express from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../auth.js';
import {
	assertSuperAdminSession,
	deleteAdminAccount,
	deleteAdminCompany,
	deleteAdminProduct,
	getAdminOverview,
	listAdminAccounts,
	listAdminCompanies,
	listAdminProducts,
	SuperAdminError,
	updateAdminProductVisibility
} from '../services/superadmin-service.js';
import { ConflictError, ValidationError } from '../services/auth-profile-service.js';

const router = express.Router();

async function requireSuperAdmin(req, res, next) {
	try {
		const session = await auth.api.getSession({
			headers: fromNodeHeaders(req.headers)
		});
		assertSuperAdminSession(session);
		req.authSession = session;
		return next();
	} catch (error) {
		return handleSuperAdminError(error, res, next);
	}
}

router.get('/overview', requireSuperAdmin, async (req, res, next) => {
	try {
		return res.json(await getAdminOverview());
	} catch (error) {
		return handleSuperAdminError(error, res, next);
	}
});

router.get('/accounts', requireSuperAdmin, async (req, res, next) => {
	try {
		return res.json(await listAdminAccounts());
	} catch (error) {
		return handleSuperAdminError(error, res, next);
	}
});

router.delete('/accounts/:authUserId', requireSuperAdmin, async (req, res, next) => {
	try {
		return res.json(await deleteAdminAccount(req.params.authUserId, req.authSession.user.id));
	} catch (error) {
		return handleSuperAdminError(error, res, next);
	}
});

router.get('/companies', requireSuperAdmin, async (req, res, next) => {
	try {
		return res.json(await listAdminCompanies());
	} catch (error) {
		return handleSuperAdminError(error, res, next);
	}
});

router.delete('/companies/:idEntreprise', requireSuperAdmin, async (req, res, next) => {
	try {
		return res.json(await deleteAdminCompany(req.params.idEntreprise));
	} catch (error) {
		return handleSuperAdminError(error, res, next);
	}
});

router.get('/products', requireSuperAdmin, async (req, res, next) => {
	try {
		return res.json(await listAdminProducts());
	} catch (error) {
		return handleSuperAdminError(error, res, next);
	}
});

router.patch('/products/:idProduit/visibility', requireSuperAdmin, express.json(), async (req, res, next) => {
	try {
		return res.json(await updateAdminProductVisibility(req.params.idProduit, req.body?.visible));
	} catch (error) {
		return handleSuperAdminError(error, res, next);
	}
});

router.delete('/products/:idProduit', requireSuperAdmin, async (req, res, next) => {
	try {
		return res.json(await deleteAdminProduct(req.params.idProduit));
	} catch (error) {
		return handleSuperAdminError(error, res, next);
	}
});

function handleSuperAdminError(error, res, next) {
	if (error instanceof SuperAdminError || error instanceof ValidationError || error instanceof ConflictError) {
		return res.status(error.status || 400).json({ error: error.message, details: error.details });
	}
	return next(error);
}

export default router;
