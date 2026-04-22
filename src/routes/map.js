import express from 'express';
import pool from '../server_config/db.js';

const router = express.Router();

const CITY_BASE_COORDINATES = {
  Rennes: { lat: 48.1173, lng: -1.6778 },
  'Saint-Malo': { lat: 48.6493, lng: -2.0257 },
  Dinard: { lat: 48.6329, lng: -2.0627 },
};

function coordinatesForLieu({ idLieu, ville }) {
  const base = CITY_BASE_COORDINATES[ville] || CITY_BASE_COORDINATES.Rennes;
  const offset = ((Number(idLieu) || 1) % 11) * 0.0011;

  return {
    latitude: Number((base.lat + offset).toFixed(6)),
    longitude: Number((base.lng - offset).toFixed(6)),
  };
}

/**
 * @openapi
 * /map/lieux:
 *   get:
 *     summary: Liste des lieux de vente avec indicateur du nombre d'offres
 *     responses:
 *       200:
 *         description: Lieux de vente pour carte interactive
 */
router.get('/lieux', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT
          lv.idLieu,
          lv.typeLieu,
          lv.horaires,
          lv.adresse_ligne,
          lv.code_postal,
          lv.ville,
          COUNT(DISTINCT p.idProduit) AS offresCount
       FROM LieuVente lv
       LEFT JOIN Entreprise_LieuVente elv ON elv.idLieu = lv.idLieu
       LEFT JOIN Professionnel_Entreprise pe ON pe.idEntreprise = elv.idEntreprise
       LEFT JOIN Produit p ON p.idProfessionnel = pe.idProfessionnel AND p.visible = TRUE
       GROUP BY lv.idLieu, lv.typeLieu, lv.horaires, lv.adresse_ligne, lv.code_postal, lv.ville
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
    return next(err);
  }
});

/**
 * @openapi
 * /map/lieux/{idLieu}/offres:
 *   get:
 *     summary: Offres visibles sur un lieu de vente
 *     parameters:
 *       - in: path
 *         name: idLieu
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Detail du lieu et offres associees
 */
router.get('/lieux/:idLieu/offres', async (req, res, next) => {
  const idLieu = Number(req.params.idLieu);

  if (!Number.isInteger(idLieu) || idLieu <= 0) {
    return res.status(400).json({ error: 'Identifiant de lieu invalide.' });
  }

  try {
    const [lieuRows] = await pool.query(
      `SELECT idLieu, typeLieu, horaires, adresse_ligne, code_postal, ville
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
    return next(err);
  }
});

export default router;
