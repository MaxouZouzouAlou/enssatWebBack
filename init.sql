-- =============================================================
--  SCRIPT COMPLET DE CRÉATION – BASE localzh
--  MySQL 8.x
--  Les contraintes CHECK sur colonnes avec ON DELETE SET NULL
--  sont remplacées par des TRIGGERS BEFORE INSERT / UPDATE.
-- =============================================================

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
    idAdmin          INT          UNIQUE,
    CONSTRAINT fk_utilisateur_superadmin
        FOREIGN KEY (idAdmin) REFERENCES SuperAdmin(idAdmin)
        ON DELETE SET NULL ON UPDATE CASCADE
);

-- -------------------------------------------------------------
-- 3. Professionnel  (Est un Utilisateur : 1-1)
-- -------------------------------------------------------------
CREATE TABLE Professionnel (
    idProfessionnel INT          PRIMARY KEY AUTO_INCREMENT,
    id              INT          NOT NULL UNIQUE,
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
    idParticulier  INT          PRIMARY KEY AUTO_INCREMENT,
    id             INT          NOT NULL UNIQUE,
    email          VARCHAR(255) NOT NULL,
    pointsFidelite INT          NOT NULL DEFAULT 0,
    num_telephone  VARCHAR(20),
    adresse        VARCHAR(255),
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
        (latitude  IS NULL OR (latitude  >= -90  AND latitude  <= 90))  AND
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
-- 7. Produit
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
    CONSTRAINT chk_produit_prix_nonneg       CHECK (prix >= 0),
    CONSTRAINT chk_produit_tva_range         CHECK (tva >= 0 AND tva <= 100),
    CONSTRAINT chk_produit_reduction_range   CHECK (reductionProfessionnel >= 0 AND reductionProfessionnel <= 100),
    CONSTRAINT chk_produit_stock_nonneg      CHECK (stock >= 0)
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
-- 8. LieuVente
-- -------------------------------------------------------------
CREATE TABLE LieuVente (
    idLieu    INT          PRIMARY KEY AUTO_INCREMENT,
    longitude FLOAT,
    latitude  FLOAT,
    horaires  VARCHAR(500),
    typeLieu  VARCHAR(100),
    adresse   VARCHAR(255),
    CONSTRAINT chk_lieuvente_geo_bounds CHECK (
        (latitude  IS NULL OR (latitude  >= -90  AND latitude  <= 90))  AND
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
-- 9. PointRelais
-- -------------------------------------------------------------
CREATE TABLE PointRelais (
    idRelais  INT          PRIMARY KEY AUTO_INCREMENT,
    longitude FLOAT,
    latitude  FLOAT,
    typeLieu  VARCHAR(100),
    adresse   VARCHAR(255),
    CONSTRAINT chk_pointrelais_geo_bounds CHECK (
        (latitude  IS NULL OR (latitude  >= -90  AND latitude  <= 90))  AND
        (longitude IS NULL OR (longitude >= -180 AND longitude <= 180))
    )
);

-- -------------------------------------------------------------
-- 10. ListeCourse
-- -------------------------------------------------------------
CREATE TABLE ListeCourse (
    idListe         INT          PRIMARY KEY AUTO_INCREMENT,
    nom             VARCHAR(255) NOT NULL,
    estLivrable     BOOLEAN      NOT NULL DEFAULT TRUE,
    idParticulier   INT,
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
--     La règle "exactement un client" est assurée par triggers
--     (MySQL interdit CHECK sur une colonne avec ON DELETE SET NULL)
-- -------------------------------------------------------------
CREATE TABLE Commande (
    idCommande      INT           PRIMARY KEY AUTO_INCREMENT,
    dateCommande    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modeLivraison   VARCHAR(100),
    prixTotal       DECIMAL(10,2) NOT NULL DEFAULT 0,
    status          VARCHAR(50)   NOT NULL DEFAULT 'en_attente',
    idParticulier   INT,
    idProfessionnel INT,
    CONSTRAINT fk_commande_particulier
        FOREIGN KEY (idParticulier) REFERENCES Particulier(idParticulier)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_commande_professionnel
        FOREIGN KEY (idProfessionnel) REFERENCES Professionnel(idProfessionnel)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT chk_commande_prix_nonneg CHECK (prixTotal >= 0)
);

DELIMITER $$

CREATE TRIGGER trg_commande_client_before_insert
BEFORE INSERT ON Commande
FOR EACH ROW
BEGIN
    IF NOT (
        (NEW.idParticulier IS NOT NULL AND NEW.idProfessionnel IS NULL) OR
        (NEW.idParticulier IS NULL     AND NEW.idProfessionnel IS NOT NULL)
    ) THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Une commande doit être liée à exactement un client (Particulier OU Professionnel).';
    END IF;
END$$

CREATE TRIGGER trg_commande_client_before_update
BEFORE UPDATE ON Commande
FOR EACH ROW
BEGIN
    IF NOT (
        (NEW.idParticulier IS NOT NULL AND NEW.idProfessionnel IS NULL) OR
        (NEW.idParticulier IS NULL     AND NEW.idProfessionnel IS NOT NULL)
    ) THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Une commande doit être liée à exactement un client (Particulier OU Professionnel).';
    END IF;
END$$

DELIMITER ;

-- -------------------------------------------------------------
-- 12. LigneCommande
-- -------------------------------------------------------------
CREATE TABLE LigneCommande (
    idCommande INT           NOT NULL,
    idProduit  INT           NOT NULL,
    quantite   INT           NOT NULL DEFAULT 1,
    prixTTC    DECIMAL(10,2) NOT NULL,
    PRIMARY KEY (idCommande, idProduit),
    CONSTRAINT fk_lc_commande
        FOREIGN KEY (idCommande) REFERENCES Commande(idCommande)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_lc_produit
        FOREIGN KEY (idProduit) REFERENCES Produit(idProduit)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_lc_quantite_pos CHECK (quantite > 0),
    CONSTRAINT chk_lc_prix_nonneg  CHECK (prixTTC >= 0)
);

-- -------------------------------------------------------------
-- 13. CommandeAuto
-- -------------------------------------------------------------
CREATE TABLE CommandeAuto (
    idAuto            INT          PRIMARY KEY AUTO_INCREMENT,
    idRefCommande     INT          NOT NULL,
    frequence         VARCHAR(100) NOT NULL,
    estActif          BOOLEAN      NOT NULL DEFAULT TRUE,
    prochaineEcheance DATE,
    CONSTRAINT fk_ca_commande
        FOREIGN KEY (idRefCommande) REFERENCES Commande(idCommande)
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- -------------------------------------------------------------
-- 14. Livraison
--     3 modes exclusifs assurés par triggers
--     (même raison : ON DELETE SET NULL incompatible avec CHECK)
-- -------------------------------------------------------------
CREATE TABLE Livraison (
    idLivraison     INT          PRIMARY KEY AUTO_INCREMENT,
    idCommande      INT          NOT NULL,
    idParticulier   INT,
    idProfessionnel INT,
    modeLivraison   ENUM('domicile', 'point_relais', 'lieu_vente') NOT NULL,
    adresse         VARCHAR(255),
    idRelais        INT,
    idLieu          INT,
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
        ON DELETE SET NULL ON UPDATE CASCADE
);

DELIMITER $$

CREATE TRIGGER trg_livraison_before_insert
BEFORE INSERT ON Livraison
FOR EACH ROW
BEGIN
    -- Règle 1 : exactement un type de client
    IF NOT (
        (NEW.idParticulier IS NOT NULL AND NEW.idProfessionnel IS NULL) OR
        (NEW.idParticulier IS NULL     AND NEW.idProfessionnel IS NOT NULL)
    ) THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Une livraison doit être liée à exactement un client (Particulier OU Professionnel).';
    END IF;

    -- Règle 2 : cohérence mode de livraison / champs
    IF NOT (
        (NEW.modeLivraison = 'domicile'     AND NEW.adresse  IS NOT NULL AND NEW.idRelais IS NULL     AND NEW.idLieu IS NULL)   OR
        (NEW.modeLivraison = 'point_relais' AND NEW.idRelais IS NOT NULL AND NEW.adresse  IS NULL     AND NEW.idLieu IS NULL)   OR
        (NEW.modeLivraison = 'lieu_vente'   AND NEW.idLieu   IS NOT NULL AND NEW.adresse  IS NULL     AND NEW.idRelais IS NULL)
    ) THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Mode de livraison incohérent avec les champs adresse / idRelais / idLieu.';
    END IF;
END$$

CREATE TRIGGER trg_livraison_before_update
BEFORE UPDATE ON Livraison
FOR EACH ROW
BEGIN
    -- Règle 1 : exactement un type de client
    IF NOT (
        (NEW.idParticulier IS NOT NULL AND NEW.idProfessionnel IS NULL) OR
        (NEW.idParticulier IS NULL     AND NEW.idProfessionnel IS NOT NULL)
    ) THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Une livraison doit être liée à exactement un client (Particulier OU Professionnel).';
    END IF;

    -- Règle 2 : cohérence mode de livraison / champs
    IF NOT (
        (NEW.modeLivraison = 'domicile'     AND NEW.adresse  IS NOT NULL AND NEW.idRelais IS NULL     AND NEW.idLieu IS NULL)   OR
        (NEW.modeLivraison = 'point_relais' AND NEW.idRelais IS NOT NULL AND NEW.adresse  IS NULL     AND NEW.idLieu IS NULL)   OR
        (NEW.modeLivraison = 'lieu_vente'   AND NEW.idLieu   IS NOT NULL AND NEW.adresse  IS NULL     AND NEW.idRelais IS NULL)
    ) THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Mode de livraison incohérent avec les champs adresse / idRelais / idLieu.';
    END IF;
END$$

DELIMITER ;

-- -------------------------------------------------------------
-- 15. Favoris
-- -------------------------------------------------------------

-- Particulier -> Produit
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

-- Particulier -> Professionnel
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

-- Professionnel -> Produit
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

-- Professionnel -> Professionnel
--   La règle "un professionnel ne peut pas se mettre lui-même en favori"
--   est assurée par trigger (même limitation MySQL : FK + CHECK incompatibles)
CREATE TABLE Favoris_Professionnel_Professionnel (
    idProfessionnelSource INT NOT NULL,
    idProfessionnelCible  INT NOT NULL,
    PRIMARY KEY (idProfessionnelSource, idProfessionnelCible),
    CONSTRAINT fk_fav_prpr_source
        FOREIGN KEY (idProfessionnelSource) REFERENCES Professionnel(idProfessionnel)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_fav_prpr_cible
        FOREIGN KEY (idProfessionnelCible) REFERENCES Professionnel(idProfessionnel)
        ON DELETE CASCADE ON UPDATE CASCADE
);

DELIMITER $$

CREATE TRIGGER trg_fav_prpr_before_insert
BEFORE INSERT ON Favoris_Professionnel_Professionnel
FOR EACH ROW
BEGIN
    IF NEW.idProfessionnelSource = NEW.idProfessionnelCible THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Un professionnel ne peut pas se mettre lui-même en favori.';
    END IF;
END$$

CREATE TRIGGER trg_fav_prpr_before_update
BEFORE UPDATE ON Favoris_Professionnel_Professionnel
FOR EACH ROW
BEGIN
    IF NEW.idProfessionnelSource = NEW.idProfessionnelCible THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Un professionnel ne peut pas se mettre lui-même en favori.';
    END IF;
END$$

DELIMITER ;

-- =============================================================
--  FIN DU SCRIPT DE CRÉATION
-- =============================================================


-- =============================================================
--  PEUPLEMENT DE LA BASE localzh
-- =============================================================

-- -------------------------------------------------------------
-- 1. SuperAdmin
-- -------------------------------------------------------------
INSERT INTO SuperAdmin (idAdmin) VALUES
(1),
(2);

-- -------------------------------------------------------------
-- 2. Utilisateur
-- -------------------------------------------------------------
INSERT INTO Utilisateur (id, mdp, type_utilisateur, nom, prenom, idAdmin) VALUES
(1,  '$2b$12$hashed_password_1', 'superadmin',    'Dupont',    'Alice',   1),
(2,  '$2b$12$hashed_password_2', 'superadmin',    'Martin',    'Bernard', 2),
(3,  '$2b$12$hashed_password_3', 'professionnel', 'Leroy',     'Claire',  NULL),
(4,  '$2b$12$hashed_password_4', 'professionnel', 'Moreau',    'David',   NULL),
(5,  '$2b$12$hashed_password_5', 'professionnel', 'Simon',     'Emma',    NULL),
(6,  '$2b$12$hashed_password_6', 'particulier',   'Laurent',   'François',NULL),
(7,  '$2b$12$hashed_password_7', 'particulier',   'Thomas',    'Gabrielle',NULL),
(8,  '$2b$12$hashed_password_8', 'particulier',   'Richard',   'Hugo',    NULL),
(9,  '$2b$12$hashed_password_9', 'particulier',   'Petit',     'Isabelle',NULL),
(10, '$2b$12$hashed_password_0', 'professionnel', 'Girard',    'Julien',  NULL);

-- -------------------------------------------------------------
-- 3. Professionnel
-- -------------------------------------------------------------
INSERT INTO Professionnel (idProfessionnel, id, email, adresse, num_telephone) VALUES
(1, 3, 'claire.leroy@ferme-leroy.fr',    '12 Rue des Champs, 35000 Rennes',       '0611223344'),
(2, 4, 'david.moreau@boulangerie-moreau.fr', '5 Place du Marché, 35200 Rennes',   '0622334455'),
(3, 5, 'emma.simon@maraichere-simon.fr', '8 Allée des Jardins, 35700 Rennes',     '0633445566'),
(4, 10,'julien.girard@fromagerie-girard.fr','3 Impasse du Moulin, 35800 Dinard',  '0644556677');

-- -------------------------------------------------------------
-- SIRET multivalué
-- -------------------------------------------------------------
INSERT INTO Professionnel_Siret (idProfessionnel, numero_siret) VALUES
(1, '12345678901234'),
(1, '12345678905678'),
(2, '23456789012345'),
(3, '34567890123456'),
(4, '45678901234567'),
(4, '45678901239999');

-- -------------------------------------------------------------
-- 4. Particulier
-- -------------------------------------------------------------
INSERT INTO Particulier (idParticulier, id, email, pointsFidelite, num_telephone, adresse) VALUES
(1, 6, 'francois.laurent@email.fr',   120, '0655667788', '14 Rue du Bois, 35000 Rennes'),
(2, 7, 'gabrielle.thomas@email.fr',   45,  '0666778899', '22 Avenue de la Paix, 35200 Rennes'),
(3, 8, 'hugo.richard@email.fr',       200, '0677889900', '7 Boulevard du Port, 35400 Saint-Malo'),
(4, 9, 'isabelle.petit@email.fr',     10,  '0688990011', '33 Chemin des Lilas, 35700 Rennes');

-- -------------------------------------------------------------
-- 5. Entreprise
-- -------------------------------------------------------------
INSERT INTO Entreprise (idEntreprise, nom, siret, latitude, longitude) VALUES
(1, 'Ferme Bio Leroy',          '12345678901234', 48.1173, -1.6778),
(2, 'Boulangerie Artisanale Moreau', '23456789012345', 48.1100, -1.6800),
(3, 'Maraîchère Simon',         '34567890123456', 48.1250, -1.6500),
(4, 'Fromagerie Girard',        '45678901234567', 48.6361, -2.0078);

-- Association Professionnel <-> Entreprise
INSERT INTO Professionnel_Entreprise (idProfessionnel, idEntreprise) VALUES
(1, 1),
(2, 2),
(3, 3),
(4, 4),
(1, 3); -- Claire Leroy est aussi associée à la maraîchère Simon

-- -------------------------------------------------------------
-- 6. Image
-- -------------------------------------------------------------
INSERT INTO Image (idImage, path) VALUES
(1,  '/images/produits/tomates_cerises.jpg'),
(2,  '/images/produits/courgettes.jpg'),
(3,  '/images/produits/pain_complet.jpg'),
(4,  '/images/produits/baguette.jpg'),
(5,  '/images/produits/fromage_chevre.jpg'),
(6,  '/images/produits/camembert.jpg'),
(7,  '/images/produits/carottes.jpg'),
(8,  '/images/produits/pommes.jpg'),
(9,  '/images/produits/oeufs.jpg'),
(10, '/images/produits/miel.jpg');

-- -------------------------------------------------------------
-- 7. Produit
-- -------------------------------------------------------------
INSERT INTO Produit (idProduit, idProfessionnel, nom, nature, bio, prix, tva, reductionProfessionnel, stock, visible) VALUES
(1,  1, 'Tomates cerises',     'Légume',  TRUE,  3.50,  5.50, 5.00,  100, TRUE),
(2,  1, 'Courgettes',          'Légume',  TRUE,  2.00,  5.50, 0.00,  80,  TRUE),
(3,  1, 'Pommes Golden',       'Fruit',   FALSE, 2.50,  5.50, 3.00,  150, TRUE),
(4,  1, 'Œufs fermiers (x6)', 'Produit fermier', FALSE, 2.80, 5.50, 0.00, 200, TRUE),
(5,  1, 'Miel de fleurs',      'Produit fermier', TRUE,  6.00, 5.50, 5.00, 60,  TRUE),
(6,  2, 'Baguette tradition',  'Pain',    FALSE, 1.20,  5.50, 0.00,  50,  TRUE),
(7,  2, 'Pain complet',        'Pain',    FALSE, 2.50,  5.50, 0.00,  30,  TRUE),
(8,  2, 'Brioche',             'Viennoiserie', FALSE, 3.80, 5.50, 0.00, 20, TRUE),
(9,  3, 'Carottes (1 kg)',     'Légume',  TRUE,  1.80,  5.50, 0.00,  200, TRUE),
(10, 3, 'Salade verte',        'Légume',  TRUE,  1.50,  5.50, 0.00,  80,  TRUE),
(11, 4, 'Chèvre frais',        'Fromage', FALSE, 4.50, 20.00, 8.00,  40,  TRUE),
(12, 4, 'Camembert artisanal', 'Fromage', FALSE, 5.00, 20.00, 5.00,  35,  TRUE),
(13, 4, 'Comté 12 mois',       'Fromage', FALSE, 7.50, 20.00, 10.00, 25,  TRUE),
(14, 1, 'Courges butternut',   'Légume',  TRUE,  3.20,  5.50, 0.00,  60,  TRUE),
(15, 2, 'Croissant',           'Viennoiserie', FALSE, 1.30, 5.50, 0.00, 40, FALSE);

-- Produit_Image
INSERT INTO Produit_Image (idProduit, idImage) VALUES
(1,  1),
(2,  2),
(7,  3),
(6,  4),
(11, 5),
(12, 6),
(9,  7),
(3,  8),
(4,  9),
(5,  10),
(1,  9), -- Tomates cerises a deux images
(11, 6); -- Chèvre frais a deux images

-- -------------------------------------------------------------
-- 8. LieuVente
-- -------------------------------------------------------------
INSERT INTO LieuVente (idLieu, longitude, latitude, horaires, typeLieu, adresse) VALUES
(1, -1.6778, 48.1173, 'Mar-Sam 8h-19h',           'Marché',      'Place des Lices, 35000 Rennes'),
(2, -1.6800, 48.1100, 'Lun-Sam 7h-13h / 15h-19h', 'Boutique',    '5 Place du Marché, 35200 Rennes'),
(3, -1.6500, 48.1250, 'Mer-Dim 9h-13h',            'Marché',      'Marché de la Poterie, 35700 Rennes'),
(4, -2.0078, 48.6361, 'Lun-Ven 9h-18h / Sam 9h-13h', 'Boutique', '3 Impasse du Moulin, 35800 Dinard'),
(5, -1.7000, 48.1000, 'Jeu 15h-19h',               'Drive fermier','Zone Artisanale Sud, 35000 Rennes');

-- Entreprise_LieuVente
INSERT INTO Entreprise_LieuVente (idEntreprise, idLieu) VALUES
(1, 1),
(1, 3),
(2, 2),
(3, 1),
(3, 3),
(4, 4),
(1, 5);

-- Professionnel_LieuVente
INSERT INTO Professionnel_LieuVente (idProfessionnel, idLieu) VALUES
(1, 1),
(1, 3),
(1, 5),
(2, 2),
(3, 1),
(3, 3),
(4, 4);

-- -------------------------------------------------------------
-- 9. PointRelais
-- -------------------------------------------------------------
INSERT INTO PointRelais (idRelais, longitude, latitude, typeLieu, adresse) VALUES
(1, -1.6700, 48.1200, 'Épicerie',     '10 Rue de Nantes, 35000 Rennes'),
(2, -1.6850, 48.1050, 'Tabac-Presse', '22 Boulevard de la Liberté, 35000 Rennes'),
(3, -1.6400, 48.1300, 'Pharmacie',    '5 Rue des Écoles, 35700 Rennes'),
(4, -2.0100, 48.6400, 'Épicerie fine','15 Rue du Commerce, 35800 Dinard');

-- -------------------------------------------------------------
-- 10. ListeCourse
-- -------------------------------------------------------------
INSERT INTO ListeCourse (idListe, nom, estLivrable, idParticulier, idProfessionnel) VALUES
(1, 'Panier du weekend',       TRUE,  1,    NULL),
(2, 'Courses hebdomadaires',   TRUE,  2,    NULL),
(3, 'Commande restaurant',     TRUE,  NULL, 2),
(4, 'Provisions fromagerie',   FALSE, NULL, 4),
(5, 'Liste de saison automne', TRUE,  3,    NULL),
(6, 'Petit déjeuner',          FALSE, 4,    NULL);

-- ListeCourse_Produit
INSERT INTO ListeCourse_Produit (idListe, idProduit, quantite) VALUES
(1, 1,  2),
(1, 6,  3),
(1, 11, 1),
(2, 9,  2),
(2, 10, 1),
(2, 7,  2),
(2, 4,  1),
(3, 9,  10),
(3, 1,  5),
(3, 10, 8),
(4, 11, 6),
(4, 12, 4),
(4, 13, 3),
(5, 14, 2),
(5, 12, 1),
(6, 6,  2),
(6, 8,  1);

-- -------------------------------------------------------------
-- 11. Commande
-- -------------------------------------------------------------
INSERT INTO Commande (idCommande, dateCommande, modeLivraison, prixTotal, status, idParticulier, idProfessionnel) VALUES
(1,  '2025-03-01 10:30:00', 'domicile',     24.30, 'livree',     1,    NULL),
(2,  '2025-03-05 14:15:00', 'point_relais', 15.80, 'livree',     2,    NULL),
(3,  '2025-03-10 09:00:00', 'lieu_vente',   87.50, 'livree',     NULL, 2),
(4,  '2025-03-15 11:45:00', 'domicile',     12.60, 'en_cours',   3,    NULL),
(5,  '2025-03-20 16:00:00', 'point_relais', 45.00, 'en_attente', 1,    NULL),
(6,  '2025-03-22 08:30:00', 'lieu_vente',   32.40, 'en_attente', NULL, 3),
(7,  '2025-03-25 13:00:00', 'domicile',     18.90, 'annulee',    4,    NULL),
(8,  '2025-04-01 10:00:00', 'domicile',     56.75, 'en_cours',   NULL, 4);

-- -------------------------------------------------------------
-- 12. LigneCommande
-- -------------------------------------------------------------
INSERT INTO LigneCommande (idCommande, idProduit, quantite, prixTTC) VALUES
(1, 1,  2, 7.39),   -- Tomates cerises x2
(1, 6,  3, 3.81),   -- Baguette x3
(1, 11, 1, 5.40),   -- Chèvre frais x1
(1, 9,  2, 3.80),   -- Carottes x2
(2, 7,  2, 5.28),   -- Pain complet x2
(2, 10, 3, 4.77),   -- Salade x3
(2, 4,  2, 5.91),   -- Œufs x2
(3, 9,  10, 19.02), -- Carottes x10 (pro)
(3, 1,  5,  18.47), -- Tomates x5 (pro)
(3, 10, 8,  12.67), -- Salade x8 (pro)
(4, 6,  4,  5.07),  -- Baguette x4
(4, 8,  2,  8.02),  -- Brioche x2
(5, 13, 2,  15.90), -- Comté x2
(5, 5,  3,  19.08), -- Miel x3
(6, 9,  20, 38.00), -- Carottes x20 (pro)
(7, 2,  3,   6.35), -- Courgettes x3 (annulée)
(7, 14, 2,   6.77), -- Courges x2 (annulée)
(8, 11, 10, 48.60), -- Chèvre x10 (pro)
(8, 12, 4,  21.17); -- Camembert x4 (pro)

-- -------------------------------------------------------------
-- 13. CommandeAuto
-- -------------------------------------------------------------
INSERT INTO CommandeAuto (idAuto, idRefCommande, frequence, estActif, prochaineEcheance) VALUES
(1, 1, 'hebdomadaire',  TRUE,  '2025-04-08'),
(2, 3, 'mensuelle',     TRUE,  '2025-04-10'),
(3, 6, 'bi-mensuelle',  FALSE, NULL),
(4, 8, 'hebdomadaire',  TRUE,  '2025-04-08');

-- -------------------------------------------------------------
-- 14. Livraison
-- -------------------------------------------------------------
INSERT INTO Livraison (idLivraison, idCommande, idParticulier, idProfessionnel, modeLivraison, adresse, idRelais, idLieu) VALUES
(1, 1, 1, NULL, 'domicile',      '14 Rue du Bois, 35000 Rennes', NULL, NULL),
(2, 2, 2, NULL, 'point_relais',  NULL, 2, NULL),
(3, 3, NULL, 2,  'lieu_vente',   NULL, NULL, 2),
(4, 4, 3, NULL, 'domicile',      '7 Boulevard du Port, 35400 Saint-Malo', NULL, NULL),
(5, 5, 1, NULL, 'point_relais',  NULL, 1, NULL),
(6, 6, NULL, 3,  'lieu_vente',   NULL, NULL, 1),
(7, 7, 4, NULL, 'domicile',      '33 Chemin des Lilas, 35700 Rennes', NULL, NULL),
(8, 8, NULL, 4,  'lieu_vente',   NULL, NULL, 4);

-- -------------------------------------------------------------
-- 15. Favoris
-- -------------------------------------------------------------

-- Particulier -> Produit
INSERT INTO Favoris_Particulier_Produit (idParticulier, idProduit) VALUES
(1, 1),
(1, 11),
(1, 5),
(2, 6),
(2, 7),
(3, 12),
(3, 13),
(4, 9),
(4, 10);

-- Particulier -> Professionnel
INSERT INTO Favoris_Particulier_Professionnel (idParticulier, idProfessionnel) VALUES
(1, 1),
(1, 4),
(2, 2),
(3, 4),
(4, 1),
(4, 3);

-- Professionnel -> Produit
INSERT INTO Favoris_Professionnel_Produit (idProfessionnel, idProduit) VALUES
(2, 9),
(2, 1),
(3, 11),
(3, 12),
(4, 1),
(4, 9);

-- Professionnel -> Professionnel (ne peut pas se mettre lui-même)
INSERT INTO Favoris_Professionnel_Professionnel (idProfessionnelSource, idProfessionnelCible) VALUES
(1, 2),
(1, 4),
(2, 1),
(2, 3),
(3, 1),
(3, 4),
(4, 2);

-- =============================================================
--  FIN DU PEUPLEMENT
-- =============================================================