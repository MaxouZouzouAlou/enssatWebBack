CREATE DATABASE IF NOT EXISTS localzh;
USE localzh;

-- -------------------------------------------------------------
-- 1. SuperAdmin
-- -------------------------------------------------------------
CREATE TABLE SuperAdmin (
    idAdmin INT PRIMARY KEY AUTO_INCREMENT
);

-- -------------------------------------------------------------
-- 2. Utilisateur  (SuperAdmin "Est un" Utilisateur : 1-1)
-- -------------------------------------------------------------
CREATE TABLE Utilisateur (
    id               INT          PRIMARY KEY AUTO_INCREMENT,
    mdp              VARCHAR(255) NOT NULL,
    type_utilisateur VARCHAR(50)  NOT NULL,
    nom              VARCHAR(100) NOT NULL,
    prenom           VARCHAR(100) NOT NULL,
    idAdmin          INT          UNIQUE,          -- FK vers SuperAdmin (0..1)
    CONSTRAINT fk_utilisateur_superadmin
        FOREIGN KEY (idAdmin) REFERENCES SuperAdmin(idAdmin)
        ON DELETE SET NULL ON UPDATE CASCADE
);
 
-- -------------------------------------------------------------
-- 3. Professionnel  (Est un Utilisateur : 1-1)
-- -------------------------------------------------------------
CREATE TABLE Professionnel (
    idProfessionnel INT          PRIMARY KEY AUTO_INCREMENT,
    id              INT          NOT NULL UNIQUE,  -- FK Utilisateur
    email           VARCHAR(255) NOT NULL,
    adresse         VARCHAR(255),
    num_telephone   VARCHAR(20),
    CONSTRAINT fk_professionnel_utilisateur
        FOREIGN KEY (id) REFERENCES Utilisateur(id)
        ON DELETE CASCADE ON UPDATE CASCADE
);
 
-- SIRET multivalué → table séparée
CREATE TABLE Professionnel_Siret (
    idProfessionnel INT         NOT NULL,
    numero_siret    VARCHAR(14) NOT NULL,
    PRIMARY KEY (idProfessionnel, numero_siret),
    CONSTRAINT fk_siret_professionnel
        FOREIGN KEY (idProfessionnel) REFERENCES Professionnel(idProfessionnel)
        ON DELETE CASCADE ON UPDATE CASCADE
);
 
-- -------------------------------------------------------------
-- 4. Particulier  (Est un Utilisateur : 1-1)
-- -------------------------------------------------------------
CREATE TABLE Particulier (
    idParticulier   INT          PRIMARY KEY AUTO_INCREMENT,
    id              INT          NOT NULL UNIQUE,  -- FK Utilisateur
    email           VARCHAR(255) NOT NULL,
    pointsFidelite  INT          NOT NULL DEFAULT 0,
    num_telephone   VARCHAR(20),
    adresse         VARCHAR(255),
    CONSTRAINT fk_particulier_utilisateur
        FOREIGN KEY (id) REFERENCES Utilisateur(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_particulier_points_nonneg CHECK (pointsFidelite >= 0)
);
 
-- -------------------------------------------------------------
-- 5. Entreprise  (liée à Professionnel : 1..* -- 1..*)
-- -------------------------------------------------------------
CREATE TABLE Entreprise (
    idEntreprise INT          PRIMARY KEY AUTO_INCREMENT,
    nom          VARCHAR(255) NOT NULL,
    siret        VARCHAR(14)  NOT NULL UNIQUE,
    latitude     FLOAT,
    longitude    FLOAT,
    CONSTRAINT chk_entreprise_geo_bounds CHECK (
        (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)) AND
        (longitude IS NULL OR (longitude >= -180 AND longitude <= 180))
    )
);
 
-- Table d'association Professionnel <-> Entreprise (N-N)
CREATE TABLE Professionnel_Entreprise (
    idProfessionnel INT NOT NULL,
    idEntreprise    INT NOT NULL,
    PRIMARY KEY (idProfessionnel, idEntreprise),
    CONSTRAINT fk_pe_professionnel
        FOREIGN KEY (idProfessionnel) REFERENCES Professionnel(idProfessionnel)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_pe_entreprise
        FOREIGN KEY (idEntreprise) REFERENCES Entreprise(idEntreprise)
        ON DELETE CASCADE ON UPDATE CASCADE
);
 
-- -------------------------------------------------------------
-- 6. Image
-- -------------------------------------------------------------
CREATE TABLE Image (
    idImage INT          PRIMARY KEY AUTO_INCREMENT,
    path    VARCHAR(500) NOT NULL
);
 
-- -------------------------------------------------------------
-- 7. Produit  (Professionnel Vend, Entreprise Possède Image)
-- -------------------------------------------------------------
CREATE TABLE Produit (
    idProduit              INT           PRIMARY KEY AUTO_INCREMENT,
    idProfessionnel        INT           NOT NULL,
    nom                    VARCHAR(255)  NOT NULL,
    nature                 VARCHAR(100),
    bio                    BOOLEAN       NOT NULL DEFAULT FALSE,
    prix                   DECIMAL(10,2) NOT NULL,
    tva                    DECIMAL(5,2)  NOT NULL DEFAULT 0,
    reductionProfessionnel DECIMAL(5,2)  NOT NULL DEFAULT 0,
    stock                  INT           NOT NULL DEFAULT 0,
    visible                BOOLEAN       NOT NULL DEFAULT TRUE,
    CONSTRAINT fk_produit_professionnel
        FOREIGN KEY (idProfessionnel) REFERENCES Professionnel(idProfessionnel)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_produit_prix_nonneg CHECK (prix >= 0),
    CONSTRAINT chk_produit_tva_range CHECK (tva >= 0 AND tva <= 100),
    CONSTRAINT chk_produit_reduction_range CHECK (reductionProfessionnel >= 0 AND reductionProfessionnel <= 100),
    CONSTRAINT chk_produit_stock_nonneg CHECK (stock >= 0)
);
 
-- Produit Possède Image (0..* -- 0..*)
CREATE TABLE Produit_Image (
    idProduit INT NOT NULL,
    idImage   INT NOT NULL,
    PRIMARY KEY (idProduit, idImage),
    CONSTRAINT fk_pi_produit
        FOREIGN KEY (idProduit) REFERENCES Produit(idProduit)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_pi_image
        FOREIGN KEY (idImage) REFERENCES Image(idImage)
        ON DELETE CASCADE ON UPDATE CASCADE
);
 
-- -------------------------------------------------------------
-- 8. LieuVente  (Entreprise Expose Produit, Professionnel Utilise)
-- -------------------------------------------------------------
CREATE TABLE LieuVente (
    idLieu    INT          PRIMARY KEY AUTO_INCREMENT,
    longitude FLOAT,
    latitude  FLOAT,
    horaires  VARCHAR(500),
    typeLieu  VARCHAR(100),
    adresse   VARCHAR(255),
    CONSTRAINT chk_lieuvente_geo_bounds CHECK (
        (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)) AND
        (longitude IS NULL OR (longitude >= -180 AND longitude <= 180))
    )
);
 
-- Entreprise expose Produit sur LieuVente (0..* -- 0..*)
CREATE TABLE Entreprise_LieuVente (
    idEntreprise INT NOT NULL,
    idLieu       INT NOT NULL,
    PRIMARY KEY (idEntreprise, idLieu),
    CONSTRAINT fk_elv_entreprise
        FOREIGN KEY (idEntreprise) REFERENCES Entreprise(idEntreprise)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_elv_lieuvente
        FOREIGN KEY (idLieu) REFERENCES LieuVente(idLieu)
        ON DELETE CASCADE ON UPDATE CASCADE
);
 
-- Professionnel Utilise LieuVente (0..* -- 1..*)
CREATE TABLE Professionnel_LieuVente (
    idProfessionnel INT NOT NULL,
    idLieu          INT NOT NULL,
    PRIMARY KEY (idProfessionnel, idLieu),
    CONSTRAINT fk_plv_professionnel
        FOREIGN KEY (idProfessionnel) REFERENCES Professionnel(idProfessionnel)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_plv_lieuvente
        FOREIGN KEY (idLieu) REFERENCES LieuVente(idLieu)
        ON DELETE CASCADE ON UPDATE CASCADE
);
 
-- -------------------------------------------------------------
-- 9. PointRelais  (entité indépendante de LieuVente)
-- -------------------------------------------------------------
CREATE TABLE PointRelais (
    idRelais  INT          PRIMARY KEY AUTO_INCREMENT,
    longitude FLOAT,
    latitude  FLOAT,
    typeLieu  VARCHAR(100),
    adresse   VARCHAR(255),
    CONSTRAINT chk_pointrelais_geo_bounds CHECK (
        (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)) AND
        (longitude IS NULL OR (longitude >= -180 AND longitude <= 180))
    )
);
 
-- -------------------------------------------------------------
-- 10. ListeCourse  (appartient à Particulier et/ou Professionnel)
-- -------------------------------------------------------------
CREATE TABLE ListeCourse (
    idListe         INT          PRIMARY KEY AUTO_INCREMENT,
    nom             VARCHAR(255) NOT NULL,
    estLivrable     BOOLEAN      NOT NULL DEFAULT TRUE,
    -- "Est dans" : ListeCourse liée à Particulier (0..*)
    idParticulier   INT,
    -- ListeCourse liée à Professionnel (0..*)
    idProfessionnel INT,
    CONSTRAINT fk_liste_particulier
        FOREIGN KEY (idParticulier) REFERENCES Particulier(idParticulier)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_liste_professionnel
        FOREIGN KEY (idProfessionnel) REFERENCES Professionnel(idProfessionnel)
        ON DELETE SET NULL ON UPDATE CASCADE
);
 
-- Produits dans une ListeCourse
CREATE TABLE ListeCourse_Produit (
    idListe   INT NOT NULL,
    idProduit INT NOT NULL,
    quantite  INT NOT NULL DEFAULT 1,
    PRIMARY KEY (idListe, idProduit),
    CONSTRAINT fk_lp_liste
        FOREIGN KEY (idListe) REFERENCES ListeCourse(idListe)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_lp_produit
        FOREIGN KEY (idProduit) REFERENCES Produit(idProduit)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_lcp_quantite_pos CHECK (quantite > 0)
);
 
-- -------------------------------------------------------------
-- 11. Commande
-- -------------------------------------------------------------
CREATE TABLE Commande (
    idCommande      INT          PRIMARY KEY AUTO_INCREMENT,
    dateCommande    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modeLivraison   VARCHAR(100),
    prixTotal       DECIMAL(10,2) NOT NULL DEFAULT 0,
    status          VARCHAR(50)  NOT NULL DEFAULT 'en_attente',
    -- Commande effectuée par Particulier (0..*)
    idParticulier   INT,
    -- Commande effectuée par Professionnel (0..*)
    idProfessionnel INT,
    CONSTRAINT fk_commande_particulier
        FOREIGN KEY (idParticulier) REFERENCES Particulier(idParticulier)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_commande_professionnel
        FOREIGN KEY (idProfessionnel) REFERENCES Professionnel(idProfessionnel)
        ON DELETE SET NULL ON UPDATE CASCADE,
    -- Une commande est portée par exactement un type de client
    CONSTRAINT chk_commande_client_unique CHECK (
        (idParticulier IS NOT NULL AND idProfessionnel IS NULL) OR
        (idParticulier IS NULL AND idProfessionnel IS NOT NULL)
    ),
    CONSTRAINT chk_commande_prix_nonneg CHECK (prixTotal >= 0)
);
 
-- -------------------------------------------------------------
-- 12. LigneCommande  (association Commande -- Produit, classe d'association)
-- -------------------------------------------------------------
CREATE TABLE LigneCommande (
    idCommande INT   NOT NULL,
    idProduit  INT   NOT NULL,
    quantite   INT   NOT NULL DEFAULT 1,
    prixTTC    DECIMAL(10,2) NOT NULL,
    PRIMARY KEY (idCommande, idProduit),
    CONSTRAINT fk_lc_commande
        FOREIGN KEY (idCommande) REFERENCES Commande(idCommande)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_lc_produit
        FOREIGN KEY (idProduit) REFERENCES Produit(idProduit)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_lc_quantite_pos CHECK (quantite > 0),
    CONSTRAINT chk_lc_prix_nonneg CHECK (prixTTC >= 0)
);
 
-- -------------------------------------------------------------
-- 13. CommandeAuto  (Peut être une Commande : 0..* -- 0..*)
-- -------------------------------------------------------------
CREATE TABLE CommandeAuto (
    idAuto          INT          PRIMARY KEY AUTO_INCREMENT,
    idRefCommande   INT          NOT NULL,   -- référence vers Commande modèle
    frequence       VARCHAR(100) NOT NULL,
    estActif        BOOLEAN      NOT NULL DEFAULT TRUE,
    prochaineEcheance DATE,
    CONSTRAINT fk_ca_commande
        FOREIGN KEY (idRefCommande) REFERENCES Commande(idCommande)
        ON DELETE CASCADE ON UPDATE CASCADE
);
 
-- -------------------------------------------------------------
-- 14. Livraison
--     3 modes exclusifs :
--       1) Livraison à domicile  → adresse renseignée, idRelais NULL, idLieu NULL
--       2) Retrait en point relais → idRelais renseigné, adresse NULL, idLieu NULL
--       3) Retrait en lieu de vente → idLieu renseigné, adresse NULL, idRelais NULL
-- -------------------------------------------------------------
CREATE TABLE Livraison (
    idLivraison INT          PRIMARY KEY AUTO_INCREMENT,
    idCommande  INT          NOT NULL,
    idParticulier   INT,
    idProfessionnel INT,
    modeLivraison ENUM('domicile', 'point_relais', 'lieu_vente') NOT NULL,
    -- Mode domicile
    adresse     VARCHAR(255),
    -- Mode point relais
    idRelais    INT,
    -- Mode lieu de vente
    idLieu      INT,
    CONSTRAINT fk_livraison_commande
        FOREIGN KEY (idCommande) REFERENCES Commande(idCommande)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_livraison_particulier
        FOREIGN KEY (idParticulier) REFERENCES Particulier(idParticulier)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_livraison_professionnel
        FOREIGN KEY (idProfessionnel) REFERENCES Professionnel(idProfessionnel)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_livraison_relais
        FOREIGN KEY (idRelais) REFERENCES PointRelais(idRelais)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_livraison_lieuvente
        FOREIGN KEY (idLieu) REFERENCES LieuVente(idLieu)
        ON DELETE SET NULL ON UPDATE CASCADE,
    -- Une livraison est rattachée à exactement un type de client
    CONSTRAINT chk_livraison_client_unique CHECK (
        (idParticulier IS NOT NULL AND idProfessionnel IS NULL) OR
        (idParticulier IS NULL AND idProfessionnel IS NOT NULL)
    ),
    -- Garantit la cohérence : un seul mode actif à la fois
    CONSTRAINT chk_livraison_mode CHECK (
        (modeLivraison = 'domicile'      AND adresse  IS NOT NULL AND idRelais IS NULL AND idLieu IS NULL) OR
        (modeLivraison = 'point_relais'  AND idRelais IS NOT NULL AND adresse  IS NULL AND idLieu IS NULL) OR
        (modeLivraison = 'lieu_vente'    AND idLieu   IS NOT NULL AND adresse  IS NULL AND idRelais IS NULL)
    )
);
 
-- -------------------------------------------------------------
-- 15. Favoris  (Particulier ou Professionnel) x (Produit ou Professionnel)
-- -------------------------------------------------------------
 
-- Particulier met un Produit en favori
CREATE TABLE Favoris_Particulier_Produit (
    idParticulier INT NOT NULL,
    idProduit     INT NOT NULL,
    PRIMARY KEY (idParticulier, idProduit),
    CONSTRAINT fk_fav_pp_particulier
        FOREIGN KEY (idParticulier) REFERENCES Particulier(idParticulier)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_fav_pp_produit
        FOREIGN KEY (idProduit) REFERENCES Produit(idProduit)
        ON DELETE CASCADE ON UPDATE CASCADE
);
 
-- Particulier met un Professionnel en favori
CREATE TABLE Favoris_Particulier_Professionnel (
    idParticulier   INT NOT NULL,
    idProfessionnel INT NOT NULL,
    PRIMARY KEY (idParticulier, idProfessionnel),
    CONSTRAINT fk_fav_ppr_particulier
        FOREIGN KEY (idParticulier) REFERENCES Particulier(idParticulier)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_fav_ppr_professionnel
        FOREIGN KEY (idProfessionnel) REFERENCES Professionnel(idProfessionnel)
        ON DELETE CASCADE ON UPDATE CASCADE
);
 
-- Professionnel met un Produit en favori
CREATE TABLE Favoris_Professionnel_Produit (
    idProfessionnel INT NOT NULL,
    idProduit       INT NOT NULL,
    PRIMARY KEY (idProfessionnel, idProduit),
    CONSTRAINT fk_fav_prp_professionnel
        FOREIGN KEY (idProfessionnel) REFERENCES Professionnel(idProfessionnel)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_fav_prp_produit
        FOREIGN KEY (idProduit) REFERENCES Produit(idProduit)
        ON DELETE CASCADE ON UPDATE CASCADE
);
 
-- Professionnel met un autre Professionnel en favori
CREATE TABLE Favoris_Professionnel_Professionnel (
    idProfessionnelSource INT NOT NULL,
    idProfessionnelCible  INT NOT NULL,
    PRIMARY KEY (idProfessionnelSource, idProfessionnelCible),
    CONSTRAINT fk_fav_prpr_source
        FOREIGN KEY (idProfessionnelSource) REFERENCES Professionnel(idProfessionnel)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_fav_prpr_cible
        FOREIGN KEY (idProfessionnelCible) REFERENCES Professionnel(idProfessionnel)
        ON DELETE CASCADE ON UPDATE CASCADE,
    -- Un professionnel ne peut pas se mettre lui-même en favori
    CONSTRAINT chk_fav_prpr_diff CHECK (idProfessionnelSource <> idProfessionnelCible)
);
 
-- =============================================================
--  FIN DU SCRIPT
-- =============================================================