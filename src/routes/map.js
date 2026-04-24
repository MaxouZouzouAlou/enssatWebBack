import express from 'express';
import pool from '../server_config/db.js';

const router = express.Router();

function coordinatesForLieu({ latitude, longitude }) {
  if (latitude == null || longitude == null) return null;
  return { latitude: Number(latitude), longitude: Number(longitude) };
}

function isMissingTableError(err) {
  return err?.code === 'ER_NO_SUCH_TABLE';
}

/**
 * @openapi
 * /map/lieux:
 *   get:
 *     summary: Liste des lieux de vente avec indicateur du nombre d'offres
 *     tags:
 *       - Map
 *     responses:
 *       200:
 *         description: Lieux de vente pour carte interactive
 *       500:
 *         description: Server error
 */
router.get('/lieux', async (req, res, next) => {
  try {
    try {
      const [rows] = await pool.query(
        `SELECT
            lv.idLieu,
            lv.nom AS typeLieu,
            lv.horaires,
            lv.adresse_ligne,
            lv.code_postal,
            lv.ville,
            lv.latitude,
            lv.longitude,
            COUNT(DISTINCT p.idProduit) AS offresCount
         FROM LieuVente lv
         LEFT JOIN Entreprise_LieuVente elv ON elv.idLieu = lv.idLieu
         LEFT JOIN Professionnel_Entreprise pe ON pe.idEntreprise = elv.idEntreprise
         LEFT JOIN Produit p ON p.idProfessionnel = pe.idProfessionnel AND p.visible = TRUE
         GROUP BY lv.idLieu, lv.nom, lv.horaires, lv.adresse_ligne, lv.code_postal, lv.ville, lv.latitude, lv.longitude
         ORDER BY lv.idLieu ASC`
      );

      return res.json(
        rows.map((row) => ({
          idLieu: row.idLieu,
          typeLieu: row.typeLieu,
          horaires: row.horaires,
          adresse: {
            ligne: row.adresse_ligne,
            codePostal: row.code_postal,
            ville: row.ville,
          },
          coordinates: coordinatesForLieu(row),
          offresCount: Number(row.offresCount || 0),
        }))
      );
    } catch (err) {
      if (!isMissingTableError(err)) {
        throw err;
      }

      const [rows] = await pool.query(
        `SELECT
            e.idEntreprise AS idLieu,
            'Entreprise' AS typeLieu,
            NULL AS horaires,
            e.adresse_ligne,
            e.code_postal,
            e.ville,
            NULL AS latitude,
            NULL AS longitude,
            COUNT(DISTINCT p.idProduit) AS offresCount
         FROM Entreprise e
         LEFT JOIN Professionnel_Entreprise pe ON pe.idEntreprise = e.idEntreprise
         LEFT JOIN Produit p ON p.idProfessionnel = pe.idProfessionnel AND p.visible = TRUE
         GROUP BY e.idEntreprise, e.adresse_ligne, e.code_postal, e.ville
         HAVING COUNT(DISTINCT p.idProduit) > 0
         ORDER BY e.idEntreprise ASC`
      );

      return res.json(
        rows.map((row) => ({
          idLieu: row.idLieu,
          typeLieu: row.typeLieu,
          horaires: row.horaires,
          adresse: {
            ligne: row.adresse_ligne,
            codePostal: row.code_postal,
            ville: row.ville,
          },
          coordinates: coordinatesForLieu(row),
          offresCount: Number(row.offresCount || 0),
          source: 'entreprise',
        }))
      );
    }
  } catch (err) {
    if (isMissingTableError(err)) {
      return res.json([]);
    }
    return next(err);
  }
});

/**
 * @openapi
 * /map/lieux/{idLieu}/offres:
 *   get:
 *     summary: Offres visibles sur un lieu de vente
 *     tags:
 *       - Map
 *     parameters:
 *       - in: path
 *         name: idLieu
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Detail du lieu et offres associees
 *       400:
 *         description: Invalid lieu ID
 *       404:
 *         description: Lieu not found
 *       500:
 *         description: Server error
 */
router.get('/lieux/:idLieu/offres', async (req, res, next) => {
  const idLieu = Number(req.params.idLieu);

  if (!Number.isInteger(idLieu) || idLieu <= 0) {
    return res.status(400).json({ error: 'Identifiant de lieu invalide.' });
  }

  try {
    try {
      const [lieuRows] = await pool.query(
        `SELECT idLieu, nom AS typeLieu, horaires, adresse_ligne, code_postal, ville, latitude, longitude
         FROM LieuVente
         WHERE idLieu = ?
         LIMIT 1`,
        [idLieu]
      );

      if (!lieuRows.length) {
        return res.status(404).json({ error: 'Lieu de vente introuvable.' });
      }

      const [offresRows] = await pool.query(
        `SELECT DISTINCT
            p.idProduit,
            p.nom,
            p.nature,
            p.unitaireOuKilo,
            p.bio,
            p.prix,
            p.reductionProfessionnel,
            p.stock,
            p.idProfessionnel,
            u.nom AS producteurNom,
            u.prenom AS producteurPrenom,
            e.idEntreprise,
            e.nom AS entrepriseNom
         FROM Entreprise_LieuVente elv
         JOIN Professionnel_Entreprise pe ON pe.idEntreprise = elv.idEntreprise
         JOIN Produit p ON p.idProfessionnel = pe.idProfessionnel
         JOIN Professionnel pr ON pr.idProfessionnel = p.idProfessionnel
         JOIN Utilisateur u ON u.id = pr.id
         LEFT JOIN Entreprise e ON e.idEntreprise = pe.idEntreprise
         WHERE elv.idLieu = ?
           AND p.visible = TRUE
         ORDER BY p.nom ASC`,
        [idLieu]
      );

      const lieu = lieuRows[0];

      return res.json({
        lieu: {
          idLieu: lieu.idLieu,
          typeLieu: lieu.typeLieu,
          horaires: lieu.horaires,
          adresse: {
            ligne: lieu.adresse_ligne,
            codePostal: lieu.code_postal,
            ville: lieu.ville,
          },
          coordinates: coordinatesForLieu(lieu),
        },
        offres: offresRows.map((row) => ({
          idProduit: row.idProduit,
          nom: row.nom,
          nature: row.nature,
          unitaireOuKilo: Boolean(row.unitaireOuKilo),
          bio: Boolean(row.bio),
          prix: Number(row.prix),
          reductionProfessionnel: Number(row.reductionProfessionnel),
          stock: Number(row.stock),
          idProfessionnel: row.idProfessionnel,
          producteur: {
            nom: row.producteurNom,
            prenom: row.producteurPrenom,
          },
          entreprise: {
            idEntreprise: row.idEntreprise,
            nom: row.entrepriseNom,
          },
        })),
      });
    } catch (err) {
      if (!isMissingTableError(err)) {
        throw err;
      }

      const [entrepriseRows] = await pool.query(
        `SELECT
            e.idEntreprise,
            e.nom,
            e.adresse_ligne,
            e.code_postal,
            e.ville
         FROM Entreprise e
         WHERE e.idEntreprise = ?
         LIMIT 1`,
        [idLieu]
      );

      if (!entrepriseRows.length) {
        return res.status(404).json({ error: 'Lieu de vente introuvable.' });
      }

      const [offresRows] = await pool.query(
        `SELECT DISTINCT
            p.idProduit,
            p.nom,
            p.nature,
            p.unitaireOuKilo,
            p.bio,
            p.prix,
            p.reductionProfessionnel,
            p.stock,
            p.idProfessionnel,
            u.nom AS producteurNom,
            u.prenom AS producteurPrenom,
            e.idEntreprise,
            e.nom AS entrepriseNom
         FROM Professionnel_Entreprise pe
         JOIN Produit p ON p.idProfessionnel = pe.idProfessionnel
         JOIN Professionnel pr ON pr.idProfessionnel = p.idProfessionnel
         JOIN Utilisateur u ON u.id = pr.id
         JOIN Entreprise e ON e.idEntreprise = pe.idEntreprise
         WHERE pe.idEntreprise = ?
           AND p.visible = TRUE
         ORDER BY p.nom ASC`,
        [idLieu]
      );

      const entreprise = entrepriseRows[0];

      return res.json({
        lieu: {
          idLieu: entreprise.idEntreprise,
          typeLieu: 'Entreprise',
          horaires: null,
          adresse: {
            ligne: entreprise.adresse_ligne,
            codePostal: entreprise.code_postal,
            ville: entreprise.ville,
          },
          coordinates: null,
          source: 'entreprise',
        },
        offres: offresRows.map((row) => ({
          idProduit: row.idProduit,
          nom: row.nom,
          nature: row.nature,
          unitaireOuKilo: Boolean(row.unitaireOuKilo),
          bio: Boolean(row.bio),
          prix: Number(row.prix),
          reductionProfessionnel: Number(row.reductionProfessionnel),
          stock: Number(row.stock),
          idProfessionnel: row.idProfessionnel,
          producteur: {
            nom: row.producteurNom,
            prenom: row.producteurPrenom,
          },
          entreprise: {
            idEntreprise: row.idEntreprise,
            nom: row.entrepriseNom,
          },
        })),
      });
    }
  } catch (err) {
    if (isMissingTableError(err)) {
      return res.json({ lieu: null, offres: [] });
    }
    return next(err);
  }
});

export default router;