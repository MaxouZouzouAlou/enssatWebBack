-- =============================================================
--  SCRIPT COMPLET DE CRÉATION – BASE localzh
--  MySQL 8.x
--  Les contraintes CHECK sur colonnes avec ON DELETE SET NULL
--  sont remplacées par des TRIGGERS BEFORE INSERT / UPDATE.
-- =============================================================

DROP DATABASE IF EXISTS localzh;
CREATE DATABASE IF NOT EXISTS localzh;
USE localzh;

-- -------------------------------------------------------------
-- 0. Better Auth (ajout adapte depuis feature/pierrick-login)
-- -------------------------------------------------------------
CREATE TABLE `user` (
    id              VARCHAR(255) PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    email           VARCHAR(255) NOT NULL UNIQUE,
    emailVerified   BOOLEAN NOT NULL DEFAULT FALSE,
    role            VARCHAR(50) NOT NULL DEFAULT 'user',
    image           TEXT,
    accountType     VARCHAR(50) DEFAULT 'particulier',
    firstName       VARCHAR(100),
    lastName        VARCHAR(100),
    createdAt       DATETIME NOT NULL,
    updatedAt       DATETIME NOT NULL
);

CREATE TABLE `session` (
    id          VARCHAR(255) PRIMARY KEY,
    expiresAt   DATETIME NOT NULL,
    token       VARCHAR(255) NOT NULL UNIQUE,
    createdAt   DATETIME NOT NULL,
    updatedAt   DATETIME NOT NULL,
    ipAddress   TEXT,
    userAgent   TEXT,
    userId      VARCHAR(255) NOT NULL,
    CONSTRAINT fk_session_user
        FOREIGN KEY (userId) REFERENCES `user`(id)
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE `account` (
    id                    VARCHAR(255) PRIMARY KEY,
    accountId             VARCHAR(255) NOT NULL,
    providerId            VARCHAR(255) NOT NULL,
    userId                VARCHAR(255) NOT NULL,
    accessToken           TEXT,
    refreshToken          TEXT,
    idToken               TEXT,
    accessTokenExpiresAt  DATETIME,
    refreshTokenExpiresAt DATETIME,
    scope                 TEXT,
    password              TEXT,
    createdAt             DATETIME NOT NULL,
    updatedAt             DATETIME NOT NULL,
    CONSTRAINT fk_account_user
        FOREIGN KEY (userId) REFERENCES `user`(id)
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE `verification` (
    id          VARCHAR(255) PRIMARY KEY,
    identifier  VARCHAR(255) NOT NULL,
    value       TEXT NOT NULL,
    expiresAt   DATETIME NOT NULL,
    createdAt   DATETIME NOT NULL,
    updatedAt   DATETIME NOT NULL
);

CREATE INDEX idx_session_userId ON `session`(userId);
CREATE INDEX idx_account_userId ON `account`(userId);
CREATE INDEX idx_verification_identifier ON `verification`(identifier);

-- -------------------------------------------------------------
-- 1. SuperAdmin
-- -------------------------------------------------------------
CREATE TABLE SuperAdmin (
    idAdmin INT PRIMARY KEY AUTO_INCREMENT
);

-- -------------------------------------------------------------
-- 2. Utilisateur
-- -------------------------------------------------------------
CREATE TABLE Utilisateur (
    id               INT          PRIMARY KEY AUTO_INCREMENT,
    type_utilisateur VARCHAR(50)  NOT NULL,
    nom              VARCHAR(100) NOT NULL,
    prenom           VARCHAR(100) NOT NULL,
    email            VARCHAR(255) UNIQUE,
    num_telephone    VARCHAR(20),
    adresse_ligne    VARCHAR(255),
    code_postal      VARCHAR(10),
    ville            VARCHAR(100),
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
    pointsFidelite INT          NOT NULL DEFAULT 0,
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
    adresse_ligne VARCHAR(255),
    code_postal   VARCHAR(10),
    ville         VARCHAR(100)
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

-- Mapping entre Better Auth et les profils metier de cette branche.
CREATE TABLE AuthProfile (
    authUserId       VARCHAR(255) PRIMARY KEY,
    accountType      ENUM('particulier', 'professionnel', 'superadmin') NOT NULL,
    particulierId    INT,
    professionnelId  INT,
    entrepriseId     INT,
    createdAt        DATETIME NOT NULL,
    updatedAt        DATETIME NOT NULL,
    CONSTRAINT fk_auth_profile_user
        FOREIGN KEY (authUserId) REFERENCES `user`(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_auth_profile_particulier
        FOREIGN KEY (particulierId) REFERENCES Particulier(idParticulier)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_auth_profile_professionnel
        FOREIGN KEY (professionnelId) REFERENCES Professionnel(idProfessionnel)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_auth_profile_entreprise
        FOREIGN KEY (entrepriseId) REFERENCES Entreprise(idEntreprise)
        ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX idx_auth_profile_account_type ON AuthProfile(accountType);

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
    nature                 ENUM('Légume', 'Fruit', 'Viande', 'Boulangerie', 'Poisson', 'Laitier', 'Autre') NOT NULL,
    unitaireOuKilo         BOOLEAN       NOT NULL DEFAULT TRUE,
    bio                    BOOLEAN       NOT NULL DEFAULT FALSE,
    prix                   DECIMAL(10,2) NOT NULL,
    tva                    DECIMAL(5,2)  NOT NULL DEFAULT 0,
    reductionProfessionnel DECIMAL(5,2)  NOT NULL DEFAULT 0,
    stock                  FLOAT(8,3)    NOT NULL DEFAULT 0,
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
    horaires  VARCHAR(500),
    typeLieu  VARCHAR(100),
    adresse_ligne VARCHAR(255),
    code_postal   VARCHAR(10),
    ville         VARCHAR(100)
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

-- -------------------------------------------------------------
-- 9. PointRelais
-- -------------------------------------------------------------
CREATE TABLE PointRelais (
    idRelais  INT          PRIMARY KEY AUTO_INCREMENT,
    typeLieu  VARCHAR(100),
    adresse_ligne VARCHAR(255),
    code_postal   VARCHAR(10),
    ville         VARCHAR(100)
);

-- -------------------------------------------------------------
-- 10. Panier
-- -------------------------------------------------------------
CREATE TABLE Panier (
    idPanier        INT          PRIMARY KEY AUTO_INCREMENT,
    nom             VARCHAR(255) NOT NULL,
    estLivrable     BOOLEAN      NOT NULL DEFAULT TRUE,
    idParticulier   INT,
    idProfessionnel INT,
    CONSTRAINT fk_panier_particulier
        FOREIGN KEY (idParticulier) REFERENCES Particulier(idParticulier)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_panier_professionnel
        FOREIGN KEY (idProfessionnel) REFERENCES Professionnel(idProfessionnel)
        ON DELETE SET NULL ON UPDATE CASCADE
);

-- Produits dans un Panier
CREATE TABLE Panier_Produit (
    idPanier  INT           NOT NULL,
    idProduit INT           NOT NULL,
    quantite  DECIMAL(10,3) NOT NULL DEFAULT 1,
    PRIMARY KEY (idPanier, idProduit),
    CONSTRAINT fk_pp_panier
        FOREIGN KEY (idPanier) REFERENCES Panier(idPanier)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_pp_produit
        FOREIGN KEY (idProduit) REFERENCES Produit(idProduit)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_pp_quantite_pos CHECK (quantite > 0)
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
    quantite   FLOAT(5,3)    NOT NULL DEFAULT 1,
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
-- 15. Incidents / Alerting (ajout adapte depuis feature/pierrick-login)
-- -------------------------------------------------------------
CREATE TABLE IncidentTicket (
    idTicket              INT PRIMARY KEY AUTO_INCREMENT,
    idUtilisateurCreateur INT NOT NULL,
    titre                 VARCHAR(255) NOT NULL,
    description           TEXT NOT NULL,
    moduleConcerne        VARCHAR(100) NOT NULL,
    severite              ENUM('low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'medium',
    statut                ENUM('open', 'in_progress', 'resolved', 'closed') NOT NULL DEFAULT 'open',
    dateCreation          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    dateModification      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_incident_ticket_createur
        FOREIGN KEY (idUtilisateurCreateur) REFERENCES Utilisateur(id)
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX idx_incident_ticket_createur ON IncidentTicket(idUtilisateurCreateur);
CREATE INDEX idx_incident_ticket_statut ON IncidentTicket(statut);
CREATE INDEX idx_incident_ticket_severite ON IncidentTicket(severite);

CREATE TABLE IncidentTicketReponse (
    idReponse    INT PRIMARY KEY AUTO_INCREMENT,
    idTicket     INT NOT NULL,
    idSuperAdmin INT NOT NULL,
    message      TEXT NOT NULL,
    dateCreation DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_incident_reponse_ticket
        FOREIGN KEY (idTicket) REFERENCES IncidentTicket(idTicket)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_incident_reponse_superadmin
        FOREIGN KEY (idSuperAdmin) REFERENCES SuperAdmin(idAdmin)
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX idx_incident_reponse_ticket ON IncidentTicketReponse(idTicket);
CREATE INDEX idx_incident_reponse_superadmin ON IncidentTicketReponse(idSuperAdmin);

CREATE TABLE IncidentTicketHistorique (
    idHistorique        INT PRIMARY KEY AUTO_INCREMENT,
    idTicket            INT NOT NULL,
    ancienStatut        ENUM('open', 'in_progress', 'resolved', 'closed'),
    nouveauStatut       ENUM('open', 'in_progress', 'resolved', 'closed') NOT NULL,
    idUtilisateurAction INT NOT NULL,
    commentaire         VARCHAR(500),
    dateAction          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_incident_historique_ticket
        FOREIGN KEY (idTicket) REFERENCES IncidentTicket(idTicket)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_incident_historique_utilisateur
        FOREIGN KEY (idUtilisateurAction) REFERENCES Utilisateur(id)
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX idx_incident_historique_ticket ON IncidentTicketHistorique(idTicket);
CREATE INDEX idx_incident_historique_action_user ON IncidentTicketHistorique(idUtilisateurAction);

-- -------------------------------------------------------------
-- 16. Favoris
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

-- Vue : produits d'un panier avec détails produit
CREATE OR REPLACE VIEW Vue_Panier_Produit AS
SELECT
    pp.idPanier,
    pp.idProduit,
    pp.quantite,
    p.nom AS nomProduit,
    p.nature,
    p.unitaireOuKilo,
    p.bio,
    p.prix,
    p.tva,
    p.reductionProfessionnel,
    p.stock,
    p.visible,
    p.idProfessionnel
FROM Panier_Produit pp
JOIN Produit p ON pp.idProduit = p.idProduit;

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
INSERT INTO Utilisateur (id, type_utilisateur, nom, prenom, email, num_telephone, adresse_ligne, code_postal, ville, idAdmin) VALUES
(1,  'superadmin',    'Dupont',    'Alice',     'alice.dupont@localzh.fr',       '0600000001', '1 Rue de l\'Admin',      '35000', 'Rennes',     1),
(2,  'superadmin',    'Martin',    'Bernard',   'bernard.martin@localzh.fr',    '0600000002', '2 Rue de l\'Admin',      '35000', 'Rennes',     2),
(3,  'professionnel', 'Leroy',     'Claire',    'claire.leroy@fermebio-leroy.fr', '0611223344', '12 Rue des Champs',     '35000', 'Rennes',     NULL),
(4,  'professionnel', 'Moreau',    'David',     'david.moreau@boulangerie-moreau.fr', '0622334455', '5 Place du Marché', '35200', 'Rennes', NULL),
(5,  'professionnel', 'Simon',     'Emma',      'emma.simon@maraichere-simon.fr','0633445566', '8 Allée des Jardins',    '35700', 'Rennes',     NULL),
(6,  'particulier',   'Laurent',   'François',  'francois.laurent@email.fr',    '0655667788', '14 Rue du Bois',         '35000', 'Rennes',     NULL),
(7,  'particulier',   'Thomas',    'Gabrielle', 'gabrielle.thomas@email.fr',    '0666778899', '22 Avenue de la Paix',   '35200', 'Rennes',     NULL),
(8,  'particulier',   'Richard',   'Hugo',      'hugo.richard@email.fr',        '0677889900', '7 Boulevard du Port',   '35400', 'Saint-Malo', NULL),
(9,  'particulier',   'Petit',     'Isabelle',  'isabelle.petit@email.fr',      '0688990011', '33 Chemin des Lilas',   '35700', 'Rennes',     NULL),
(10, 'professionnel', 'Girard',    'Julien',    'julien.girard@fromagerie-girard.fr', '0644556677', '3 Impasse du Moulin', '35800', 'Dinard', NULL);

-- -------------------------------------------------------------
-- 3. Professionnel
-- -------------------------------------------------------------
INSERT INTO Professionnel (idProfessionnel, id) VALUES
(1, 3),
(2, 4),
(3, 5),
(4, 10);

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
INSERT INTO Particulier (idParticulier, id, pointsFidelite) VALUES
(1, 6, 120),
(2, 7, 45),
(3, 8, 200),
(4, 9, 10);

-- -------------------------------------------------------------
-- 5. Entreprise
-- -------------------------------------------------------------
INSERT INTO Entreprise (idEntreprise, nom, siret, adresse_ligne, code_postal, ville) VALUES
(1, 'Ferme Bio Leroy',          '12345678901234', '12 Rue des Champs',    '35000', 'Rennes'),
(2, 'Boulangerie Artisanale Moreau', '23456789012345', '5 Place du Marché', '35200', 'Rennes'),
(3, 'Maraîchère Simon',         '34567890123456', '8 Allée des Jardins',  '35700', 'Rennes'),
(4, 'Fromagerie Girard',        '45678901234567', '3 Impasse du Moulin',  '35800', 'Dinard');

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
INSERT INTO Produit (idProduit, idProfessionnel, nom, nature, unitaireOuKilo, bio, prix, tva, reductionProfessionnel, stock, visible) VALUES
(1,  1, 'Tomates cerises',     'Légume',      TRUE,  TRUE,  3.50,  5.50, 5.00,  120, TRUE),
(2,  1, 'Courgettes',          'Légume',      FALSE, TRUE,  2.00,  5.50, 0.00,  80,  TRUE),
(3,  1, 'Pommes Golden',       'Fruit',       FALSE, FALSE, 2.50,  5.50, 3.00,  99, TRUE),
(4,  1, 'Œufs fermiers (x6)',  'Viande',      TRUE,  FALSE, 2.80,  5.50, 0.00, 99, TRUE),
(5,  1, 'Miel de fleurs',      'Autre',       TRUE,  TRUE,  6.00,  5.50, 5.00, 60,  TRUE),
(6,  2, 'Baguette tradition',  'Boulangerie', TRUE,  FALSE, 1.20,  5.50, 0.00,  50,  TRUE),
(7,  2, 'Pain complet',        'Boulangerie', TRUE,  FALSE, 2.50,  5.50, 0.00,  30,  TRUE),
(8,  2, 'Brioche',             'Boulangerie', TRUE,  FALSE, 3.80,  5.50, 0.00, 20, TRUE),
(9,  3, 'Carottes (1 kg)',     'Légume',      FALSE, TRUE,  1.80,  5.50, 0.00,  99, TRUE),
(10, 3, 'Salade verte',        'Légume',      TRUE,  TRUE,  1.50,  5.50, 0.00,  80,  TRUE),
(11, 4, 'Chèvre frais',        'Laitier',     TRUE,  FALSE, 4.50, 20.00, 8.00,  40,  TRUE),
(12, 4, 'Camembert artisanal', 'Laitier',     TRUE,  FALSE, 5.00, 20.00, 5.00,  35,  TRUE),
(13, 4, 'Comté 12 mois',       'Laitier',     TRUE,  FALSE, 7.50, 20.00, 10.00, 25,  TRUE),
(14, 1, 'Courges butternut',   'Légume',      FALSE, TRUE,  3.20,  5.50, 0.00,  60,  TRUE),
(15, 2, 'Croissant',           'Boulangerie', TRUE,  FALSE, 1.30,  5.50, 0.00, 40, FALSE);

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
INSERT INTO LieuVente (idLieu, horaires, typeLieu, adresse_ligne, code_postal, ville) VALUES
(1, 'Mar-Sam 8h-19h',             'Marché',       'Place des Lices',        '35000', 'Rennes'),
(2, 'Lun-Sam 7h-13h / 15h-19h',   'Boutique',     '5 Place du Marché',      '35200', 'Rennes'),
(3, 'Mer-Dim 9h-13h',             'Marché',       'Marché de la Poterie',   '35700', 'Rennes'),
(4, 'Lun-Ven 9h-18h / Sam 9h-13h','Boutique',     '3 Impasse du Moulin',    '35800', 'Dinard'),
(5, 'Jeu 15h-19h',                'Drive fermier','Zone Artisanale Sud',    '35000', 'Rennes');

-- Entreprise_LieuVente
INSERT INTO Entreprise_LieuVente (idEntreprise, idLieu) VALUES
(1, 1),
(1, 3),
(2, 2),
(3, 1),
(3, 3),
(4, 4),
(1, 5);

-- -------------------------------------------------------------
-- 9. PointRelais
-- -------------------------------------------------------------
INSERT INTO PointRelais (idRelais, typeLieu, adresse_ligne, code_postal, ville) VALUES
(1, 'Épicerie',      '10 Rue de Nantes',            '35000', 'Rennes'),
(2, 'Tabac-Presse',  '22 Boulevard de la Liberté',  '35000', 'Rennes'),
(3, 'Pharmacie',     '5 Rue des Écoles',            '35700', 'Rennes'),
(4, 'Épicerie fine', '15 Rue du Commerce',          '35800', 'Dinard');

-- -------------------------------------------------------------
-- 10. Panier
-- -------------------------------------------------------------
INSERT INTO Panier (idPanier, nom, estLivrable, idParticulier, idProfessionnel) VALUES
(1, 'Panier du weekend',       TRUE,  1,    NULL),
(2, 'Courses hebdomadaires',   TRUE,  2,    NULL),
(3, 'Commande restaurant',     TRUE,  NULL, 2),
(4, 'Provisions fromagerie',   FALSE, NULL, 4),
(5, 'Liste de saison automne', TRUE,  3,    NULL),
(6, 'Petit déjeuner',          FALSE, 4,    NULL);

-- Panier_Produit
INSERT INTO Panier_Produit (idPanier, idProduit, quantite) VALUES
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
