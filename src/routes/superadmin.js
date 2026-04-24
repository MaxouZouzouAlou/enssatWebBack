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

/**
 * @openapi
 * /superadmin/overview:
 *   get:
 *     summary: Get superadmin overview dashboard data
 *     tags:
 *       - SuperAdmin
 *     responses:
 *       200:
 *         description: Overview data retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Not a superadmin)
 */
router.get('/overview', requireSuperAdmin, async (req, res, next) => {
	try {
		return res.json(await getAdminOverview());
	} catch (error) {
		return handleSuperAdminError(error, res, next);
	}
});

/**
 * @openapi
 * /superadmin/accounts:
 *   get:
 *     summary: List all accounts for superadmin
 *     tags:
 *       - SuperAdmin
 *     responses:
 *       200:
 *         description: List of accounts
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get('/accounts', requireSuperAdmin, async (req, res, next) => {
	try {
		return res.json(await listAdminAccounts());
	} catch (error) {
		return handleSuperAdminError(error, res, next);
	}
});

/**
 * @openapi
 * /superadmin/accounts/{authUserId}:
 *   delete:
 *     summary: Delete an account by auth user ID
 *     tags:
 *       - SuperAdmin
 *     parameters:
 *       - in: path
 *         name: authUserId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Account deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.delete('/accounts/:authUserId', requireSuperAdmin, async (req, res, next) => {
	try {
		return res.json(await deleteAdminAccount(req.params.authUserId, req.authSession.user.id));
	} catch (error) {
		return handleSuperAdminError(error, res, next);
	}
});

/**
 * @openapi
 * /superadmin/companies:
 *   get:
 *     summary: List all companies for superadmin
 *     tags:
 *       - SuperAdmin
 *     responses:
 *       200:
 *         description: List of companies
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get('/companies', requireSuperAdmin, async (req, res, next) => {
	try {
		return res.json(await listAdminCompanies());
	} catch (error) {
		return handleSuperAdminError(error, res, next);
	}
});

/**
 * @openapi
 * /superadmin/companies/{idEntreprise}:
 *   delete:
 *     summary: Delete a company by ID
 *     tags:
 *       - SuperAdmin
 *     parameters:
 *       - in: path
 *         name: idEntreprise
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Company deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.delete('/companies/:idEntreprise', requireSuperAdmin, async (req, res, next) => {
	try {
		return res.json(await deleteAdminCompany(req.params.idEntreprise));
	} catch (error) {
		return handleSuperAdminError(error, res, next);
	}
});

/**
 * @openapi
 * /superadmin/products:
 *   get:
 *     summary: List all products for superadmin
 *     tags:
 *       - SuperAdmin
 *     responses:
 *       200:
 *         description: List of products
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get('/products', requireSuperAdmin, async (req, res, next) => {
	try {
		return res.json(await listAdminProducts());
	} catch (error) {
		return handleSuperAdminError(error, res, next);
	}
});

/**
 * @openapi
 * /superadmin/products/{idProduit}/visibility:
 *   patch:
 *     summary: Update product visibility
 *     tags:
 *       - SuperAdmin
 *     parameters:
 *       - in: path
 *         name: idProduit
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               visible:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Product visibility updated successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.patch('/products/:idProduit/visibility', requireSuperAdmin, express.json(), async (req, res, next) => {
	try {
		return res.json(await updateAdminProductVisibility(req.params.idProduit, req.body?.visible));
	} catch (error) {
		return handleSuperAdminError(error, res, next);
	}
});

/**
 * @openapi
 * /superadmin/products/{idProduit}:
 *   delete:
 *     summary: Delete a product by ID
 *     tags:
 *       - SuperAdmin
 *     parameters:
 *       - in: path
 *         name: idProduit
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Product deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
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