import express from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../auth.js';
import pool from '../server_config/db.js';
import { getBusinessProfileByAuthUserId } from '../services/auth-profile-service.js';

const router = express.Router();

async function resolveParticulierSession(req) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });

  if (!session) {
    return { error: { status: 401, message: 'Non authentifié.' } };
  }

  const profile = await getBusinessProfileByAuthUserId(session.user.id);

  if (!profile?.particulier?.id) {
    return { error: { status: 403, message: 'Compte particulier requis.' } };
  }

  return {
    particulierId: profile.particulier.id,
    session,
  };
}

function normalizeReviewPayload(body = {}) {
  const note = Number(body.note);
  const commentaire = String(body.commentaire || '').trim() || null;

  if (!Number.isInteger(note) || note < 1 || note > 5) {
    return { error: 'La note doit etre un entier entre 1 et 5.' };
  }

  if (commentaire && commentaire.length > 1000) {
    return { error: 'Le commentaire est limite a 1000 caracteres.' };
  }

  return {
    note,
    commentaire,
  };
}

/**
 * @openapi
 * /reviews/products/{idProduit}:
 *   get:
 *     summary: Get reviews for a specific product
 *     tags:
 *       - Reviews
 *     parameters:
 *       - in: path
 *         name: idProduit
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Product reviews retrieved successfully
 *       400:
 *         description: Invalid product ID
 *       404:
 *         description: Product not found
 */
router.get('/products/:idProduit', async (req, res, next) => {
  try {
    const idProduit = Number(req.params.idProduit);

    if (!Number.isInteger(idProduit) || idProduit <= 0) {
      return res.status(400).json({ error: 'Identifiant produit invalide.' });
    }

    const [[summary]] = await pool.query(
      `SELECT
          p.idProduit,
          p.nom,
          COALESCE(ROUND(AVG(ap.note), 2), 0) AS noteMoyenne,
          COUNT(ap.idAvisProduit) AS nombreAvis
       FROM Produit p
       LEFT JOIN AvisProduit ap ON ap.idProduit = p.idProduit
       WHERE p.idProduit = ?
       GROUP BY p.idProduit, p.nom`,
      [idProduit]
    );

    if (!summary) {
      return res.status(404).json({ error: 'Produit introuvable.' });
    }

    const [reviews] = await pool.query(
      `SELECT
          ap.idAvisProduit,
          ap.note,
          ap.commentaire,
          ap.dateCreation,
          u.nom,
          u.prenom
       FROM AvisProduit ap
       JOIN Particulier pa ON pa.idParticulier = ap.idParticulier
       JOIN Utilisateur u ON u.id = pa.id
       WHERE ap.idProduit = ?
       ORDER BY ap.dateCreation DESC`,
      [idProduit]
    );

    return res.json({
      summary: {
        ...summary,
        noteMoyenne: Number(summary.noteMoyenne || 0),
        nombreAvis: Number(summary.nombreAvis || 0),
      },
      reviews,
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * @openapi
 * /reviews/products/{idProduit}:
 *   post:
 *     summary: Add or update a review for a specific product
 *     tags:
 *       - Reviews
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
 *               note:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               commentaire:
 *                 type: string
 *                 maxLength: 1000
 *     responses:
 *       201:
 *         description: Product review added or updated successfully
 *       400:
 *         description: Invalid input or product ID
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Personal account required)
 *       404:
 *         description: Product not found
 */
router.post('/products/:idProduit', async (req, res, next) => {
  try {
    const idProduit = Number(req.params.idProduit);

    if (!Number.isInteger(idProduit) || idProduit <= 0) {
      return res.status(400).json({ error: 'Identifiant produit invalide.' });
    }

    const sessionInfo = await resolveParticulierSession(req);
    if (sessionInfo.error) {
      return res.status(sessionInfo.error.status).json({ error: sessionInfo.error.message });
    }

    const normalized = normalizeReviewPayload(req.body || {});
    if (normalized.error) {
      return res.status(400).json({ error: normalized.error });
    }

    const [productRows] = await pool.query('SELECT idProduit FROM Produit WHERE idProduit = ? LIMIT 1', [idProduit]);
    if (!productRows.length) {
      return res.status(404).json({ error: 'Produit introuvable.' });
    }

    await pool.execute(
      `INSERT INTO AvisProduit (idParticulier, idProduit, note, commentaire, dateCreation, dateModification)
       VALUES (?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         note = VALUES(note),
         commentaire = VALUES(commentaire),
         dateModification = NOW()`,
      [sessionInfo.particulierId, idProduit, normalized.note, normalized.commentaire]
    );

    return res.status(201).json({
      idProduit,
      note: normalized.note,
      commentaire: normalized.commentaire,
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * @openapi
 * /reviews/professionnels/{idProfessionnel}:
 *   get:
 *     summary: Get reviews for a specific professional
 *     tags:
 *       - Reviews
 *     parameters:
 *       - in: path
 *         name: idProfessionnel
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Professional reviews retrieved successfully
 *       400:
 *         description: Invalid professional ID
 *       404:
 *         description: Professional not found
 */
router.get('/professionnels/:idProfessionnel', async (req, res, next) => {
  try {
    const idProfessionnel = Number(req.params.idProfessionnel);

    if (!Number.isInteger(idProfessionnel) || idProfessionnel <= 0) {
      return res.status(400).json({ error: 'Identifiant professionnel invalide.' });
    }

    const [[profileRow]] = await pool.query(
      `SELECT
          idProfessionnel,
          idUtilisateur,
          nom,
          prenom,
          email,
          description,
          photo,
          nombreAvis,
          noteMoyenne
       FROM Vue_Profil_Professionnel
       WHERE idProfessionnel = ?
       LIMIT 1`,
      [idProfessionnel]
    );

    if (!profileRow) {
      return res.status(404).json({ error: 'Professionnel introuvable.' });
    }

    const [[reviews], [companies]] = await Promise.all([
      pool.query(
        `SELECT
            ap.idAvisProfessionnel,
            ap.note,
            ap.commentaire,
            ap.dateCreation,
            u.nom,
            u.prenom
         FROM AvisProfessionnel ap
         JOIN Particulier pa ON pa.idParticulier = ap.idParticulier
         JOIN Utilisateur u ON u.id = pa.id
         WHERE ap.idProfessionnel = ?
         ORDER BY ap.dateCreation DESC`,
        [idProfessionnel]
      ),
      pool.query(
        `SELECT e.idEntreprise, e.nom, e.adresse_ligne, e.code_postal, e.ville
         FROM Entreprise e
         JOIN Professionnel_Entreprise pe ON pe.idEntreprise = e.idEntreprise
         WHERE pe.idProfessionnel = ?
         ORDER BY e.nom ASC`,
        [idProfessionnel]
      ),
    ]);

    const noteMoyenne = Number(profileRow.noteMoyenne || 0);
    const nombreAvis = Number(profileRow.nombreAvis || 0);

    return res.json({
      profile: {
        idProfessionnel: profileRow.idProfessionnel,
        idUtilisateur: profileRow.idUtilisateur,
        nom: profileRow.nom,
        prenom: profileRow.prenom,
        email: profileRow.email,
        description: profileRow.description,
        photo: profileRow.photo,
        nombreAvis,
        noteMoyenne,
      },
      summary: {
        idProfessionnel: profileRow.idProfessionnel,
        nom: profileRow.nom,
        prenom: profileRow.prenom,
        noteMoyenne,
        nombreAvis,
      },
      reviews,
      companies,
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * @openapi
 * /reviews/professionnels/{idProfessionnel}:
 *   post:
 *     summary: Add or update a review for a specific professional
 *     tags:
 *       - Reviews
 *     parameters:
 *       - in: path
 *         name: idProfessionnel
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
 *               note:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               commentaire:
 *                 type: string
 *                 maxLength: 1000
 *     responses:
 *       201:
 *         description: Professional review added or updated successfully
 *       400:
 *         description: Invalid input or professional ID
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Personal account required)
 *       404:
 *         description: Professional not found
 */
router.post('/professionnels/:idProfessionnel', async (req, res, next) => {
  try {
    const idProfessionnel = Number(req.params.idProfessionnel);

    if (!Number.isInteger(idProfessionnel) || idProfessionnel <= 0) {
      return res.status(400).json({ error: 'Identifiant professionnel invalide.' });
    }

    const sessionInfo = await resolveParticulierSession(req);
    if (sessionInfo.error) {
      return res.status(sessionInfo.error.status).json({ error: sessionInfo.error.message });
    }

    const normalized = normalizeReviewPayload(req.body || {});
    if (normalized.error) {
      return res.status(400).json({ error: normalized.error });
    }

    const [proRows] = await pool.query(
      'SELECT idProfessionnel FROM Professionnel WHERE idProfessionnel = ? LIMIT 1',
      [idProfessionnel]
    );

    if (!proRows.length) {
      return res.status(404).json({ error: 'Professionnel introuvable.' });
    }

    await pool.execute(
      `INSERT INTO AvisProfessionnel (idParticulier, idProfessionnel, note, commentaire, dateCreation, dateModification)
       VALUES (?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         note = VALUES(note),
         commentaire = VALUES(commentaire),
         dateModification = NOW()`,
      [sessionInfo.particulierId, idProfessionnel, normalized.note, normalized.commentaire]
    );

    return res.status(201).json({
      idProfessionnel,
      note: normalized.note,
      commentaire: normalized.commentaire,
    });
  } catch (error) {
    return next(error);
  }
});

export default router;