import express from 'express';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import multer from 'multer';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../auth.js';
import pool from '../server_config/db.js';
import { getBusinessProfileByAuthUserId } from '../services/auth-profile-service.js';
import { geocodeAddress } from '../services/geocoding-service.js';

const CATALOG_SORTS = new Set(['alpha_asc', 'alpha_desc', 'stock_desc', 'rating_desc', 'proximity']);
const geocodedAddressCache = new Map();

function normalizeText(value) {
	return String(value || '').trim();
}

function parsePositiveInteger(value, fallback, max = 100) {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
	return Math.min(parsed, max);
}

function parseOptionalNumber(value) {
	if (value == null || value === '') return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function parseBooleanFilter(value) {
	if (value == null || value === '') return null;
	if (typeof value === 'boolean') return value;
	const normalized = String(value).trim().toLowerCase();
	if (['true', '1', 'oui', 'yes'].includes(normalized)) return true;
	if (['false', '0', 'non', 'no'].includes(normalized)) return false;
	return null;
}

function parseNatureFilters(value) {
	const rawValues = Array.isArray(value) ? value : [value];
	return [...new Set(
		rawValues
			.flatMap((entry) => String(entry || '').split(','))
			.map((entry) => entry.trim())
			.filter(Boolean)
	)];
}

function normalizeCatalogSort(sort, fallback = 'alpha_asc') {
	return CATALOG_SORTS.has(sort) ? sort : fallback;
}

function normalizeCatalogQuery(query = {}, { fallbackSort = 'alpha_asc' } = {}) {
	return {
		page: parsePositiveInteger(query.page, 1, 100000),
		limit: parsePositiveInteger(query.limit, 9, 30),
		recherche: normalizeText(query.q || query.recherche),
		natures: parseNatureFilters(query.natures || query.nature),
		bio: parseBooleanFilter(query.bio),
		enStock: parseBooleanFilter(query.enStock),
		prixMin: parseOptionalNumber(query.prixMin),
		prixMax: parseOptionalNumber(query.prixMax),
		sort: normalizeCatalogSort(query.sort, fallbackSort)
	};
}

function buildCatalogFilters(filters, { ignoreNature = false } = {}) {
	const clauses = ['p.visible = TRUE'];
	const params = [];

	if (filters.recherche) {
		const pattern = `%${filters.recherche.toLowerCase()}%`;
		clauses.push(`(
			LOWER(p.nom) LIKE ?
			OR LOWER(COALESCE(p.nature, '')) LIKE ?
			OR LOWER(COALESCE(e.nom, '')) LIKE ?
		)`);
		params.push(pattern, pattern, pattern);
	}

	if (!ignoreNature && filters.natures.length) {
		const placeholders = filters.natures.map(() => '?').join(', ');
		clauses.push(`LOWER(COALESCE(p.nature, '')) IN (${placeholders})`);
		params.push(...filters.natures.map((nature) => nature.toLowerCase()));
	}

	if (filters.bio === true) {
		clauses.push('p.bio = TRUE');
	} else if (filters.bio === false) {
		clauses.push('COALESCE(p.bio, FALSE) = FALSE');
	}

	if (filters.enStock === true) {
		clauses.push('COALESCE(p.stock, 0) > 0');
	}

	if (filters.prixMin != null) {
		clauses.push('COALESCE(p.prix, 0) >= ?');
		params.push(filters.prixMin);
	}

	if (filters.prixMax != null) {
		clauses.push('COALESCE(p.prix, 0) <= ?');
		params.push(filters.prixMax);
	}

	return {
		whereClause: clauses.join(' AND '),
		params
	};
}

function buildOrderByClause(sort) {
	switch (sort) {
	case 'alpha_desc':
		return 'LOWER(COALESCE(p.nom, \'\')) DESC, p.idProduit DESC';
	case 'stock_desc':
		return 'COALESCE(p.stock, 0) DESC, LOWER(COALESCE(p.nom, \'\')) ASC, p.idProduit ASC';
	case 'rating_desc':
		return 'COALESCE(vp.noteMoyenne, 0) DESC, COALESCE(vp.nombreAvis, 0) DESC, LOWER(COALESCE(p.nom, \'\')) ASC, p.idProduit ASC';
	case 'proximity':
	case 'alpha_asc':
	default:
		return 'LOWER(COALESCE(p.nom, \'\')) ASC, p.idProduit ASC';
	}
}

function hasCompleteAddress(address) {
	return Boolean(
		normalizeText(address?.adresse_ligne) &&
		normalizeText(address?.code_postal) &&
		normalizeText(address?.ville)
	);
}

function toAddressKey(address) {
	if (!hasCompleteAddress(address)) return null;
	return [
		normalizeText(address.adresse_ligne).toLowerCase(),
		normalizeText(address.code_postal).toLowerCase(),
		normalizeText(address.ville).toLowerCase()
	].join('|');
}

function resolvePersonalAddress(profile) {
	if (!profile || profile.accountType !== 'particulier') return null;
	const address = profile.particulier || profile.client || null;
	return hasCompleteAddress(address) ? address : null;
}

function getProductSellerAddress(product) {
	const address = {
		adresse_ligne: product.entrepriseAdresseLigne,
		code_postal: product.entrepriseCodePostal,
		ville: product.entrepriseVille
	};
	return hasCompleteAddress(address) ? address : null;
}

async function geocodeWithCache(address, geocodeAddressFn) {
	const key = toAddressKey(address);
	if (!key || typeof geocodeAddressFn !== 'function') return null;
	if (geocodedAddressCache.has(key)) return geocodedAddressCache.get(key);

	try {
		const coordinates = await geocodeAddressFn(address);
		geocodedAddressCache.set(key, coordinates);
		return coordinates;
	} catch {
		return null;
	}
}

function haversineDistanceKm(origin, target) {
	const toRadians = (value) => (value * Math.PI) / 180;
	const earthRadiusKm = 6371;
	const latDelta = toRadians(target.latitude - origin.latitude);
	const lonDelta = toRadians(target.longitude - origin.longitude);
	const lat1 = toRadians(origin.latitude);
	const lat2 = toRadians(target.latitude);
	const a = Math.sin(latDelta / 2) ** 2
		+ Math.cos(lat1) * Math.cos(lat2) * Math.sin(lonDelta / 2) ** 2;

	return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function sortProductsByProximity(rows, originCoordinates, geocodeAddressFn) {
	const enrichedRows = await Promise.all(rows.map(async (row) => {
		const sellerCoordinates = await geocodeWithCache(getProductSellerAddress(row), geocodeAddressFn);
		const distanceKm = originCoordinates && sellerCoordinates
			? Number(haversineDistanceKm(originCoordinates, sellerCoordinates).toFixed(2))
			: null;

		return {
			...row,
			distanceKm
		};
	}));

	return enrichedRows.sort((left, right) => {
		const leftDistance = Number.isFinite(left.distanceKm) ? left.distanceKm : Number.POSITIVE_INFINITY;
		const rightDistance = Number.isFinite(right.distanceKm) ? right.distanceKm : Number.POSITIVE_INFINITY;
		if (leftDistance !== rightDistance) return leftDistance - rightDistance;

		const byName = String(left.nom || '').localeCompare(String(right.nom || ''), 'fr', { sensitivity: 'base' });
		if (byName !== 0) return byName;
		return Number(left.idProduit || 0) - Number(right.idProduit || 0);
	});
}

async function resolveCatalogViewerProfile(req, {
	getSessionFn,
	headersFromNode,
	getProfileByAuthUserId
}) {
	try {
		const session = await getSessionFn({ headers: headersFromNode(req.headers) });
		if (!session?.user?.id) return null;
		return await getProfileByAuthUserId(session.user.id);
	} catch {
		return null;
	}
}

export default function createProductsRouter({
	db = pool,
	getSessionFn = async ({ headers }) => auth.api.getSession({ headers }),
	headersFromNode = fromNodeHeaders,
	getProfileByAuthUserId = getBusinessProfileByAuthUserId,
	geocodeAddressFn = geocodeAddress
} = {}) {
const router = express.Router();

const PRODUCT_SELECT_SQL = `
	SELECT
		p.*,
		MAX(COALESCE(e.nom, '')) AS entrepriseNom,
		MAX(COALESCE(e.adresse_ligne, '')) AS entrepriseAdresseLigne,
		MAX(COALESCE(e.code_postal, '')) AS entrepriseCodePostal,
		MAX(COALESCE(e.ville, '')) AS entrepriseVille,
		MIN(i.path) AS imagePath,
		MAX(COALESCE(vp.noteMoyenne, 0)) AS noteMoyenneProduit,
		MAX(COALESCE(vp.nombreAvis, 0)) AS nombreAvisProduit,
		MAX(COALESCE(vpro.noteMoyenne, 0)) AS noteMoyenneProducteur,
		MAX(COALESCE(vpro.nombreAvis, 0)) AS nombreAvisProducteur
	 FROM Produit p
	 LEFT JOIN Entreprise e ON e.idEntreprise = p.idEntreprise
	 LEFT JOIN Produit_Image pi ON pi.idProduit = p.idProduit
	 LEFT JOIN Image i ON i.idImage = pi.idImage
	 LEFT JOIN Vue_Note_Moyenne_Produit vp ON vp.idProduit = p.idProduit
	 LEFT JOIN Vue_Note_Moyenne_Professionnel vpro ON vpro.idProfessionnel = p.idProfessionnel
`;

function buildCatalogSelectQuery(whereClause, orderByClause, { paginate = true } = {}) {
	return `${PRODUCT_SELECT_SQL}
		WHERE ${whereClause}
		GROUP BY p.idProduit
		ORDER BY ${orderByClause}${paginate ? '\n\t\t LIMIT ? OFFSET ?' : ''}`;
}

async function fetchAvailableNatures(client, filters) {
	const { whereClause, params } = buildCatalogFilters(filters, { ignoreNature: true });
	const [rows] = await client.query(
		`SELECT DISTINCT p.nature
		 FROM Produit p
		 LEFT JOIN Entreprise e ON e.idEntreprise = p.idEntreprise
		 WHERE ${whereClause}
		 AND p.nature IS NOT NULL
		 AND TRIM(p.nature) <> ''
		 ORDER BY p.nature ASC`,
		params
	);

	return rows
		.map((row) => normalizeText(row.nature))
		.filter(Boolean);
}

async function fetchProductById(client, idProduit) {
	const [rows] = await client.query(`${PRODUCT_SELECT_SQL} WHERE p.idProduit = ? GROUP BY p.idProduit`, [idProduit]);
	return rows[0] || null;
}

function parseCompanyId(value) {
	if (value == null || value === '') return null;
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : NaN;
}

async function findAuthorizedCompanyId(client, idProfessionnel, requestedCompanyId) {
	if (requestedCompanyId == null) return null;
	const [rows] = await client.query(
		`SELECT pe.idEntreprise
		 FROM Professionnel_Entreprise pe
		 WHERE pe.idProfessionnel = ? AND pe.idEntreprise = ?
		 LIMIT 1`,
		[idProfessionnel, requestedCompanyId]
	);
	return rows[0]?.idEntreprise || null;
}

async function fetchProductsByProfessional(client, idProfessionnel, idEntreprise = null) {
	const filters = ['p.idProfessionnel = ?'];
	const params = [idProfessionnel];
	if (idEntreprise != null) {
		filters.push('p.idEntreprise = ?');
		params.push(idEntreprise);
	}
	const [rows] = await client.query(
		`${PRODUCT_SELECT_SQL} WHERE ${filters.join(' AND ')} GROUP BY p.idProduit ORDER BY p.idProduit`,
		params
	);
	return rows;
}

/** 
 * @openapi
 * /products:
 *   get:
 *     summary: Get paginated visible products
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 9
 *     responses:
 *       200:
 *         description: Paginated products payload
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
router.get('/', async (req, res, next) => {
	try {
		const viewerProfile = await resolveCatalogViewerProfile(req, {
			getSessionFn,
			headersFromNode,
			getProfileByAuthUserId
		});
		const personalAddress = resolvePersonalAddress(viewerProfile);
		const filters = normalizeCatalogQuery(req.query, {
			fallbackSort: personalAddress ? 'proximity' : 'alpha_asc'
		});
		const offset = (filters.page - 1) * filters.limit;
		const { whereClause, params } = buildCatalogFilters(filters);
		const availableNatures = await fetchAvailableNatures(db, filters);

		let items = null;
		let total = 0;
		let appliedSort = filters.sort;
		let proximityAvailable = false;

		if (filters.sort === 'proximity' && personalAddress) {
			const originCoordinates = await geocodeWithCache(personalAddress, geocodeAddressFn);
			if (originCoordinates) {
				const [matchingRows] = await db.query(
					buildCatalogSelectQuery(whereClause, buildOrderByClause('alpha_asc'), { paginate: false }),
					params
				);
				const sortedRows = await sortProductsByProximity(matchingRows, originCoordinates, geocodeAddressFn);
				total = sortedRows.length;
				items = sortedRows.slice(offset, offset + filters.limit);
				proximityAvailable = true;
			} else {
				appliedSort = 'alpha_asc';
			}
		}

		if (!items) {
			const [[countRow]] = await db.query(
				`SELECT COUNT(DISTINCT p.idProduit) AS total
				 FROM Produit p
				 LEFT JOIN Entreprise e ON e.idEntreprise = p.idEntreprise
				 WHERE ${whereClause}`,
				params
			);
			total = Number(countRow?.total || 0);

			const [rows] = await db.query(
				buildCatalogSelectQuery(whereClause, buildOrderByClause(appliedSort)),
				[...params, filters.limit, offset]
			);
			items = rows;
		}

		res.json({
			items,
			page: filters.page,
			limit: filters.limit,
			total,
			totalPages: Math.max(1, Math.ceil(total / filters.limit)),
			sort: filters.sort,
			sortApplied: appliedSort,
			proximityAvailable,
			availableNatures
		});
	} catch (err) {
		next(err);
	}
});

/**
 * @openapi
 * /products/professionnel/{idProfessionnel}:
 *   get:
 *     summary: Get products by professionnel ID
 *     parameters:
 *       - in: path
 *         name: idProfessionnel
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the professionnel
 *     responses:
 *       200:
 *         description: List of products for the specified professionnel
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   name:
 *                     type: string
 *                   price:
 *                     type: number
 */
router.get('/professionnel/:idProfessionnel', async (req, res, next) => {
	try {
		const idProfessionnel = parseInt(req.params.idProfessionnel, 10);
		if (isNaN(idProfessionnel)) {
			return res.status(400).json({ error: 'ID professionnel invalide.' });
		}

		const requestedCompanyId = parseCompanyId(req.query?.idEntreprise);
		if (Number.isNaN(requestedCompanyId)) {
			return res.status(400).json({ error: 'Identifiant entreprise invalide.' });
		}

		const rows = await fetchProductsByProfessional(db, idProfessionnel, requestedCompanyId);
		res.json(rows);
	} catch (err) {
		next(err);
	}
});

router.get('/:idProduit', async (req, res, next) => {
	try {
		const idProduit = Number(req.params.idProduit);
		if (!Number.isInteger(idProduit) || idProduit <= 0) {
			return res.status(400).json({ error: 'Identifiant produit invalide.' });
		}

		const product = await fetchProductById(db, idProduit);
		if (!product || product.visible === 0 || product.visible === '0' || product.visible === false) {
			return res.status(404).json({ error: 'Produit introuvable.' });
		}

		return res.json(product);
	} catch (err) {
		next(err);
	}
});

// Ensure upload folder exists and configure multer
const uploadDir = path.join(process.cwd(), 'src', 'images', 'produits');
try { fsSync.mkdirSync(uploadDir, { recursive: true }); } catch (e) { /* ignore */ }

const storage = multer.diskStorage({
	destination: function (req, file, cb) {
		cb(null, uploadDir);
	},
	filename: function (req, file, cb) {
		const safe = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
		cb(null, safe);
	}
});
const upload = multer({ storage });

async function requireProfessionalSession(req, res, next) {
	try {
		const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
		if (!session) return res.status(401).json({ error: 'Non authentifié.' });

		const profile = await getBusinessProfileByAuthUserId(session.user.id);
		if (profile?.accountType !== 'professionnel' || !profile.professionnel) {
			return res.status(403).json({ error: 'Compte professionnel requis.' });
		}

		req.authSession = session;
		req.businessProfile = profile;
		return next();
	} catch (err) {
		return next(err);
	}
}

/**
 * Create product for professional (accepts multipart/form-data with `image` or JSON body)
 */
router.post('/professionnel/:idProfessionnel', requireProfessionalSession, upload.single('image'), async (req, res, next) => {
	const idProfessionnel = Number(req.params.idProfessionnel);
	if (!Number.isInteger(idProfessionnel) || idProfessionnel <= 0) {
		return res.status(400).json({ error: 'Identifiant professionnel invalide.' });
	}

	if (req.businessProfile.professionnel.id !== idProfessionnel) {
		return res.status(403).json({ error: 'Acces interdit pour ce professionnel.' });
	}

	// Accept form fields (from multipart) or JSON body
	const body = (req.body && Object.keys(req.body).length) ? req.body : req.body || {};

	const nom = body.nomProduit || body.nom || null;
	const prix = body.prix != null ? Number(body.prix) : null;
	const nature = body.nature || null;
	const unitaireOuKilo = body.unitaireOuKilo != null ? (String(body.unitaireOuKilo) === 'true' || String(body.unitaireOuKilo) === '1') : true;
	const stock = body.stock != null ? Number(body.stock) : 0;
	const bio = body.bio != null ? (String(body.bio) === 'true' || String(body.bio) === '1') : false;
	const tva = body.tva != null ? Number(body.tva) : 0;
	const reductionPro = body.reductionPro != null ? Number(body.reductionPro) : 0;
	const requestedCompanyId = parseCompanyId(body.idEntreprise ?? req.query?.idEntreprise ?? req.businessProfile?.professionnel?.entreprise?.id);

	if (Number.isNaN(requestedCompanyId)) {
		return res.status(400).json({ error: 'Identifiant entreprise invalide.' });
	}

	if (!nom || prix == null || isNaN(prix)) {
		return res.status(400).json({ error: 'Nom et prix du produit requis.' });
	}

	const conn = await pool.getConnection();
	try {
		await conn.beginTransaction();
		const companyId = await findAuthorizedCompanyId(conn, idProfessionnel, requestedCompanyId);
		if (!companyId) {
			await conn.rollback();
			return res.status(403).json({ error: 'Entreprise non autorisee pour ce professionnel.' });
		}

		let idImage = null;
		if (req.file) {
			const relPath = `/images/produits/${req.file.filename}`;
			const [imgRes] = await conn.execute('INSERT INTO Image (path) VALUES (?)', [relPath]);
			idImage = imgRes.insertId;
		}

		const [prodRes] = await conn.execute(
			`INSERT INTO Produit
			 (idProfessionnel, idEntreprise, nom, nature, unitaireOuKilo, bio, prix, tva, reductionProfessionnel, stock, visible)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
			[idProfessionnel, companyId, nom, nature, unitaireOuKilo ? 1 : 0, bio ? 1 : 0, prix, tva, reductionPro, stock]
		);

		if (idImage) {
			await conn.execute('INSERT INTO Produit_Image (idProduit, idImage) VALUES (?, ?)', [prodRes.insertId, idImage]);
		}

		await conn.commit();

		const created = await fetchProductById(db, prodRes.insertId);
		res.status(201).json(created);
	} catch (err) {
		await conn.rollback();
		return next(err);
	} finally {
		conn.release();
	}
});

// Update product
router.put('/professionnel/:idProfessionnel/:idProduit', requireProfessionalSession, upload.single('image'), async (req, res, next) => {
	const idProfessionnel = Number(req.params.idProfessionnel);
	const idProduit = Number(req.params.idProduit);
	if (!Number.isInteger(idProfessionnel) || idProfessionnel <= 0 || !Number.isInteger(idProduit) || idProduit <= 0) {
		return res.status(400).json({ error: 'Identifiants invalides.' });
	}

	if (req.businessProfile.professionnel.id !== idProfessionnel) {
		return res.status(403).json({ error: 'Acces interdit pour ce professionnel.' });
	}
	const requestedCompanyId = parseCompanyId(req.body?.idEntreprise ?? req.query?.idEntreprise);
	if (Number.isNaN(requestedCompanyId)) {
		return res.status(400).json({ error: 'Identifiant entreprise invalide.' });
	}

	const body = (req.body && Object.keys(req.body).length) ? req.body : req.body || {};

	const fieldsToUpdate = {
		nom: body.nomProduit || body.nom || undefined,
		prix: body.prix != null ? Number(body.prix) : undefined,
		nature: body.nature || undefined,
		unitaireOuKilo: body.unitaireOuKilo != null ? (String(body.unitaireOuKilo) === 'true' || String(body.unitaireOuKilo) === '1') : undefined,
		stock: body.stock != null ? Number(body.stock) : undefined,
		bio: body.bio != null ? (String(body.bio) === 'true' || String(body.bio) === '1') : undefined,
		tva: body.tva != null ? Number(body.tva) : undefined,
		reductionProfessionnel: body.reductionPro != null ? Number(body.reductionPro) : undefined,
		visible: body.visible != null ? (String(body.visible) === 'true' || String(body.visible) === '1') : undefined
	};

	const conn = await pool.getConnection();
	try {
		await conn.beginTransaction();

		const [existingRows] = await conn.execute('SELECT * FROM Produit WHERE idProduit = ? FOR UPDATE', [idProduit]);
		if (!existingRows.length) {
			await conn.rollback();
			return res.status(404).json({ error: 'Produit introuvable.' });
		}
		const existing = existingRows[0];
		if (existing.idProfessionnel !== idProfessionnel) {
			await conn.rollback();
			return res.status(403).json({ error: 'Acces interdit pour ce produit.' });
		}
		if (requestedCompanyId != null && existing.idEntreprise !== requestedCompanyId) {
			await conn.rollback();
			return res.status(403).json({ error: 'Ce produit n appartient pas a l entreprise selectionnee.' });
		}

		const [existingImageRows] = await conn.execute(
			`SELECT pi.idImage, i.path
			 FROM Produit_Image pi
			 INNER JOIN Image i ON i.idImage = pi.idImage
			 WHERE pi.idProduit = ?
			 FOR UPDATE`,
			[idProduit]
		);

		const existingImages = existingImageRows.map((row) => ({ idImage: row.idImage, path: row.path }));
		let newImageId = null;
		if (req.file) {
			const relPath = `/images/produits/${req.file.filename}`;
			const [imgRes] = await conn.execute('INSERT INTO Image (path) VALUES (?)', [relPath]);
			newImageId = imgRes.insertId;
			await conn.execute('DELETE FROM Produit_Image WHERE idProduit = ?', [idProduit]);
			await conn.execute('INSERT INTO Produit_Image (idProduit, idImage) VALUES (?, ?)', [idProduit, newImageId]);
		}

		// Build update query dynamically
		const updates = [];
		const params = [];
		if (fieldsToUpdate.nom !== undefined) { updates.push('nom = ?'); params.push(fieldsToUpdate.nom); }
		if (fieldsToUpdate.nature !== undefined) { updates.push('nature = ?'); params.push(fieldsToUpdate.nature); }
		if (fieldsToUpdate.unitaireOuKilo !== undefined) { updates.push('unitaireOuKilo = ?'); params.push(fieldsToUpdate.unitaireOuKilo ? 1 : 0); }
		if (fieldsToUpdate.bio !== undefined) { updates.push('bio = ?'); params.push(fieldsToUpdate.bio ? 1 : 0); }
		if (fieldsToUpdate.prix !== undefined) { updates.push('prix = ?'); params.push(fieldsToUpdate.prix); }
		if (fieldsToUpdate.tva !== undefined) { updates.push('tva = ?'); params.push(fieldsToUpdate.tva); }
		if (fieldsToUpdate.reductionProfessionnel !== undefined) { updates.push('reductionProfessionnel = ?'); params.push(fieldsToUpdate.reductionProfessionnel); }
		if (fieldsToUpdate.stock !== undefined) { updates.push('stock = ?'); params.push(fieldsToUpdate.stock); }
		if (fieldsToUpdate.visible !== undefined) { updates.push('visible = ?'); params.push(fieldsToUpdate.visible ? 1 : 0); }

		if (updates.length) {
			params.push(idProduit);
			await conn.execute(`UPDATE Produit SET ${updates.join(', ')} WHERE idProduit = ?`, params);
		}

		if (req.file) {
			for (const image of existingImages) {
				try {
					const localPath = path.join(process.cwd(), 'src', image.path.replace(/^\//, ''));
					await fs.unlink(localPath).catch(() => {});
				} catch (e) { /* ignore */ }

				try {
					await conn.execute(
						'DELETE FROM Image WHERE idImage = ? AND NOT EXISTS (SELECT 1 FROM Produit_Image WHERE idImage = ?)',
						[image.idImage, image.idImage]
					);
				} catch (e) { /* ignore */ }
			}
		}

		await conn.commit();

		const updated = await fetchProductById(db, idProduit);
		return res.json(updated);
	} catch (err) {
		await conn.rollback();
		return next(err);
	} finally {
		conn.release();
	}
});

// Delete product
router.delete('/professionnel/:idProfessionnel/:idProduit', requireProfessionalSession, async (req, res, next) => {
	const idProfessionnel = Number(req.params.idProfessionnel);
	const idProduit = Number(req.params.idProduit);
	if (!Number.isInteger(idProfessionnel) || idProfessionnel <= 0 || !Number.isInteger(idProduit) || idProduit <= 0) {
		return res.status(400).json({ error: 'Identifiants invalides.' });
	}

	if (req.businessProfile.professionnel.id !== idProfessionnel) {
		return res.status(403).json({ error: 'Acces interdit pour ce professionnel.' });
	}
	const requestedCompanyId = parseCompanyId(req.query?.idEntreprise);
	if (Number.isNaN(requestedCompanyId)) {
		return res.status(400).json({ error: 'Identifiant entreprise invalide.' });
	}

	const conn = await pool.getConnection();
	try {
		await conn.beginTransaction();

		if (requestedCompanyId != null) {
			const [productRows] = await conn.execute(
				'SELECT idEntreprise FROM Produit WHERE idProduit = ? FOR UPDATE',
				[idProduit]
			);
			if (!productRows.length) {
				await conn.rollback();
				return res.status(404).json({ error: 'Produit introuvable.' });
			}
			if (productRows[0].idEntreprise !== requestedCompanyId) {
				await conn.rollback();
				return res.status(403).json({ error: 'Ce produit n appartient pas a l entreprise selectionnee.' });
			}
		}

		const [rows] = await conn.execute(
			`SELECT pi.idImage, i.path
			 FROM Produit_Image pi
			 INNER JOIN Image i ON i.idImage = pi.idImage
			 WHERE pi.idProduit = ?
			 FOR UPDATE`,
			[idProduit]
		);
		if (!rows.length) { await conn.rollback(); return res.status(404).json({ error: 'Produit introuvable.' }); }
		const linkedImages = rows.map((row) => ({ idImage: row.idImage, path: row.path }));

		// delete product
		await conn.execute('DELETE FROM Produit WHERE idProduit = ?', [idProduit]);

		for (const image of linkedImages) {
			if (image.path) {
				try { await fs.unlink(path.join(process.cwd(), 'src', image.path.replace(/^\//, ''))).catch(() => {}); } catch (e) { /* ignore */ }
			}
			await conn.execute(
				'DELETE FROM Image WHERE idImage = ? AND NOT EXISTS (SELECT 1 FROM Produit_Image WHERE idImage = ?)',
				[image.idImage, image.idImage]
			);
		}

		await conn.commit();
		return res.status(204).send();
	} catch (err) {
		await conn.rollback();
		return next(err);
	} finally {
		conn.release();
	}
});

return router;
}
