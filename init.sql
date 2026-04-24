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
    description     VARCHAR(1000),
    photo           VARCHAR(500),
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
-- 6. Notification
-- -------------------------------------------------------------
CREATE TABLE Notification (
    id        INT AUTO_INCREMENT PRIMARY KEY,
    userId    VARCHAR(255) NOT NULL,
    type      VARCHAR(50)  NOT NULL DEFAULT 'info',
    message   TEXT         NOT NULL,
    lien      VARCHAR(500) DEFAULT NULL,
    lu        BOOLEAN      NOT NULL DEFAULT FALSE,
    createdAt DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notification_user
        FOREIGN KEY (userId) REFERENCES `user`(id)
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX idx_notification_user ON Notification(userId);

-- -------------------------------------------------------------
-- 7. Image
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
    idEntreprise           INT           NOT NULL,
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
    CONSTRAINT fk_produit_entreprise
        FOREIGN KEY (idEntreprise) REFERENCES Entreprise(idEntreprise)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_produit_prix_nonneg       CHECK (prix >= 0),
    CONSTRAINT chk_produit_tva_range         CHECK (tva >= 0 AND tva <= 100),
    CONSTRAINT chk_produit_reduction_range   CHECK (reductionProfessionnel >= 0 AND reductionProfessionnel <= 100),
    CONSTRAINT chk_produit_stock_nonneg      CHECK (stock >= 0)
);

-- Indexes historiquement ajoutes via migrate-indexes.sql, integres ici
-- directement pour qu'un import de init.sql suffise a reconstruire la base.
CREATE INDEX idx_produit_visible          ON Produit(visible);
CREATE INDEX idx_produit_nature           ON Produit(nature);
CREATE INDEX idx_produit_professionnel    ON Produit(idProfessionnel);
CREATE INDEX idx_produit_visible_nature   ON Produit(visible, nature);
CREATE INDEX idx_produit_visible_pro      ON Produit(visible, idProfessionnel);

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
    nom  VARCHAR(100),
    adresse_ligne VARCHAR(255),
    code_postal   VARCHAR(10),
    ville         VARCHAR(100),
    latitude      DECIMAL(9,6),
    longitude     DECIMAL(9,6)
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
    nom  VARCHAR(100),
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
    modePaiement    VARCHAR(100),
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

CREATE INDEX idx_commande_particulier  ON Commande(idParticulier);
CREATE INDEX idx_commande_professionnel ON Commande(idProfessionnel);
CREATE INDEX idx_commande_date         ON Commande(dateCommande);

-- -------------------------------------------------------------
-- 12. LigneCommande
-- -------------------------------------------------------------
CREATE TABLE LigneCommande (
    idCommande INT           NOT NULL,
    idProduit  INT           NOT NULL,
    quantite   FLOAT(5,3)    NOT NULL DEFAULT 1,
    prixTTC    DECIMAL(10,2) NOT NULL,
    idLieu     INT,
    PRIMARY KEY (idCommande, idProduit),
    CONSTRAINT fk_lc_commande
        FOREIGN KEY (idCommande) REFERENCES Commande(idCommande)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_lc_produit
        FOREIGN KEY (idProduit) REFERENCES Produit(idProduit)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_lc_lieu
        FOREIGN KEY (idLieu) REFERENCES LieuVente(idLieu)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT chk_lc_quantite_pos CHECK (quantite > 0),
    CONSTRAINT chk_lc_prix_nonneg  CHECK (prixTTC >= 0)
);

CREATE INDEX idx_lignecommande_commande ON LigneCommande(idCommande);
CREATE INDEX idx_lignecommande_produit  ON LigneCommande(idProduit);

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

CREATE INDEX idx_livraison_commande ON Livraison(idCommande);

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

-- -------------------------------------------------------------
-- 17. Avis et notation
-- -------------------------------------------------------------
CREATE TABLE AvisProduit (
    idAvisProduit     INT PRIMARY KEY AUTO_INCREMENT,
    idParticulier     INT NOT NULL,
    idProduit         INT NOT NULL,
    note              TINYINT NOT NULL,
    commentaire       VARCHAR(1000),
    dateCreation      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    dateModification  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_avis_produit_note CHECK (note >= 1 AND note <= 5),
    CONSTRAINT uq_avis_produit_auteur_cible UNIQUE (idParticulier, idProduit),
    CONSTRAINT fk_avis_produit_particulier
        FOREIGN KEY (idParticulier) REFERENCES Particulier(idParticulier)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_avis_produit_produit
        FOREIGN KEY (idProduit) REFERENCES Produit(idProduit)
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX idx_avis_produit_produit ON AvisProduit(idProduit);
CREATE INDEX idx_avis_produit_note ON AvisProduit(note);

CREATE TABLE AvisProfessionnel (
    idAvisProfessionnel INT PRIMARY KEY AUTO_INCREMENT,
    idParticulier       INT NOT NULL,
    idProfessionnel     INT NOT NULL,
    note                TINYINT NOT NULL,
    commentaire         VARCHAR(1000),
    dateCreation        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    dateModification    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_avis_professionnel_note CHECK (note >= 1 AND note <= 5),
    CONSTRAINT uq_avis_professionnel_auteur_cible UNIQUE (idParticulier, idProfessionnel),
    CONSTRAINT fk_avis_professionnel_particulier
        FOREIGN KEY (idParticulier) REFERENCES Particulier(idParticulier)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_avis_professionnel_professionnel
        FOREIGN KEY (idProfessionnel) REFERENCES Professionnel(idProfessionnel)
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX idx_avis_professionnel_professionnel ON AvisProfessionnel(idProfessionnel);
CREATE INDEX idx_avis_professionnel_note ON AvisProfessionnel(note);

CREATE OR REPLACE VIEW Vue_Note_Moyenne_Produit AS
SELECT
    p.idProduit,
    p.nom,
    COUNT(ap.idAvisProduit) AS nombreAvis,
    ROUND(COALESCE(AVG(ap.note), 0), 2) AS noteMoyenne
FROM Produit p
LEFT JOIN AvisProduit ap ON ap.idProduit = p.idProduit
GROUP BY p.idProduit, p.nom;

CREATE OR REPLACE VIEW Vue_Note_Moyenne_Professionnel AS
SELECT
    pr.idProfessionnel,
    u.nom,
    u.prenom,
    COUNT(apr.idAvisProfessionnel) AS nombreAvis,
    ROUND(COALESCE(AVG(apr.note), 0), 2) AS noteMoyenne
FROM Professionnel pr
JOIN Utilisateur u ON u.id = pr.id
LEFT JOIN AvisProfessionnel apr ON apr.idProfessionnel = pr.idProfessionnel
GROUP BY pr.idProfessionnel, u.nom, u.prenom;

CREATE OR REPLACE VIEW Vue_Profil_Professionnel AS
SELECT
    pr.idProfessionnel,
    u.id AS idUtilisateur,
    u.nom,
    u.prenom,
    u.email,
    pr.description,
    pr.photo,
    COALESCE(vnp.nombreAvis, 0) AS nombreAvis,
    COALESCE(vnp.noteMoyenne, 0) AS noteMoyenne
FROM Professionnel pr
JOIN Utilisateur u ON u.id = pr.id
LEFT JOIN Vue_Note_Moyenne_Professionnel vnp ON vnp.idProfessionnel = pr.idProfessionnel;

-- -------------------------------------------------------------
-- 18. Fidelite (particuliers)
-- -------------------------------------------------------------
CREATE TABLE FideliteDefi (
    idDefi            INT PRIMARY KEY AUTO_INCREMENT,
    code              VARCHAR(60) NOT NULL UNIQUE,
    titre             VARCHAR(255) NOT NULL,
    description       VARCHAR(700),
    pointsRecompense  INT NOT NULL,
    maxClaims         INT NOT NULL DEFAULT 1,
    actif             BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT chk_defi_points_nonneg CHECK (pointsRecompense >= 0),
    CONSTRAINT chk_defi_maxclaims_pos CHECK (maxClaims > 0)
);

CREATE TABLE FideliteDefiProgress (
    idProgress        INT PRIMARY KEY AUTO_INCREMENT,
    idParticulier     INT NOT NULL,
    idDefi            INT NOT NULL,
    claimsCount       INT NOT NULL DEFAULT 0,
    dateDernierClaim  DATETIME,
    createdAt         DATETIME NOT NULL,
    updatedAt         DATETIME NOT NULL,
    CONSTRAINT uq_defi_progress UNIQUE (idParticulier, idDefi),
    CONSTRAINT chk_defi_progress_claims_nonneg CHECK (claimsCount >= 0),
    CONSTRAINT fk_defi_progress_particulier
        FOREIGN KEY (idParticulier) REFERENCES Particulier(idParticulier)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_defi_progress_defi
        FOREIGN KEY (idDefi) REFERENCES FideliteDefi(idDefi)
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE BonAchat (
    idBon            INT PRIMARY KEY AUTO_INCREMENT,
    idParticulier    INT NOT NULL,
    codeBon          VARCHAR(80) NOT NULL UNIQUE,
    valeurEuros      DECIMAL(10,2) NOT NULL,
    pointsUtilises   INT NOT NULL,
    statut           ENUM('actif', 'utilise', 'expire') NOT NULL DEFAULT 'actif',
    dateCreation     DATETIME NOT NULL,
    dateUtilisation  DATETIME,
    dateExpiration   DATETIME,
    CONSTRAINT chk_bon_valeur_pos CHECK (valeurEuros > 0),
    CONSTRAINT chk_bon_points_pos CHECK (pointsUtilises > 0),
    CONSTRAINT fk_bon_achat_particulier
        FOREIGN KEY (idParticulier) REFERENCES Particulier(idParticulier)
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX idx_bon_achat_particulier ON BonAchat(idParticulier);
CREATE INDEX idx_bon_achat_statut ON BonAchat(statut);

CREATE OR REPLACE VIEW Vue_Fidelite_Particulier AS
SELECT
    p.idParticulier,
    p.id AS idUtilisateur,
    p.pointsFidelite,
    COUNT(CASE WHEN b.statut = 'actif' THEN b.idBon END) AS bonsActifs,
    COALESCE(SUM(CASE WHEN b.statut = 'actif' THEN b.valeurEuros END), 0) AS montantBonsActifs
FROM Particulier p
LEFT JOIN BonAchat b ON b.idParticulier = p.idParticulier
GROUP BY p.idParticulier, p.id, p.pointsFidelite;

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

-- Better Auth : utilisateurs
INSERT INTO `user` (`id`, `name`, `email`, `emailVerified`, `role`, `image`, `accountType`, `firstName`, `lastName`, `createdAt`, `updatedAt`) VALUES
('Zd4kfip6or78ukt2lHV5BObQGUJ0h4Kl', 'Maëlle Riou',       'testparticulier1@gmail.com',   1, 'user', NULL, 'particulier',   'Maëlle',      'Riou',      '2026-04-23 09:02:41', '2026-04-23 09:03:03'),
('YGrii7v7iKcdvjXEznpuus97uVFcjugJ', 'Gwenn Le Berre',    'testprofessionnel1@gmail.com', 1, 'user', NULL, 'professionnel', 'Gwenn',       'Le Berre',  '2026-04-23 09:18:07', '2026-04-23 09:18:15'),
('Qp7Hn2Lm9Xc4Vb1Ts8Kd5Rj3Wy6Uf0Za', 'Yann Kervella',   'testprofessionnel2@gmail.com', 1, 'user', NULL, 'professionnel', 'Yann',        'Kervella',  '2026-04-23 09:18:07', '2026-04-23 09:18:15'),
('Bn4Rt8Yp1Lk6Jm3Nh0Vf5Dc2Xs9Qa7We', 'Nolwenn Tanguy',  'testprofessionnel3@gmail.com', 1, 'user', NULL, 'professionnel', 'Nolwenn',     'Tanguy',    '2026-04-23 09:18:07', '2026-04-23 09:18:15'),
('Hu3Ji7Ko1Lp9Mn5Bv2Cx8Dz4Sr6Ta0Ye', 'Mikael Le Goff',  'testprofessionnel4@gmail.com', 1, 'user', NULL, 'professionnel', 'Mikael',      'Le Goff',   '2026-04-23 09:18:07', '2026-04-23 09:18:15'),
('Te5Yu1Io9Pa3Sd7Fg2Hj6Kl8Zx4Cv0Bn', 'Erwan Cadiou',    'testprofessionnel5@gmail.com', 1, 'user', NULL, 'professionnel', 'Erwan',       'Cadiou',    '2026-04-23 09:18:07', '2026-04-23 09:18:15'),
('Mi2No6Pq0Rs4Tu8Vw1Xy5Za9Bc3De7Fg', 'Anne-Marie Guéguen','testprofessionnel6@gmail.com',1, 'user', NULL, 'professionnel', 'Anne-Marie',  'Guéguen',   '2026-04-23 09:18:07', '2026-04-23 09:18:15'),
('Gh8Jk2Lm6Np0Qr4St9Uv3Wx7Yz1Ab5Cd', 'Loïc Prigent',   'testprofessionnel7@gmail.com', 1, 'user', NULL, 'professionnel', 'Loïc',        'Prigent',   '2026-04-23 09:18:07', '2026-04-23 09:18:15'),
('Sa9Uy3Ti7Re1Wa5Dm8Fn2Ko6Lp4Xz0Qc', 'Super Admin',    'testsuperadmin1@gmail.com',    1, 'admin', NULL, 'superadmin',   'Super',       'Admin',     '2026-04-23 09:25:00', '2026-04-23 09:25:00');

-- Better Auth : comptes (mots de passe hashés)
INSERT INTO `account` (`id`, `accountId`, `providerId`, `userId`, `accessToken`, `refreshToken`, `idToken`, `accessTokenExpiresAt`, `refreshTokenExpiresAt`, `scope`, `password`, `createdAt`, `updatedAt`) VALUES
('IdNFDEtsGD7KsJoJ8o22xZXWjrPE45DU', 'Zd4kfip6or78ukt2lHV5BObQGUJ0h4Kl', 'credential', 'Zd4kfip6or78ukt2lHV5BObQGUJ0h4Kl', NULL, NULL, NULL, NULL, NULL, NULL, '8c4548400b2c989c6ef708454aac8226:cc89672727ff497b49367abc8ad29689b782fd7aafa8015be45e7df406eea485444b8ee331c101d56b373be18a08edfbf30a67f4c97266cff1b71feeedb2436d', '2026-04-23 09:02:41', '2026-04-23 09:02:41'),
('LzRTrX3qJvgRXgicsYEWWEpu9H2G5rox', 'YGrii7v7iKcdvjXEznpuus97uVFcjugJ', 'credential', 'YGrii7v7iKcdvjXEznpuus97uVFcjugJ', NULL, NULL, NULL, NULL, NULL, NULL, 'f6dc03a5329dc37db121c5781fc3194d:4788b30804eff32e996c751595ba68f13fc4671a7a4a6b83c7ea8ec2989a0e68642d9e1fc8f3a143c5761871b698a4eda234533c2096ea4388c01ccfccd17388',  '2026-04-23 09:18:07', '2026-04-23 09:18:07'),
('Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk', 'Qp7Hn2Lm9Xc4Vb1Ts8Kd5Rj3Wy6Uf0Za', 'credential', 'Qp7Hn2Lm9Xc4Vb1Ts8Kd5Rj3Wy6Uf0Za', NULL, NULL, NULL, NULL, NULL, NULL, 'f6dc03a5329dc37db121c5781fc3194d:4788b30804eff32e996c751595ba68f13fc4671a7a4a6b83c7ea8ec2989a0e68642d9e1fc8f3a143c5761871b698a4eda234533c2096ea4388c01ccfccd17388', '2026-04-23 09:18:07', '2026-04-23 09:18:07'),
('Ll9Mm8Nn7Oo6Pp5Qq4Rr3Ss2Tt1Uu0Vv', 'Bn4Rt8Yp1Lk6Jm3Nh0Vf5Dc2Xs9Qa7We', 'credential', 'Bn4Rt8Yp1Lk6Jm3Nh0Vf5Dc2Xs9Qa7We', NULL, NULL, NULL, NULL, NULL, NULL, 'f6dc03a5329dc37db121c5781fc3194d:4788b30804eff32e996c751595ba68f13fc4671a7a4a6b83c7ea8ec2989a0e68642d9e1fc8f3a143c5761871b698a4eda234533c2096ea4388c01ccfccd17388', '2026-04-23 09:18:07', '2026-04-23 09:18:07'),
('Ww1Xx2Yy3Zz4Aa5Bb6Cc7Dd8Ee9Ff0Gg', 'Hu3Ji7Ko1Lp9Mn5Bv2Cx8Dz4Sr6Ta0Ye', 'credential', 'Hu3Ji7Ko1Lp9Mn5Bv2Cx8Dz4Sr6Ta0Ye', NULL, NULL, NULL, NULL, NULL, NULL, 'f6dc03a5329dc37db121c5781fc3194d:4788b30804eff32e996c751595ba68f13fc4671a7a4a6b83c7ea8ec2989a0e68642d9e1fc8f3a143c5761871b698a4eda234533c2096ea4388c01ccfccd17388', '2026-04-23 09:18:07', '2026-04-23 09:18:07'),
('Hh0Ii1Jj2Kk3Ll4Mm5Nn6Oo7Pp8Qq9Rr', 'Te5Yu1Io9Pa3Sd7Fg2Hj6Kl8Zx4Cv0Bn', 'credential', 'Te5Yu1Io9Pa3Sd7Fg2Hj6Kl8Zx4Cv0Bn', NULL, NULL, NULL, NULL, NULL, NULL, 'f6dc03a5329dc37db121c5781fc3194d:4788b30804eff32e996c751595ba68f13fc4671a7a4a6b83c7ea8ec2989a0e68642d9e1fc8f3a143c5761871b698a4eda234533c2096ea4388c01ccfccd17388', '2026-04-23 09:18:07', '2026-04-23 09:18:07'),
('Ss9Tt8Uu7Vv6Ww5Xx4Yy3Zz2Aa1Bb0Cc', 'Mi2No6Pq0Rs4Tu8Vw1Xy5Za9Bc3De7Fg', 'credential', 'Mi2No6Pq0Rs4Tu8Vw1Xy5Za9Bc3De7Fg', NULL, NULL, NULL, NULL, NULL, NULL, 'f6dc03a5329dc37db121c5781fc3194d:4788b30804eff32e996c751595ba68f13fc4671a7a4a6b83c7ea8ec2989a0e68642d9e1fc8f3a143c5761871b698a4eda234533c2096ea4388c01ccfccd17388', '2026-04-23 09:18:07', '2026-04-23 09:18:07'),
('Dd1Ee2Ff3Gg4Hh5Ii6Jj7Kk8Ll9Mm0Nn', 'Gh8Jk2Lm6Np0Qr4St9Uv3Wx7Yz1Ab5Cd', 'credential', 'Gh8Jk2Lm6Np0Qr4St9Uv3Wx7Yz1Ab5Cd', NULL, NULL, NULL, NULL, NULL, NULL, 'f6dc03a5329dc37db121c5781fc3194d:4788b30804eff32e996c751595ba68f13fc4671a7a4a6b83c7ea8ec2989a0e68642d9e1fc8f3a143c5761871b698a4eda234533c2096ea4388c01ccfccd17388', '2026-04-23 09:18:07', '2026-04-23 09:18:07'),
('Qa2Ws3Ed4Rf5Tg6Yh7Uj8Ik9Ol0Pm1Zn', 'Sa9Uy3Ti7Re1Wa5Dm8Fn2Ko6Lp4Xz0Qc', 'credential', 'Sa9Uy3Ti7Re1Wa5Dm8Fn2Ko6Lp4Xz0Qc', NULL, NULL, NULL, NULL, NULL, NULL, 'f6dc03a5329dc37db121c5781fc3194d:4788b30804eff32e996c751595ba68f13fc4671a7a4a6b83c7ea8ec2989a0e68642d9e1fc8f3a143c5761871b698a4eda234533c2096ea4388c01ccfccd17388', '2026-04-23 09:25:00', '2026-04-23 09:25:00');

-- SuperAdmin
INSERT INTO `SuperAdmin` (`idAdmin`) VALUES (1);

-- Utilisateurs métier
INSERT INTO `Utilisateur` (`id`, `type_utilisateur`, `nom`, `prenom`, `email`, `num_telephone`, `adresse_ligne`, `code_postal`, `ville`, `idAdmin`) VALUES
(1, 'particulier',   'Riou',     'Maëlle',      'testparticulier1@gmail.com',   '0296370045', '15 rue de la Trinité',         '22300', 'Lannion', NULL),
(2, 'professionnel', 'Le Berre', 'Gwenn',       'testprofessionnel1@gmail.com', '0296481203', '1 place du Général Leclerc',   '22300', 'Lannion', NULL),
(3, 'professionnel', 'Kervella', 'Yann',        'testprofessionnel2@gmail.com', '0296484521', '12 rue des Hortensias',        '22300', 'Lannion', NULL),
(4, 'professionnel', 'Tanguy',   'Nolwenn',     'testprofessionnel3@gmail.com', '0296376892', '8 quai d\'Aiguillon',          '22300', 'Lannion', NULL),
(5, 'professionnel', 'Le Goff',  'Mikael',      'testprofessionnel4@gmail.com', '0296370167', '5 rue Jean Savidan',           '22300', 'Lannion', NULL),
(6, 'professionnel', 'Cadiou',   'Erwan',       'testprofessionnel5@gmail.com', '0296482314', '21 route de Trébeurden',       '22300', 'Lannion', NULL),
(7, 'professionnel', 'Guéguen',  'Anne-Marie',  'testprofessionnel6@gmail.com', '0296375698', '4 rue Saint-Marc',             '22300', 'Lannion', NULL),
(8, 'professionnel', 'Prigent',  'Loïc',        'testprofessionnel7@gmail.com', '0296483701', '16 avenue de Park Nevez',      '22300', 'Lannion', NULL),
(9, 'superadmin',    'Admin',    'Super',       'testsuperadmin1@gmail.com',    NULL,         NULL,                            NULL,    NULL,      1);

-- Particulier
INSERT INTO `Particulier` (`idParticulier`, `id`, `pointsFidelite`) VALUES (1, 1, 0);

-- Professionnel
INSERT INTO `Professionnel` (`idProfessionnel`, `id`) VALUES
(1, 2),
(2, 3),
(3, 4),
(4, 5),
(5, 6),
(6, 7),
(7, 8);

UPDATE `Professionnel` SET description = 'Producteur de fruits et de confitures artisanales ancre dans le Trégor.', photo = 'src/images/producteurs/michel.webp' WHERE idProfessionnel = 1;
UPDATE `Professionnel` SET description = 'Maraicher local specialise dans les légumes de saison et la vente directe.', photo = 'src/images/producteurs/herve.webp' WHERE idProfessionnel = 2;
UPDATE `Professionnel` SET description = 'Exploitant de primeurs et de produits transformés issus de la baie de Lannion.', photo = 'src/images/producteurs/bernard.webp' WHERE idProfessionnel = 3;
UPDATE `Professionnel` SET description = 'Producteur engagé dans les circuits courts, avec une offre variée en ferme et en point de vente.', photo = 'src/images/producteurs/claude.webp' WHERE idProfessionnel = 4;
UPDATE `Professionnel` SET description = 'Eleveur local qui propose des produits fermiers et de la viande en circuit court.', photo = 'src/images/producteurs/thierry.webp' WHERE idProfessionnel = 5;
UPDATE `Professionnel` SET description = 'Artisan boulanger qui valorise les farines locales et les fournées du quotidien.', photo = 'src/images/producteurs/jean-pierre.webp' WHERE idProfessionnel = 6;
UPDATE `Professionnel` SET description = 'Brasseur local qui travaille des recettes de caractère à partir d''ingrédients de proximité.', photo = 'src/images/producteurs/loic.webp' WHERE idProfessionnel = 7;

INSERT INTO `Professionnel_Siret` (`idProfessionnel`, `numero_siret`) VALUES
(1, '22300100000001'),
(1, '22300100000008'),
(2, '22300100000002'),
(3, '22300100000003'),
(4, '22300100000004'),
(5, '22300100000005'),
(6, '22300100000006'),
(7, '22300100000007');

-- Entreprise
INSERT INTO `Entreprise` (`idEntreprise`, `nom`, `siret`, `adresse_ligne`, `code_postal`, `ville`) VALUES
(1, 'Les fruits de mamie',     '22300100000001', '1 place du Général Leclerc', '22300', 'Lannion'),
(2, 'Le potager des brumes',   '22300100000002', '12 rue des Hortensias',      '22300', 'Lannion'),
(3, 'Primeurs de la baie',     '22300100000003', '8 quai d\'Aiguillon',         '22300', 'Lannion'),
(4, 'Atelier des terroirs',    '22300100000004', '5 rue Jean Savidan',          '22300', 'Lannion'),
(5, 'Elevage de Kermaria',     '22300100000005', '21 route de Trébeurden',      '22300', 'Lannion'),
(6, 'Le fournil granit rose',  '22300100000006', '4 rue Saint-Marc',            '22300', 'Lannion'),
(7, 'Brasserie des embruns',   '22300100000007', '16 avenue de Park Nevez',     '22300', 'Lannion'),
(8, 'Conserverie du Trégor',   '22300100000008', '3 rue du Port',               '22300', 'Lannion');

INSERT INTO `Professionnel_Entreprise` (`idProfessionnel`, `idEntreprise`) VALUES
(1, 1),
(1, 8),
(2, 2),
(3, 3),
(4, 4),
(5, 5),
(6, 6),
(7, 7);

-- Profils Auth
INSERT INTO `AuthProfile` (`authUserId`, `accountType`, `particulierId`, `professionnelId`, `entrepriseId`, `createdAt`, `updatedAt`) VALUES
('Zd4kfip6or78ukt2lHV5BObQGUJ0h4Kl', 'particulier',   1,    NULL, NULL, '2026-04-23 11:02:41', '2026-04-23 11:02:41'),
('YGrii7v7iKcdvjXEznpuus97uVFcjugJ', 'professionnel', NULL,  1,    1,    '2026-04-23 11:18:07', '2026-04-23 11:18:07'),
('Qp7Hn2Lm9Xc4Vb1Ts8Kd5Rj3Wy6Uf0Za', 'professionnel', NULL,  2,    2,    '2026-04-23 11:18:07', '2026-04-23 11:18:07'),
('Bn4Rt8Yp1Lk6Jm3Nh0Vf5Dc2Xs9Qa7We', 'professionnel', NULL,  3,    3,    '2026-04-23 11:18:07', '2026-04-23 11:18:07'),
('Hu3Ji7Ko1Lp9Mn5Bv2Cx8Dz4Sr6Ta0Ye', 'professionnel', NULL,  4,    4,    '2026-04-23 11:18:07', '2026-04-23 11:18:07'),
('Te5Yu1Io9Pa3Sd7Fg2Hj6Kl8Zx4Cv0Bn', 'professionnel', NULL,  5,    5,    '2026-04-23 11:18:07', '2026-04-23 11:18:07'),
('Mi2No6Pq0Rs4Tu8Vw1Xy5Za9Bc3De7Fg', 'professionnel', NULL,  6,    6,    '2026-04-23 11:18:07', '2026-04-23 11:18:07'),
('Gh8Jk2Lm6Np0Qr4St9Uv3Wx7Yz1Ab5Cd', 'professionnel', NULL,  7,    7,    '2026-04-23 11:18:07', '2026-04-23 11:18:07'),
('Sa9Uy3Ti7Re1Wa5Dm8Fn2Ko6Lp4Xz0Qc', 'superadmin',   NULL, NULL, NULL, '2026-04-23 11:25:00', '2026-04-23 11:25:00');

-- Points Relais
INSERT INTO `PointRelais` (`nom`, `adresse_ligne`, `code_postal`, `ville`) VALUES
('La Poste de Lannion',             'Quai d\'Aiguillon',                    '22300', 'Lannion'),
('Carrefour City',                  '8 rue des Augustins',                  '22300', 'Lannion'),
('Bar Tabac Le Vieux Servel',       '5 rue de Kerpabu',                     '22300', 'Lannion'),
('Accueil E.Leclerc Lannion Centre','Route de Guingamp Saint Elivet',       '22300', 'Lannion'),
('Consigne Pickup Weldom Lannion',  '38 rue Saint-Marc',                    '22300', 'Lannion');

-- Lieux de Vente
INSERT INTO `LieuVente` (`nom`, `horaires`, `adresse_ligne`, `code_postal`, `ville`, `latitude`, `longitude`) VALUES
('Les Halles de Lannion',          'Mar-Sam 8h-13h',          'Place du Miroir',                              '22300', 'Lannion',           48.731900, -3.457900),
('Marché de la Mutante',           'Mer 16h-19h',             'Manoir de Trorozec, 8 Rue de Trorozec',        '22300', 'Lannion',           48.727400, -3.448900),
('Ferme de Keranod',               'Mar-Ven 16h30-18h30',     '102 Ker an Nod',                               '22300', 'Lannion',           48.735100, -3.474300),
('Au Potager de Kervoigen',        'Ven-Sam 9h-12h',          'Chemin de Kervoigen',                          '22300', 'Lannion',           48.748200, -3.468100),
('Bergerie de Kroaz Min',          'Mer-Ven 15h-18h',         'Servel',                                       '22300', 'Lannion',           48.744400, -3.444800),
('Ferme du Wern',                  'Mar 16h-19h',             'Le Launay',                                    '22300', 'Ploubezre',         48.705700, -3.448400),
('La Ferme Bio de Kernéan',        'Ven 17h-19h',             '6 Route de Kernéan',                           '22560', 'Pleumeur-Bodou',    48.773100, -3.518700),
('Brasstillerie KanArFoll',        'Mer 16h-19h',             'Pôle Phoenix, Bat B',                          '22560', 'Pleumeur-Bodou',    48.781400, -3.516500),
('La Fabrique du Potager',         'Sam 9h30-12h30',          '78 rue de Kernevez',                           '22560', 'Trébeurden',        48.769900, -3.559400),
('Ferme du Lanno',                 'Mar-Sam 9h-12h',          '2 Place du Kroajou',                           '22660', 'Trélévern',         48.808600, -3.368100),
('Dolmen & Potager',               'Mar 15h-18h, Ven 16h-19h','Ferme de Coat Mez',                            '22660', 'Trévou-Tréguignec', 48.818500, -3.358600),
('La ferme végétale de Boiséon',   'Mar-Ven 16h-19h',         '3 Bois Yvon',                                  '22710', 'Penvénan',          48.811400, -3.300100),
('La Ferme des Hautes Terres',     'Mar 17h30-19h',           '5 Kercadieu, route de Pors Hir',               '22820', 'Plougrescant',      48.868200, -3.224300),
('La Ferme de Keredern',           'Ven 9h-12h, Sam 9h-12h', '14 Lieu-dit Keredern',                         '22220', 'Trédarzec',         48.786700, -3.201900),
('Bernard Fay Légumes',            'Lun-Sam 9h-12h30',        '54 rue de la Presqu\'île, Bourg de l\'Armor',  '22610', 'Pleubian',          48.846200, -3.138700);

-- Images produits (une par produit, même ordre que les Produits ci-dessous)
INSERT INTO `Image` (`idImage`, `path`) VALUES
-- Pro 1 – Gwenn Le Berre (Les fruits de mamie + Conserverie du Trégor)
( 1, '/images/produits/pommes_reinette.webp'),
( 2, '/images/produits/poires_williams.webp'),
( 3, '/images/produits/fraises_gariguette.webp'),
( 4, '/images/produits/framboises.webp'),
( 5, '/images/produits/confiture_fraises.webp'),
( 6, '/images/produits/confiture_mures.webp'),
( 7, '/images/produits/gelee_pommes.webp'),
( 8, '/images/produits/compote_pommes.webp'),
-- Pro 2 – Yann Kervella (Le potager des brumes)
( 9, '/images/produits/tomates_coeur_boeuf.webp'),
(10, '/images/produits/courgettes.webp'),
(11, '/images/produits/carottes.webp'),
(12, '/images/produits/salade_batavia.webp'),
(13, '/images/produits/poireaux.webp'),
(14, '/images/produits/epinards.webp'),
(15, '/images/produits/haricots_verts.webp'),
(16, '/images/produits/betteraves_rouges.webp'),
-- Pro 3 – Nolwenn Tanguy (Primeurs de la baie)
(17, '/images/produits/pommes_de_terre.webp'),
(18, '/images/produits/oignons_jaunes.webp'),
(19, '/images/produits/artichauts.webp'),
(20, '/images/produits/chou_fleur.webp'),
(21, '/images/produits/brocoli.webp'),
(22, '/images/produits/endives.webp'),
(23, '/images/produits/tomates_cerises.webp'),
(24, '/images/produits/ail_rose.webp'),
-- Pro 4 – Mikael Le Goff (Atelier des terroirs)
(25, '/images/produits/miel_bretagne.webp'),
(26, '/images/produits/caramel_beurre_sale.webp'),
(27, '/images/produits/cidre_brut.webp'),
(28, '/images/produits/vinaigre_cidre.webp'),
(29, '/images/produits/huile_colza.webp'),
(30, '/images/produits/galettes_bretonnes.webp'),
(31, '/images/produits/sables_bretons.webp'),
(32, '/images/produits/kouign_amann_artisan.webp'),
-- Pro 5 – Erwan Cadiou (Elevage de Kermaria)
(33, '/images/produits/cotes_agneau.webp'),
(34, '/images/produits/gigot_agneau.webp'),
(35, '/images/produits/saucisses_porc.webp'),
(36, '/images/produits/lardons_fumes.webp'),
(37, '/images/produits/fromage_brebis.webp'),
(38, '/images/produits/lait_entier.webp'),
(39, '/images/produits/beurre_demi_sel.webp'),
(40, '/images/produits/yaourts_nature.webp'),
-- Pro 6 – Anne-Marie Guéguen (Le fournil granit rose)
(41, '/images/produits/pain_campagne.webp'),
(42, '/images/produits/baguette_tradition.webp'),
(43, '/images/produits/pain_levain.webp'),
(44, '/images/produits/kouign_amann_fournil.webp'),
(45, '/images/produits/far_breton.webp'),
(46, '/images/produits/crepes_bretonnes.webp'),
(47, '/images/produits/pain_cereales.webp'),
(48, '/images/produits/brioche_tressee.webp'),
-- Pro 7 – Loïc Prigent (Brasserie des embruns)
(49, '/images/produits/biere_blonde.webp'),
(50, '/images/produits/biere_ambree.webp'),
(51, '/images/produits/biere_brune.webp'),
(52, '/images/produits/biere_blanche.webp'),
(53, '/images/produits/biere_ipa.webp'),
(54, '/images/produits/pack_6_blondes.webp'),
(55, '/images/produits/pack_6_assorties.webp'),
(56, '/images/produits/biere_saison.webp');

-- Produits
--   unitaireOuKilo : TRUE = à l'unité, FALSE = au kilo
INSERT INTO `Produit` (`idProduit`, `idProfessionnel`, `idEntreprise`, `nom`, `nature`, `unitaireOuKilo`, `bio`, `prix`, `tva`, `reductionProfessionnel`, `stock`, `visible`) VALUES
-- Pro 1 – Gwenn Le Berre
( 1, 1, 1, 'Pommes Reinette',          'Fruit',       FALSE, FALSE,  2.50,  5.50,  0.00, 110.000, TRUE),
( 2, 1, 1, 'Poires Williams',          'Fruit',       FALSE, FALSE,  2.80,  5.50,  0.00,  65.000, TRUE),
( 3, 1, 1, 'Fraises Gariguette',       'Fruit',       FALSE, FALSE,  6.50,  5.50,  0.00,  32.000, TRUE),
( 4, 1, 1, 'Framboises',               'Fruit',       FALSE,  TRUE,  9.00,  5.50,  0.00,  15.000, TRUE),
( 5, 1, 8, 'Confiture de fraises',     'Autre',        TRUE, FALSE,  4.80,  5.50,  0.00,  50.000, TRUE),
( 6, 1, 8, 'Confiture de mûres',       'Autre',        TRUE, FALSE,  4.80,  5.50,  0.00,  42.000, TRUE),
( 7, 1, 8, 'Gelée de pommes',          'Autre',        TRUE, FALSE,  4.20,  5.50,  0.00,  58.000, TRUE),
( 8, 1, 8, 'Compote de pommes maison', 'Autre',        TRUE, FALSE,  3.50,  5.50,  0.00,  72.000, TRUE),
-- Pro 2 – Yann Kervella
( 9, 2, 2, 'Tomates cœur de bœuf',    'Légume',      FALSE,  TRUE,  4.20,  5.50,  0.00,  45.000, TRUE),
(10, 2, 2, 'Courgettes',               'Légume',      FALSE,  TRUE,  2.20,  5.50,  0.00,  85.000, TRUE),
(11, 2, 2, 'Carottes',                 'Légume',      FALSE, FALSE,  1.80,  5.50, 10.00, 135.000, TRUE),
(12, 2, 2, 'Salade batavia',           'Légume',       TRUE, FALSE,  1.20,  5.50,  0.00,  38.000, TRUE),
(13, 2, 2, 'Poireaux',                 'Légume',      FALSE, FALSE,  2.80,  5.50,  0.00,  58.000, TRUE),
(14, 2, 2, 'Épinards',                 'Légume',      FALSE,  TRUE,  4.50,  5.50,  0.00,  24.000, TRUE),
(15, 2, 2, 'Haricots verts',           'Légume',      FALSE, FALSE,  4.80,  5.50,  0.00,  32.000, TRUE),
(16, 2, 2, 'Betteraves rouges',        'Légume',      FALSE, FALSE,  2.00,  5.50,  0.00,  70.000, TRUE),
-- Pro 3 – Nolwenn Tanguy
(17, 3, 3, 'Pommes de terre Charlotte','Légume',      FALSE, FALSE,  1.60,  5.50, 10.00, 260.000, TRUE),
(18, 3, 3, 'Oignons jaunes',           'Légume',      FALSE, FALSE,  1.80,  5.50, 10.00, 110.000, TRUE),
(19, 3, 3, 'Artichauts',               'Légume',       TRUE, FALSE,  1.50,  5.50,  0.00,  44.000, TRUE),
(20, 3, 3, 'Chou-fleur',               'Légume',       TRUE, FALSE,  2.50,  5.50,  0.00,  30.000, TRUE),
(21, 3, 3, 'Brocoli',                  'Légume',       TRUE, FALSE,  2.20,  5.50,  0.00,  24.000, TRUE),
(22, 3, 3, 'Endives',                  'Légume',      FALSE, FALSE,  3.20,  5.50,  0.00,  50.000, TRUE),
(23, 3, 3, 'Tomates cerises',          'Fruit',       FALSE, FALSE,  5.50,  5.50,  0.00,  28.000, TRUE),
(24, 3, 3, 'Ail rose',                 'Légume',       TRUE, FALSE,  1.50,  5.50,  0.00,  56.000, TRUE),
-- Pro 4 – Mikael Le Goff
(25, 4, 4, 'Miel de Bretagne',         'Autre',        TRUE, FALSE,  9.50,  5.50,  0.00,  42.000, TRUE),
(26, 4, 4, 'Caramel au beurre salé',   'Autre',        TRUE, FALSE,  4.20,  5.50,  0.00,  60.000, TRUE),
(27, 4, 4, 'Cidre brut artisanal',     'Autre',        TRUE, FALSE,  4.80, 20.00,  5.00,  82.000, TRUE),
(28, 4, 4, 'Vinaigre de cidre',        'Autre',        TRUE, FALSE,  5.50,  5.50,  0.00,  36.000, TRUE),
(29, 4, 4, 'Huile de colza artisanale','Autre',        TRUE, FALSE,  7.00,  5.50,  0.00,  30.000, TRUE),
(30, 4, 4, 'Galettes bretonnes pur beurre','Boulangerie',TRUE,FALSE, 4.50,  5.50,  0.00,  56.000, TRUE),
(31, 4, 4, 'Sablés bretons',           'Boulangerie',  TRUE, FALSE,  3.80,  5.50,  0.00,  48.000, TRUE),
(32, 4, 4, 'Kouign-amann',             'Boulangerie',  TRUE, FALSE,  8.50,  5.50,  0.00,  20.000, TRUE),
-- Pro 5 – Erwan Cadiou
(33, 5, 5, 'Côtelettes d\'agneau',     'Viande',      FALSE, FALSE, 22.00,  5.50,  0.00,  24.000, TRUE),
(34, 5, 5, 'Gigot d\'agneau',          'Viande',      FALSE, FALSE, 18.00,  5.50,  0.00,  14.000, TRUE),
(35, 5, 5, 'Saucisses de porc',        'Viande',      FALSE, FALSE,  9.50,  5.50,  0.00,  36.000, TRUE),
(36, 5, 5, 'Lardons fumés',            'Viande',      FALSE, FALSE, 10.00,  5.50,  0.00,  30.000, TRUE),
(37, 5, 5, 'Fromage de brebis',        'Laitier',      TRUE, FALSE,  6.50,  5.50,  0.00,  24.000, TRUE),
(38, 5, 5, 'Lait entier cru',          'Laitier',      TRUE, FALSE,  1.20,  5.50,  0.00,  58.000, TRUE),
(39, 5, 5, 'Beurre demi-sel',          'Laitier',      TRUE, FALSE,  3.80,  5.50,  0.00,  42.000, TRUE),
(40, 5, 5, 'Yaourts nature (pack 4)',  'Laitier',      TRUE, FALSE,  3.50,  5.50,  0.00,  30.000, TRUE),
-- Pro 6 – Anne-Marie Guéguen
(41, 6, 6, 'Pain de campagne',         'Boulangerie',  TRUE, FALSE,  4.50,  5.50,  0.00,  30.000, TRUE),
(42, 6, 6, 'Baguette tradition',       'Boulangerie',  TRUE, FALSE,  1.30,  5.50,  0.00,  44.000, TRUE),
(43, 6, 6, 'Pain au levain',           'Boulangerie',  TRUE, FALSE,  5.80,  5.50,  0.00,  24.000, TRUE),
(44, 6, 6, 'Kouign-amann',             'Boulangerie',  TRUE, FALSE,  9.00,  5.50,  0.00,  18.000, TRUE),
(45, 6, 6, 'Far breton',               'Boulangerie',  TRUE, FALSE,  6.50,  5.50,  0.00,  20.000, TRUE),
(46, 6, 6, 'Crêpes bretonnes (pack 6)','Boulangerie',  TRUE, FALSE,  3.80,  5.50,  0.00,  36.000, TRUE),
(47, 6, 6, 'Pain aux céréales',        'Boulangerie',  TRUE, FALSE,  5.20,  5.50,  0.00,  24.000, TRUE),
(48, 6, 6, 'Brioche tressée',          'Boulangerie',  TRUE, FALSE,  5.50,  5.50,  0.00,  18.000, TRUE),
-- Pro 7 – Loïc Prigent
(49, 7, 7, 'Bière blonde artisanale',  'Autre',        TRUE, FALSE,  3.50, 20.00,  5.00, 130.000, TRUE),
(50, 7, 7, 'Bière ambrée artisanale',  'Autre',        TRUE, FALSE,  3.80, 20.00,  5.00, 105.000, TRUE),
(51, 7, 7, 'Bière brune artisanale',   'Autre',        TRUE, FALSE,  4.00, 20.00,  5.00,  92.000, TRUE),
(52, 7, 7, 'Bière blanche artisanale', 'Autre',        TRUE, FALSE,  3.50, 20.00,  5.00, 118.000, TRUE),
(53, 7, 7, 'Bière IPA artisanale',     'Autre',        TRUE, FALSE,  4.50, 20.00,  5.00,  84.000, TRUE),
(54, 7, 7, 'Pack 6 bières blondes',    'Autre',        TRUE, FALSE, 18.00, 20.00,  5.00,  56.000, TRUE),
(55, 7, 7, 'Pack 6 bières assorties',  'Autre',        TRUE, FALSE, 20.00, 20.00,  5.00,  42.000, TRUE),
(56, 7, 7, 'Bière de saison',          'Autre',        TRUE, FALSE,  4.20, 20.00,  5.00,  68.000, TRUE);

-- Liens Produit <-> Image (un pour un, même ordre)
INSERT INTO `Produit_Image` (`idProduit`, `idImage`) VALUES
( 1, 1),( 2, 2),( 3, 3),( 4, 4),( 5, 5),( 6, 6),( 7, 7),( 8, 8),
( 9, 9),(10,10),(11,11),(12,12),(13,13),(14,14),(15,15),(16,16),
(17,17),(18,18),(19,19),(20,20),(21,21),(22,22),(23,23),(24,24),
(25,25),(26,26),(27,27),(28,28),(29,29),(30,30),(31,31),(32,32),
(33,33),(34,34),(35,35),(36,36),(37,37),(38,38),(39,39),(40,40),
(41,41),(42,42),(43,43),(44,44),(45,45),(46,46),(47,47),(48,48),
(49,49),(50,50),(51,51),(52,52),(53,53),(54,54),(55,55),(56,56);

-- Liens Entreprise <-> LieuVente
INSERT INTO `Entreprise_LieuVente` (`idEntreprise`, `idLieu`) VALUES
-- Les Halles de Lannion (1) — marché couvert, présence limitée à quelques artisans
(1, 1), (4, 1), (6, 1), (8, 1),
-- Marché de la Mutante (2) — marché de producteurs, recouvrement réduit
(6, 2), (8, 2),
-- Ferme de Keranod (3) — vente directe, une seule entreprise
(2, 3),
-- Au Potager de Kervoigen (4) — vente directe, une seule entreprise
(3, 4),
-- Bergerie de Kroaz Min (5) — vente directe, une seule entreprise
(5, 5),
-- Ferme du Wern (6) — vente directe, une seule entreprise
(2, 6),
-- La Ferme Bio de Kernéan (7) — vente directe, une seule entreprise
(4, 7),
-- Brasstillerie KanArFoll (8) — vente directe, une seule entreprise
(7, 8),
-- La Fabrique du Potager (9) — vente directe, une seule entreprise
(3, 9),
-- Ferme du Lanno (10) — vente directe, une seule entreprise
(5, 10),
-- Dolmen & Potager (11) — deux producteurs complémentaires
(2, 11), (8, 11),
-- La ferme végétale de Boiséon (12) — vente directe, une seule entreprise
(2, 12),
-- La Ferme des Hautes Terres (13) — vente directe, une seule entreprise
(5, 13),
-- La Ferme de Keredern (14) — vente directe, une seule entreprise
(1, 14),
-- Bernard Fay Légumes (15) — vente directe, une seule entreprise
(3, 15);

-- Notifications de bienvenue pour les comptes de test
INSERT INTO `Notification` (`userId`, `type`, `message`, `lien`, `lu`, `createdAt`) VALUES
('Zd4kfip6or78ukt2lHV5BObQGUJ0h4Kl', 'bienvenue', 'Bienvenue sur Local\'zh ! Complétez votre profil en ajoutant votre adresse et numéro de téléphone.', '/compte', FALSE, '2026-04-23 09:02:41'),
('YGrii7v7iKcdvjXEznpuus97uVFcjugJ', 'bienvenue', 'Bienvenue sur Local\'zh ! Complétez votre profil en ajoutant votre adresse et numéro de téléphone.', '/compte', FALSE, '2026-04-23 09:18:07'),
('Qp7Hn2Lm9Xc4Vb1Ts8Kd5Rj3Wy6Uf0Za', 'bienvenue', 'Bienvenue sur Local\'zh ! Complétez votre profil en ajoutant votre adresse et numéro de téléphone.', '/compte', FALSE, '2026-04-23 09:18:07'),
('Bn4Rt8Yp1Lk6Jm3Nh0Vf5Dc2Xs9Qa7We', 'bienvenue', 'Bienvenue sur Local\'zh ! Complétez votre profil en ajoutant votre adresse et numéro de téléphone.', '/compte', FALSE, '2026-04-23 09:18:07'),
('Hu3Ji7Ko1Lp9Mn5Bv2Cx8Dz4Sr6Ta0Ye', 'bienvenue', 'Bienvenue sur Local\'zh ! Complétez votre profil en ajoutant votre adresse et numéro de téléphone.', '/compte', FALSE, '2026-04-23 09:18:07'),
('Te5Yu1Io9Pa3Sd7Fg2Hj6Kl8Zx4Cv0Bn', 'bienvenue', 'Bienvenue sur Local\'zh ! Complétez votre profil en ajoutant votre adresse et numéro de téléphone.', '/compte', FALSE, '2026-04-23 09:18:07'),
('Mi2No6Pq0Rs4Tu8Vw1Xy5Za9Bc3De7Fg', 'bienvenue', 'Bienvenue sur Local\'zh ! Complétez votre profil en ajoutant votre adresse et numéro de téléphone.', '/compte', FALSE, '2026-04-23 09:18:07'),
('Gh8Jk2Lm6Np0Qr4St9Uv3Wx7Yz1Ab5Cd', 'bienvenue', 'Bienvenue sur Local\'zh ! Complétez votre profil en ajoutant votre adresse et numéro de téléphone.', '/compte', FALSE, '2026-04-23 09:18:07');

-- -----------------------------------------------------------------
-- Seed massif : beaucoup de clients particuliers, avis et commandes
-- -----------------------------------------------------------------
-- Tous les comptes ci-dessous reutilisent le hash de mot de passe
-- standard deja present sur les comptes de test existants.

DROP TEMPORARY TABLE IF EXISTS SeedMassClient;
CREATE TEMPORARY TABLE SeedMassClient (
    idx            INT PRIMARY KEY,
    authUserId     VARCHAR(255) NOT NULL UNIQUE,
    accountId      VARCHAR(255) NOT NULL UNIQUE,
    businessUserId INT NOT NULL UNIQUE,
    particulierId  INT NOT NULL UNIQUE,
    prenom         VARCHAR(100) NOT NULL,
    nom            VARCHAR(100) NOT NULL,
    email          VARCHAR(255) NOT NULL UNIQUE,
    telephone      VARCHAR(20)  NOT NULL,
    adresse_ligne  VARCHAR(255) NOT NULL,
    code_postal    VARCHAR(10)  NOT NULL,
    ville          VARCHAR(100) NOT NULL,
    createdAt      DATETIME     NOT NULL
);

INSERT INTO SeedMassClient (
    idx, authUserId, accountId, businessUserId, particulierId,
    prenom, nom, email, telephone, adresse_ligne, code_postal, ville, createdAt
)
WITH RECURSIVE seq AS (
    SELECT 1 AS idx
    UNION ALL
    SELECT idx + 1 FROM seq WHERE idx < 120
)
SELECT
    idx,
    CONCAT('seed-particulier-', LPAD(idx, 3, '0'), '-auth'),
    CONCAT('seed-particulier-', LPAD(idx, 3, '0'), '-account'),
    idx + 9,
    idx + 1,
    ELT(((idx - 1) % 20) + 1,
        'Camille', 'Lena', 'Theo', 'Ines', 'Malo',
        'Sarah', 'Hugo', 'Anna', 'Jules', 'Romane',
        'Noah', 'Manon', 'Leo', 'Louise', 'Axel',
        'Jeanne', 'Mathis', 'Elsa', 'Tiago', 'Maud'
    ),
    ELT(((idx - 1) % 20) + 1,
        'Le Roux', 'Rivoal', 'Quere', 'Le Gall', 'Briand',
        'Colin', 'Morvan', 'Le Guen', 'Madec', 'Jaffres',
        'Rolland', 'Le Pape', 'Abjean', 'Kerbrat', 'Le Floc''h',
        'Even', 'Tallec', 'Uguen', 'Malgorn', 'Cornec'
    ),
    CONCAT('client.bulk+', LPAD(idx, 3, '0'), '@localzh.test'),
    CONCAT('06', LPAD(41000000 + idx, 8, '0')),
    CONCAT(10 + idx, ' rue des Clients ', CHAR(64 + ((idx - 1) % 26) + 1)),
    ELT(((idx - 1) % 6) + 1, '22300', '22560', '22700', '22310', '22420', '22220'),
    ELT(((idx - 1) % 6) + 1, 'Lannion', 'Pleumeur-Bodou', 'Perros-Guirec', 'Trébeurden', 'Plouaret', 'Trédarzec'),
    DATE_ADD('2026-01-03 08:00:00', INTERVAL idx DAY)
FROM seq;

INSERT INTO `user` (`id`, `name`, `email`, `emailVerified`, `role`, `image`, `accountType`, `firstName`, `lastName`, `createdAt`, `updatedAt`)
SELECT
    authUserId,
    CONCAT(prenom, ' ', nom),
    email,
    TRUE,
    'user',
    NULL,
    'particulier',
    prenom,
    nom,
    createdAt,
    createdAt
FROM SeedMassClient;

INSERT INTO `account` (`id`, `accountId`, `providerId`, `userId`, `accessToken`, `refreshToken`, `idToken`, `accessTokenExpiresAt`, `refreshTokenExpiresAt`, `scope`, `password`, `createdAt`, `updatedAt`)
SELECT
    accountId,
    authUserId,
    'credential',
    authUserId,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    'f6dc03a5329dc37db121c5781fc3194d:4788b30804eff32e996c751595ba68f13fc4671a7a4a6b83c7ea8ec2989a0e68642d9e1fc8f3a143c5761871b698a4eda234533c2096ea4388c01ccfccd17388',
    createdAt,
    createdAt
FROM SeedMassClient;

INSERT INTO `Utilisateur` (`id`, `type_utilisateur`, `nom`, `prenom`, `email`, `num_telephone`, `adresse_ligne`, `code_postal`, `ville`, `idAdmin`)
SELECT
    businessUserId,
    'particulier',
    nom,
    prenom,
    email,
    telephone,
    adresse_ligne,
    code_postal,
    ville,
    NULL
FROM SeedMassClient;

INSERT INTO `Particulier` (`idParticulier`, `id`, `pointsFidelite`)
SELECT particulierId, businessUserId, 0
FROM SeedMassClient;

INSERT INTO `AuthProfile` (`authUserId`, `accountType`, `particulierId`, `professionnelId`, `entrepriseId`, `createdAt`, `updatedAt`)
SELECT
    authUserId,
    'particulier',
    particulierId,
    NULL,
    NULL,
    createdAt,
    createdAt
FROM SeedMassClient;

INSERT INTO `Panier` (`idPanier`, `nom`, `estLivrable`, `idParticulier`, `idProfessionnel`)
SELECT
    1000 + idx,
    CONCAT('Panier de ', prenom, ' ', nom),
    TRUE,
    particulierId,
    NULL
FROM SeedMassClient;

INSERT INTO `Notification` (`userId`, `type`, `message`, `lien`, `lu`, `createdAt`)
SELECT
    authUserId,
    'bienvenue',
    CONCAT('Bienvenue sur Local''zh ', prenom, ' ! Vos favoris, avis et commandes de démonstration sont prêts.'),
    '/compte',
    FALSE,
    createdAt
FROM SeedMassClient;

INSERT INTO `FideliteDefi` (`idDefi`, `code`, `titre`, `description`, `pointsRecompense`, `maxClaims`, `actif`) VALUES
(1, 'PREMIERE_COMMANDE', 'Premiere commande locale', 'Valider une premiere commande particulier sur la plateforme.', 15, 1, TRUE),
(2, 'AVIS_MULTI_PRODUITS', 'Partage gourmand', 'Laisser plusieurs avis produits apres achat pour enrichir le catalogue.', 20, 2, TRUE),
(3, 'ACHAT_CIRCUIT_COURT', 'Circuit court regulier', 'Cumuler plusieurs commandes chez des producteurs differents.', 25, 3, TRUE);

DROP TEMPORARY TABLE IF EXISTS SeedMassOrder;
CREATE TEMPORARY TABLE SeedMassOrder (
    idCommande      INT PRIMARY KEY,
    idx             INT NOT NULL,
    idParticulier   INT NOT NULL,
    orderRank       TINYINT NOT NULL,
    dateCommande    DATETIME NOT NULL,
    modeLivraison   VARCHAR(20) NOT NULL,
    modePaiement    VARCHAR(20) NOT NULL,
    idRelais        INT NULL,
    deliveryAddress VARCHAR(255) NULL,
    baseProductId   INT NOT NULL
);

INSERT INTO SeedMassOrder (
    idCommande, idx, idParticulier, orderRank, dateCommande,
    modeLivraison, modePaiement, idRelais, deliveryAddress, baseProductId
)
SELECT
    1000 + ((idx - 1) * 3) + orderRank,
    idx,
    particulierId,
    orderRank,
    DATE_SUB(
        DATE_ADD('2026-04-20 10:30:00', INTERVAL idx HOUR),
        INTERVAL ((idx * 5) + (orderRank * 9)) DAY
    ),
    CASE orderRank
        WHEN 1 THEN 'domicile'
        WHEN 2 THEN 'point_relais'
        ELSE 'lieu_vente'
    END,
    ELT(((idx + orderRank - 1) % 3) + 1, 'carte_bancaire', 'paypal', 'apple_pay'),
    CASE WHEN orderRank = 2 THEN ((idx + orderRank - 1) % 5) + 1 ELSE NULL END,
    CASE WHEN orderRank = 1 THEN CONCAT(adresse_ligne, ', ', code_postal, ' ', ville) ELSE NULL END,
    (((idx * 7) + (orderRank * 5) - 1) % 56) + 1
FROM SeedMassClient
CROSS JOIN (
    SELECT 1 AS orderRank
    UNION ALL SELECT 2
    UNION ALL SELECT 3
) AS orders;

DROP TEMPORARY TABLE IF EXISTS SeedMassOrderLine;
CREATE TEMPORARY TABLE SeedMassOrderLine (
    idCommande INT NOT NULL,
    lineRank   TINYINT NOT NULL,
    idProduit  INT NOT NULL,
    quantite   DECIMAL(10,3) NOT NULL,
    idLieu     INT NULL,
    PRIMARY KEY (idCommande, idProduit)
);

INSERT INTO SeedMassOrderLine (`idCommande`, `lineRank`, `idProduit`, `quantite`, `idLieu`)
SELECT
    o.idCommande,
    lineSpec.lineRank,
    ((((o.baseProductId - 1) DIV 8) * 8) + ((((o.baseProductId - 1) % 8) + lineSpec.productOffset) % 8) + 1) AS idProduit,
    CASE
        WHEN p.unitaireOuKilo THEN 1 + ((o.idx + o.orderRank + lineSpec.lineRank) % 3)
        ELSE ROUND(0.75 + (((o.idx + o.orderRank + lineSpec.lineRank) % 5) * 0.5), 3)
    END AS quantite,
    CASE
        WHEN o.modeLivraison = 'lieu_vente' THEN (
            SELECT MIN(elv.idLieu)
            FROM Produit p2
            JOIN Entreprise_LieuVente elv ON elv.idEntreprise = p2.idEntreprise
            WHERE p2.idProduit = ((((o.baseProductId - 1) DIV 8) * 8) + ((((o.baseProductId - 1) % 8) + lineSpec.productOffset) % 8) + 1)
        )
        ELSE NULL
    END AS idLieu
FROM SeedMassOrder o
CROSS JOIN (
    SELECT 1 AS lineRank, 0 AS productOffset
    UNION ALL SELECT 2, 2
    UNION ALL SELECT 3, 5
) AS lineSpec
JOIN Produit p
    ON p.idProduit = ((((o.baseProductId - 1) DIV 8) * 8) + ((((o.baseProductId - 1) % 8) + lineSpec.productOffset) % 8) + 1);

INSERT INTO `Commande` (`idCommande`, `dateCommande`, `modeLivraison`, `modePaiement`, `prixTotal`, `status`, `idParticulier`, `idProfessionnel`)
SELECT
    o.idCommande,
    o.dateCommande,
    o.modeLivraison,
    o.modePaiement,
    ROUND(
        SUM(ROUND(sol.quantite * (p.prix * (1 - (p.reductionProfessionnel / 100)) * (1 + (p.tva / 100))), 2)) +
        CASE o.modeLivraison
            WHEN 'domicile' THEN 7.90
            WHEN 'point_relais' THEN 3.90
            ELSE 0.00
        END,
        2
    ) AS prixTotal,
    CASE
        WHEN TIMESTAMPDIFF(DAY, o.dateCommande, '2026-04-24 12:00:00') >= 14 THEN 'confirmee'
        ELSE 'en_attente'
    END AS status,
    o.idParticulier,
    NULL
FROM SeedMassOrder o
JOIN SeedMassOrderLine sol ON sol.idCommande = o.idCommande
JOIN Produit p ON p.idProduit = sol.idProduit
GROUP BY
    o.idCommande, o.dateCommande, o.modeLivraison, o.modePaiement, o.idParticulier;

INSERT INTO `LigneCommande` (`idCommande`, `idProduit`, `quantite`, `prixTTC`, `idLieu`)
SELECT
    sol.idCommande,
    sol.idProduit,
    sol.quantite,
    ROUND(sol.quantite * (p.prix * (1 - (p.reductionProfessionnel / 100)) * (1 + (p.tva / 100))), 2) AS prixTTC,
    sol.idLieu
FROM SeedMassOrderLine sol
JOIN Produit p ON p.idProduit = sol.idProduit;

INSERT INTO `Livraison` (`idCommande`, `idParticulier`, `idProfessionnel`, `modeLivraison`, `adresse`, `idRelais`, `idLieu`)
SELECT
    o.idCommande,
    o.idParticulier,
    NULL,
    o.modeLivraison,
    o.deliveryAddress,
    o.idRelais,
    CASE WHEN o.modeLivraison = 'lieu_vente' THEN MIN(sol.idLieu) ELSE NULL END
FROM SeedMassOrder o
LEFT JOIN SeedMassOrderLine sol ON sol.idCommande = o.idCommande
GROUP BY
    o.idCommande, o.idParticulier, o.modeLivraison, o.deliveryAddress, o.idRelais;

INSERT INTO `FideliteDefiProgress` (`idParticulier`, `idDefi`, `claimsCount`, `dateDernierClaim`, `createdAt`, `updatedAt`)
SELECT
    sc.particulierId,
    d.idDefi,
    CASE
        WHEN d.idDefi = 1 THEN 1
        WHEN d.idDefi = 2 THEN CASE WHEN MOD(sc.idx, 3) = 0 THEN 2 ELSE 1 END
        ELSE CASE WHEN MOD(sc.idx, 5) = 0 THEN 2 ELSE 1 END
    END,
    DATE_SUB('2026-04-22 12:00:00', INTERVAL (sc.idx + d.idDefi) DAY),
    DATE_ADD(sc.createdAt, INTERVAL d.idDefi DAY),
    DATE_SUB('2026-04-22 12:00:00', INTERVAL (sc.idx + d.idDefi) DAY)
FROM SeedMassClient sc
JOIN FideliteDefi d
WHERE
    (d.idDefi = 1)
    OR (d.idDefi = 2 AND MOD(sc.idx, 2) = 0)
    OR (d.idDefi = 3 AND MOD(sc.idx, 3) = 0);

INSERT INTO `BonAchat` (`idParticulier`, `codeBon`, `valeurEuros`, `pointsUtilises`, `statut`, `dateCreation`, `dateUtilisation`, `dateExpiration`)
SELECT
    sc.particulierId,
    CONCAT('BULK-', LPAD(sc.idx, 3, '0'), '-BON'),
    CASE WHEN MOD(sc.idx, 12) = 0 THEN 10.00 ELSE 5.00 END,
    CASE WHEN MOD(sc.idx, 12) = 0 THEN 120 ELSE 60 END,
    CASE
        WHEN MOD(sc.idx, 12) = 0 THEN 'utilise'
        WHEN MOD(sc.idx, 8) = 0 THEN 'actif'
        ELSE 'expire'
    END,
    DATE_SUB('2026-04-18 10:00:00', INTERVAL sc.idx DAY),
    CASE WHEN MOD(sc.idx, 12) = 0 THEN DATE_SUB('2026-04-20 18:00:00', INTERVAL sc.idx DAY) ELSE NULL END,
    CASE
        WHEN MOD(sc.idx, 12) = 0 THEN DATE_ADD('2026-04-24 23:59:59', INTERVAL 45 DAY)
        WHEN MOD(sc.idx, 8) = 0 THEN DATE_ADD('2026-04-24 23:59:59', INTERVAL 30 DAY)
        ELSE DATE_SUB('2026-03-31 23:59:59', INTERVAL sc.idx DAY)
    END
FROM SeedMassClient sc
WHERE MOD(sc.idx, 4) = 0;

UPDATE `Particulier` p
LEFT JOIN (
    SELECT
        c.idParticulier,
        SUM(FLOOR(c.prixTotal / 2)) AS pointsCommandes
    FROM Commande c
    WHERE c.idParticulier IS NOT NULL
    GROUP BY c.idParticulier
) commandes ON commandes.idParticulier = p.idParticulier
LEFT JOIN (
    SELECT
        idParticulier,
        SUM(pointsRecompense * claimsCount) AS pointsDefis
    FROM FideliteDefiProgress fdp
    JOIN FideliteDefi fd ON fd.idDefi = fdp.idDefi
    GROUP BY idParticulier
) defis ON defis.idParticulier = p.idParticulier
LEFT JOIN (
    SELECT
        idParticulier,
        SUM(pointsUtilises) AS pointsDepenses
    FROM BonAchat
    GROUP BY idParticulier
) bons ON bons.idParticulier = p.idParticulier
SET p.pointsFidelite = GREATEST(
    COALESCE(commandes.pointsCommandes, 0) +
    COALESCE(defis.pointsDefis, 0) -
    COALESCE(bons.pointsDepenses, 0),
    0
)
WHERE p.idParticulier >= 2;

INSERT INTO `AvisProduit` (`idParticulier`, `idProduit`, `note`, `commentaire`, `dateCreation`, `dateModification`)
SELECT
    seeded.idParticulier,
    seeded.idProduit,
    seeded.note,
    seeded.commentaire,
    seeded.dateCreation,
    seeded.dateModification
FROM (
    SELECT
        sc.particulierId AS idParticulier,
        p.idProduit,
        CASE
            WHEN MOD(sc.idx + p.idProduit, 11) = 0 THEN 2
            WHEN MOD(sc.idx + p.idProduit, 7) = 0 THEN 3
            WHEN MOD(sc.idx + p.idProduit, 5) = 0 THEN 5
            ELSE 4
        END AS note,
        CASE
            WHEN MOD(sc.idx + p.idProduit, 11) = 0 THEN CONCAT('Produit correct mais experience un peu inegale sur ', p.nom, '.')
            WHEN MOD(sc.idx + p.idProduit, 7) = 0 THEN CONCAT('Bon produit local, encore meilleur quand le stock est tres frais : ', p.nom, '.')
            WHEN MOD(sc.idx + p.idProduit, 5) = 0 THEN CONCAT('Excellent produit, tres regulier et bien emballe : ', p.nom, '.')
            ELSE CONCAT('Achat satisfaisant, bon rapport qualite-prix pour ', p.nom, '.')
        END AS commentaire,
        DATE_ADD('2026-02-01 09:00:00', INTERVAL ((sc.idx * 3) + p.idProduit) HOUR) AS dateCreation,
        DATE_ADD('2026-02-02 09:00:00', INTERVAL ((sc.idx * 3) + p.idProduit) HOUR) AS dateModification
    FROM SeedMassClient sc
    CROSS JOIN Produit p
) AS seeded;

INSERT INTO `AvisProfessionnel` (`idParticulier`, `idProfessionnel`, `note`, `commentaire`, `dateCreation`, `dateModification`)
SELECT
    seeded.idParticulier,
    seeded.idProfessionnel,
    seeded.note,
    seeded.commentaire,
    seeded.dateCreation,
    seeded.dateModification
FROM (
    SELECT
        sc.particulierId AS idParticulier,
        pr.idProfessionnel,
        CASE
            WHEN MOD((sc.idx * 2) + pr.idProfessionnel, 13) = 0 THEN 2
            WHEN MOD((sc.idx * 2) + pr.idProfessionnel, 5) = 0 THEN 5
            WHEN MOD((sc.idx * 2) + pr.idProfessionnel, 3) = 0 THEN 3
            ELSE 4
        END AS note,
        CASE
            WHEN MOD((sc.idx * 2) + pr.idProfessionnel, 13) = 0 THEN 'Contact professionnel serieux, mais une commande a pris un peu plus de temps que prevu.'
            WHEN MOD((sc.idx * 2) + pr.idProfessionnel, 5) = 0 THEN 'Tres bon producteur, communication claire et qualite reguliere.'
            WHEN MOD((sc.idx * 2) + pr.idProfessionnel, 3) = 0 THEN 'Bonne experience d''achat, service fiable et produits conformes.'
            ELSE 'Professionnel recommande pour la qualite des produits et le suivi des commandes.'
        END AS commentaire,
        DATE_ADD('2026-02-15 08:30:00', INTERVAL ((sc.idx * 4) + pr.idProfessionnel) HOUR) AS dateCreation,
        DATE_ADD('2026-02-16 08:30:00', INTERVAL ((sc.idx * 4) + pr.idProfessionnel) HOUR) AS dateModification
    FROM SeedMassClient sc
    CROSS JOIN Professionnel pr
) AS seeded;

DROP TEMPORARY TABLE IF EXISTS SeedMassOrderLine;
DROP TEMPORARY TABLE IF EXISTS SeedMassOrder;
DROP TEMPORARY TABLE IF EXISTS SeedMassClient;

-- =============================================================
--  FIN DU PEUPLEMENT
-- =============================================================
