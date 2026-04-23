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
    return { error: { status: 401, message: 'Non authentifie.' } };
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

router.get('/professionnels/:idProfessionnel', async (req, res, next) => {
  try {
    const idProfessionnel = Number(req.params.idProfessionnel);

    if (!Number.isInteger(idProfessionnel) || idProfessionnel <= 0) {
      return res.status(400).json({ error: 'Identifiant professionnel invalide.' });
    }

    const [[summary]] = await pool.query(
      `SELECT
          p.idProfessionnel,
          u.nom,
          u.prenom,
          COALESCE(ROUND(AVG(ap.note), 2), 0) AS noteMoyenne,
          COUNT(ap.idAvisProfessionnel) AS nombreAvis
       FROM Professionnel p
       JOIN Utilisateur u ON u.id = p.id
       LEFT JOIN AvisProfessionnel ap ON ap.idProfessionnel = p.idProfessionnel
       WHERE p.idProfessionnel = ?
       GROUP BY p.idProfessionnel, u.nom, u.prenom`,
      [idProfessionnel]
    );

    if (!summary) {
      return res.status(404).json({ error: 'Professionnel introuvable.' });
    }

    const [reviews] = await pool.query(
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
