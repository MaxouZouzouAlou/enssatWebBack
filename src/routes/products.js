import express from 'express';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import multer from 'multer';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../auth.js';
import pool from '../server_config/db.js';
import { getBusinessProfileByAuthUserId } from '../services/auth-profile-service.js';

export default function createProductsRouter({ db = pool } = {}) {
const router = express.Router();

function parsePositiveInteger(value, fallback, max = 100) {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
	return Math.min(parsed, max);
}

const PRODUCT_SELECT_SQL = `
	SELECT
		p.*,
		MIN(i.path) AS imagePath,
		MAX(COALESCE(vp.noteMoyenne, 0)) AS noteMoyenneProduit,
		MAX(COALESCE(vp.nombreAvis, 0)) AS nombreAvisProduit,
		MAX(COALESCE(vpro.noteMoyenne, 0)) AS noteMoyenneProducteur,
		MAX(COALESCE(vpro.nombreAvis, 0)) AS nombreAvisProducteur
	 FROM Produit p
	 LEFT JOIN Produit_Image pi ON pi.idProduit = p.idProduit
	 LEFT JOIN Image i ON i.idImage = pi.idImage
	 LEFT JOIN Vue_Note_Moyenne_Produit vp ON vp.idProduit = p.idProduit
	 LEFT JOIN Vue_Note_Moyenne_Professionnel vpro ON vpro.idProfessionnel = p.idProfessionnel
`;

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
		const page = parsePositiveInteger(req.query.page, 1, 100000);
		const limit = parsePositiveInteger(req.query.limit, 9, 30);
		const offset = (page - 1) * limit;
		const [[countRow]] = await db.query('SELECT COUNT(*) AS total FROM Produit WHERE visible = TRUE');
		const [rows] = await db.query(
			`SELECT
				p.*,
				MIN(i.path) AS imagePath,
				MAX(COALESCE(vp.noteMoyenne, 0)) AS noteMoyenneProduit,
				MAX(COALESCE(vp.nombreAvis, 0)) AS nombreAvisProduit,
				MAX(COALESCE(vpro.noteMoyenne, 0)) AS noteMoyenneProducteur,
				MAX(COALESCE(vpro.nombreAvis, 0)) AS nombreAvisProducteur
			 FROM Produit p
			 LEFT JOIN Produit_Image pi ON pi.idProduit = p.idProduit
			 LEFT JOIN Image i ON i.idImage = pi.idImage
			 LEFT JOIN Vue_Note_Moyenne_Produit vp ON vp.idProduit = p.idProduit
			 LEFT JOIN Vue_Note_Moyenne_Professionnel vpro ON vpro.idProfessionnel = p.idProfessionnel
			 WHERE p.visible = TRUE
			 GROUP BY p.idProduit
			 ORDER BY p.idProduit
			 LIMIT ? OFFSET ?`,
			[limit, offset]
		);
		const total = Number(countRow?.total || 0);
		res.json({
			items: rows,
			page,
			limit,
			total,
			totalPages: Math.max(1, Math.ceil(total / limit))
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
		if (!session) return res.status(401).json({ error: 'Non authentifie.' });

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
