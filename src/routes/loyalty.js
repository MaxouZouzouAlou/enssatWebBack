import express from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../auth.js';
import pool from '../server_config/db.js';
import { getBusinessProfileByAuthUserId } from '../services/auth-profile-service.js';

const router = express.Router();

const DEFAULT_VOUCHER_POINTS = 500;
const DEFAULT_VOUCHER_VALUE_EUR = 5;

function buildVoucherCode() {
  return `BON-${Math.random().toString(36).slice(2, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
}

async function requireParticulier(req, res, next) {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session) {
      return res.status(401).json({ error: 'Non authentifie.' });
    }

    const profile = await getBusinessProfileByAuthUserId(session.user.id);

    if (!profile?.particulier?.id) {
      return res.status(403).json({ error: 'Compte particulier requis.' });
    }

    req.authSession = session;
    req.businessProfile = profile;
    return next();
  } catch (error) {
    return next(error);
  }
}

router.get('/me', requireParticulier, async (req, res, next) => {
  try {
    const particulierId = req.businessProfile.particulier.id;

    const [[particulier]] = await pool.query(
      `SELECT idParticulier, pointsFidelite
       FROM Particulier
       WHERE idParticulier = ?
       LIMIT 1`,
      [particulierId]
    );

    const [challenges] = await pool.query(
      `SELECT
          d.idDefi,
          d.code,
          d.titre,
          d.description,
          d.pointsRecompense,
          d.maxClaims,
          COALESCE(p.claimsCount, 0) AS claimsCount,
          COALESCE(p.claimsCount, 0) < d.maxClaims AS canClaim
       FROM FideliteDefi d
       LEFT JOIN FideliteDefiProgress p
         ON p.idDefi = d.idDefi
        AND p.idParticulier = ?
       WHERE d.actif = TRUE
       ORDER BY d.idDefi ASC`,
      [particulierId]
    );

    const [vouchers] = await pool.query(
      `SELECT idBon, codeBon, valeurEuros, pointsUtilises, statut, dateCreation, dateUtilisation, dateExpiration
       FROM BonAchat
       WHERE idParticulier = ?
       ORDER BY idBon DESC`,
      [particulierId]
    );

    const points = Number(particulier?.pointsFidelite || 0);

    return res.json({
      particulierId,
      pointsFidelite: points,
      prochainPalier: {
        requiredPoints: DEFAULT_VOUCHER_POINTS,
        rewardEuro: DEFAULT_VOUCHER_VALUE_EUR,
        remainingPoints: Math.max(DEFAULT_VOUCHER_POINTS - points, 0),
      },
      challenges: challenges.map((c) => ({
        ...c,
        pointsRecompense: Number(c.pointsRecompense || 0),
        maxClaims: Number(c.maxClaims || 0),
        claimsCount: Number(c.claimsCount || 0),
        canClaim: Boolean(c.canClaim),
      })),
      vouchers: vouchers.map((v) => ({
        ...v,
        valeurEuros: Number(v.valeurEuros || 0),
        pointsUtilises: Number(v.pointsUtilises || 0),
      })),
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/challenges/:code/claim', requireParticulier, async (req, res, next) => {
  const conn = await pool.getConnection();

  try {
    const particulierId = req.businessProfile.particulier.id;
    const code = String(req.params.code || '').trim().toUpperCase();

    if (!code) {
      return res.status(400).json({ error: 'Code de defi invalide.' });
    }

    await conn.beginTransaction();

    const [challengeRows] = await conn.query(
      `SELECT idDefi, titre, pointsRecompense, maxClaims
       FROM FideliteDefi
       WHERE code = ? AND actif = TRUE
       LIMIT 1
       FOR UPDATE`,
      [code]
    );

    if (!challengeRows.length) {
      await conn.rollback();
      return res.status(404).json({ error: 'Defi introuvable.' });
    }

    const challenge = challengeRows[0];

    const [progressRows] = await conn.query(
      `SELECT idProgress, claimsCount
       FROM FideliteDefiProgress
       WHERE idParticulier = ? AND idDefi = ?
       LIMIT 1
       FOR UPDATE`,
      [particulierId, challenge.idDefi]
    );

    const currentClaims = Number(progressRows[0]?.claimsCount || 0);
    const maxClaims = Number(challenge.maxClaims || 0);

    if (currentClaims >= maxClaims) {
      await conn.rollback();
      return res.status(409).json({ error: 'Defi deja complete le nombre maximum de fois.' });
    }

    if (progressRows.length) {
      await conn.execute(
        `UPDATE FideliteDefiProgress
         SET claimsCount = claimsCount + 1,
             dateDernierClaim = NOW(),
             updatedAt = NOW()
         WHERE idProgress = ?`,
        [progressRows[0].idProgress]
      );
    } else {
      await conn.execute(
        `INSERT INTO FideliteDefiProgress
         (idParticulier, idDefi, claimsCount, dateDernierClaim, createdAt, updatedAt)
         VALUES (?, ?, 1, NOW(), NOW(), NOW())`,
        [particulierId, challenge.idDefi]
      );
    }

    await conn.execute(
      'UPDATE Particulier SET pointsFidelite = pointsFidelite + ? WHERE idParticulier = ?',
      [Number(challenge.pointsRecompense || 0), particulierId]
    );

    const [[particulier]] = await conn.query(
      'SELECT pointsFidelite FROM Particulier WHERE idParticulier = ? LIMIT 1',
      [particulierId]
    );

    await conn.commit();

    return res.status(201).json({
      challenge: {
        code,
        titre: challenge.titre,
        pointsRecompense: Number(challenge.pointsRecompense || 0),
      },
      pointsFidelite: Number(particulier?.pointsFidelite || 0),
    });
  } catch (error) {
    await conn.rollback();
    return next(error);
  } finally {
    conn.release();
  }
});

router.post('/redeem-voucher', requireParticulier, async (req, res, next) => {
  const conn = await pool.getConnection();

  try {
    const particulierId = req.businessProfile.particulier.id;
    const pointsToSpend = Number(req.body?.pointsToSpend || DEFAULT_VOUCHER_POINTS);

    if (!Number.isInteger(pointsToSpend) || pointsToSpend <= 0 || pointsToSpend % DEFAULT_VOUCHER_POINTS !== 0) {
      return res.status(400).json({ error: `pointsToSpend doit etre un multiple de ${DEFAULT_VOUCHER_POINTS}.` });
    }

    const voucherValue = (pointsToSpend / DEFAULT_VOUCHER_POINTS) * DEFAULT_VOUCHER_VALUE_EUR;

    await conn.beginTransaction();

    const [particulierRows] = await conn.query(
      'SELECT pointsFidelite FROM Particulier WHERE idParticulier = ? LIMIT 1 FOR UPDATE',
      [particulierId]
    );

    const currentPoints = Number(particulierRows[0]?.pointsFidelite || 0);

    if (currentPoints < pointsToSpend) {
      await conn.rollback();
      return res.status(409).json({ error: 'Points insuffisants pour creer ce bon.' });
    }

    await conn.execute(
      'UPDATE Particulier SET pointsFidelite = pointsFidelite - ? WHERE idParticulier = ?',
      [pointsToSpend, particulierId]
    );

    const codeBon = buildVoucherCode();
    const [insertResult] = await conn.execute(
      `INSERT INTO BonAchat
       (idParticulier, codeBon, valeurEuros, pointsUtilises, statut, dateCreation, dateExpiration)
       VALUES (?, ?, ?, ?, 'actif', NOW(), DATE_ADD(NOW(), INTERVAL 90 DAY))`,
      [particulierId, codeBon, voucherValue, pointsToSpend]
    );

    const [voucherRows] = await conn.query(
      `SELECT idBon, codeBon, valeurEuros, pointsUtilises, statut, dateCreation, dateExpiration
       FROM BonAchat
       WHERE idBon = ?
       LIMIT 1`,
      [insertResult.insertId]
    );

    const [updatedRows] = await conn.query(
      'SELECT pointsFidelite FROM Particulier WHERE idParticulier = ? LIMIT 1',
      [particulierId]
    );

    await conn.commit();

    return res.status(201).json({
      voucher: voucherRows[0],
      pointsFidelite: Number(updatedRows[0]?.pointsFidelite || 0),
    });
  } catch (error) {
    await conn.rollback();
    return next(error);
  } finally {
    conn.release();
  }
});

export default router;
