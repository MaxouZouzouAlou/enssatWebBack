import express from 'express';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import multer from 'multer';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../auth.js';
import pool from '../server_config/db.js';
import { getBusinessProfileByAuthUserId } from '../services/auth-profile-service.js';

const router = express.Router();


/** 
 * @openapi
 * /products:
 *   get:
 *     summary: Get products
 *     responses:
 *       200:
 *         description: List of products
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
router.get('/', async (req, res, next) => {
	try {
 		const [rows] = await pool.query(
 			`SELECT p.*, i.path AS imagePath
 			 FROM Produit p
 			 LEFT JOIN Image i ON p.idImage = i.idImage`
 		);

 		const enriched = await Promise.all(
 			rows.map(async (r) => {
 				const imgPath = r.imagePath;
 				if (!imgPath) return { ...r, imageData: null };

 				// map '/images/...' to workspace src/images/...
 				const localPath = path.join(process.cwd(), 'src', imgPath.replace(/^\//, ''));
 				try {
 					const buf = await fs.readFile(localPath);
 					const ext = path.extname(localPath).toLowerCase().replace('.', '') || 'jpg';
 					const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
 					return { ...r, imageData: `data:${mime};base64,${buf.toString('base64')}` };
 				} catch (err) {
 					return { ...r, imageData: null };
 				}
 			})
 		);

 		res.json(enriched);
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

		const [rows] = await pool.query(
			`SELECT p.*, i.path AS imagePath
			 FROM Produit p
			 LEFT JOIN Image i ON p.idImage = i.idImage
			 WHERE p.idProfessionnel = ?`,
			[idProfessionnel]
		);

		const enriched = await Promise.all(
			rows.map(async (r) => {
				const imgPath = r.imagePath;
				if (!imgPath) return { ...r, imageData: null };

				const localPath = path.join(process.cwd(), 'src', imgPath.replace(/^\//, ''));
				try {
					const buf = await fs.readFile(localPath);
					const ext = path.extname(localPath).toLowerCase().replace('.', '') || 'jpg';
					const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
					return { ...r, imageData: `data:${mime};base64,${buf.toString('base64')}` };
				} catch (err) {
					return { ...r, imageData: null };
				}
			})
		);

		res.json(enriched);
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
	const unitaireOuKilo = body.unitaireOuKilo != null ? (String(body.unitaireOuKilo) === 'true' || body.unitaireOuKilo === '1') : true;
	const stock = body.stock != null ? Number(body.stock) : 0;
	const bio = body.bio != null ? (String(body.bio) === 'true' || body.bio === '1') : false;
	const tva = body.tva != null ? Number(body.tva) : 0;
	const reductionPro = body.reductionPro != null ? Number(body.reductionPro) : 0;

	if (!nom || prix == null || isNaN(prix)) {
		return res.status(400).json({ error: 'Nom et prix du produit requis.' });
	}

	const conn = await pool.getConnection();
	try {
		await conn.beginTransaction();

		let idImage = null;
		if (req.file) {
			const relPath = `/images/produits/${req.file.filename}`;
			const [imgRes] = await conn.execute('INSERT INTO Image (path) VALUES (?)', [relPath]);
			idImage = imgRes.insertId;
		}

		const [prodRes] = await conn.execute(
			`INSERT INTO Produit
			 (idProfessionnel, nom, nature, unitaireOuKilo, bio, prix, tva, reductionProfessionnel, stock, visible, idImage)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?)`,
			[idProfessionnel, nom, nature, unitaireOuKilo ? 1 : 0, bio ? 1 : 0, prix, tva, reductionPro, stock, idImage]
		);

		await conn.commit();

		const insertedId = prodRes.insertId;
		const [rows] = await pool.query(
			`SELECT p.*, i.path AS imagePath
			 FROM Produit p
			 LEFT JOIN Image i ON p.idImage = i.idImage
			 WHERE p.idProduit = ?`,
			[insertedId]
		);

		res.status(201).json(rows[0] || null);
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

	const body = (req.body && Object.keys(req.body).length) ? req.body : req.body || {};

	const fieldsToUpdate = {
		nom: body.nomProduit || body.nom || undefined,
		prix: body.prix != null ? Number(body.prix) : undefined,
		nature: body.nature || undefined,
		unitaireOuKilo: body.unitaireOuKilo != null ? (String(body.unitaireOuKilo) === 'true' || body.unitaireOuKilo === '1') : undefined,
		stock: body.stock != null ? Number(body.stock) : undefined,
		bio: body.bio != null ? (String(body.bio) === 'true' || body.bio === '1') : undefined,
		tva: body.tva != null ? Number(body.tva) : undefined,
		reductionProfessionnel: body.reductionPro != null ? Number(body.reductionPro) : undefined,
		visible: body.visible != null ? (String(body.visible) === 'true' || body.visible === '1') : undefined
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

		let newImageId = existing.idImage;
		let oldImagePath = null;
		if (req.file) {
			const relPath = `/images/produits/${req.file.filename}`;
			const [imgRes] = await conn.execute('INSERT INTO Image (path) VALUES (?)', [relPath]);
			newImageId = imgRes.insertId;
			if (existing.idImage) {
				const [oldImgRows] = await conn.execute('SELECT path FROM Image WHERE idImage = ? LIMIT 1', [existing.idImage]);
				oldImagePath = oldImgRows[0]?.path || null;
			}
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
		if (req.file) { updates.push('idImage = ?'); params.push(newImageId); }

		if (updates.length) {
			params.push(idProduit);
			await conn.execute(`UPDATE Produit SET ${updates.join(', ')} WHERE idProduit = ?`, params);
		}

		if (req.file && oldImagePath) {
			// delete old file if exists
			try {
				const localPath = path.join(process.cwd(), 'src', oldImagePath.replace(/^\//, ''));
				await fs.unlink(localPath).catch(() => {});
			} catch (e) { /* ignore */ }
			// delete old image DB row
			try {
				await conn.execute('DELETE FROM Image WHERE path = ? LIMIT 1', [oldImagePath]);
			} catch (e) { /* ignore */ }
		}

		await conn.commit();

		const [rows] = await pool.query(
			`SELECT p.*, i.path AS imagePath
			 FROM Produit p
			 LEFT JOIN Image i ON p.idImage = i.idImage
			 WHERE p.idProduit = ?`,
			[idProduit]
		);
		return res.json(rows[0] || null);
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

	const conn = await pool.getConnection();
	try {
		await conn.beginTransaction();

		const [rows] = await conn.execute('SELECT idImage FROM Produit WHERE idProduit = ? FOR UPDATE', [idProduit]);
		if (!rows.length) { await conn.rollback(); return res.status(404).json({ error: 'Produit introuvable.' }); }
		const prod = rows[0];

		// delete product
		await conn.execute('DELETE FROM Produit WHERE idProduit = ?', [idProduit]);

		if (prod.idImage) {
			const [imgRows] = await conn.execute('SELECT path FROM Image WHERE idImage = ? LIMIT 1', [prod.idImage]);
			const imgPath = imgRows[0]?.path;
			if (imgPath) {
				try { await fs.unlink(path.join(process.cwd(), 'src', imgPath.replace(/^\//, ''))).catch(() => {}); } catch (e) { /* ignore */ }
			}
			await conn.execute('DELETE FROM Image WHERE idImage = ?', [prod.idImage]);
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

export default router;