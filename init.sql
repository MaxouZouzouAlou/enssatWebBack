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
    nom  VARCHAR(100),
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
('Zd4kfip6or78ukt2lHV5BObQGUJ0h4Kl', 'Testeur Test',  'testparticulier1@gmail.com',              1, 'user', NULL, 'particulier',   'Testeur', 'Test',   '2026-04-23 09:02:41', '2026-04-23 09:03:03'),
('YGrii7v7iKcdvjXEznpuus97uVFcjugJ', 'Vendeur Test',  'testprofessionnel1@gmail.com',   1, 'user', NULL, 'professionnel', 'Vendeur', 'Test',   '2026-04-23 09:18:07', '2026-04-23 09:18:15'),
('Qp7Hn2Lm9Xc4Vb1Ts8Kd5Rj3Wy6Uf0Za', 'Maraicher Test', 'testprofessionnel2@gmail.com',  1, 'user', NULL, 'professionnel', 'Maraicher', 'Test', '2026-04-23 09:18:07', '2026-04-23 09:18:15'),
('Bn4Rt8Yp1Lk6Jm3Nh0Vf5Dc2Xs9Qa7We', 'Primeur Test',   'testprofessionnel3@gmail.com',  1, 'user', NULL, 'professionnel', 'Primeur', 'Test',   '2026-04-23 09:18:07', '2026-04-23 09:18:15'),
('Hu3Ji7Ko1Lp9Mn5Bv2Cx8Dz4Sr6Ta0Ye', 'Artisan Test',   'testprofessionnel4@gmail.com',  1, 'user', NULL, 'professionnel', 'Artisan', 'Test',   '2026-04-23 09:18:07', '2026-04-23 09:18:15'),
('Te5Yu1Io9Pa3Sd7Fg2Hj6Kl8Zx4Cv0Bn', 'Eleveur Test',   'testprofessionnel5@gmail.com',  1, 'user', NULL, 'professionnel', 'Eleveur', 'Test',   '2026-04-23 09:18:07', '2026-04-23 09:18:15'),
('Mi2No6Pq0Rs4Tu8Vw1Xy5Za9Bc3De7Fg', 'Boulanger Test', 'testprofessionnel6@gmail.com',  1, 'user', NULL, 'professionnel', 'Boulanger', 'Test', '2026-04-23 09:18:07', '2026-04-23 09:18:15'),
('Gh8Jk2Lm6Np0Qr4St9Uv3Wx7Yz1Ab5Cd', 'Brasseur Test',  'testprofessionnel7@gmail.com',  1, 'user', NULL, 'professionnel', 'Brasseur', 'Test',  '2026-04-23 09:18:07', '2026-04-23 09:18:15');

-- Better Auth : comptes (mots de passe hashés)
INSERT INTO `account` (`id`, `accountId`, `providerId`, `userId`, `accessToken`, `refreshToken`, `idToken`, `accessTokenExpiresAt`, `refreshTokenExpiresAt`, `scope`, `password`, `createdAt`, `updatedAt`) VALUES
('IdNFDEtsGD7KsJoJ8o22xZXWjrPE45DU', 'Zd4kfip6or78ukt2lHV5BObQGUJ0h4Kl', 'credential', 'Zd4kfip6or78ukt2lHV5BObQGUJ0h4Kl', NULL, NULL, NULL, NULL, NULL, NULL, '8c4548400b2c989c6ef708454aac8226:cc89672727ff497b49367abc8ad29689b782fd7aafa8015be45e7df406eea485444b8ee331c101d56b373be18a08edfbf30a67f4c97266cff1b71feeedb2436d', '2026-04-23 09:02:41', '2026-04-23 09:02:41'),
('LzRTrX3qJvgRXgicsYEWWEpu9H2G5rox', 'YGrii7v7iKcdvjXEznpuus97uVFcjugJ', 'credential', 'YGrii7v7iKcdvjXEznpuus97uVFcjugJ', NULL, NULL, NULL, NULL, NULL, NULL, 'f6dc03a5329dc37db121c5781fc3194d:4788b30804eff32e996c751595ba68f13fc4671a7a4a6b83c7ea8ec2989a0e68642d9e1fc8f3a143c5761871b698a4eda234533c2096ea4388c01ccfccd17388',  '2026-04-23 09:18:07', '2026-04-23 09:18:07'),
('Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk', 'Qp7Hn2Lm9Xc4Vb1Ts8Kd5Rj3Wy6Uf0Za', 'credential', 'Qp7Hn2Lm9Xc4Vb1Ts8Kd5Rj3Wy6Uf0Za', NULL, NULL, NULL, NULL, NULL, NULL, 'f6dc03a5329dc37db121c5781fc3194d:4788b30804eff32e996c751595ba68f13fc4671a7a4a6b83c7ea8ec2989a0e68642d9e1fc8f3a143c5761871b698a4eda234533c2096ea4388c01ccfccd17388', '2026-04-23 09:18:07', '2026-04-23 09:18:07'),
('Ll9Mm8Nn7Oo6Pp5Qq4Rr3Ss2Tt1Uu0Vv', 'Bn4Rt8Yp1Lk6Jm3Nh0Vf5Dc2Xs9Qa7We', 'credential', 'Bn4Rt8Yp1Lk6Jm3Nh0Vf5Dc2Xs9Qa7We', NULL, NULL, NULL, NULL, NULL, NULL, 'f6dc03a5329dc37db121c5781fc3194d:4788b30804eff32e996c751595ba68f13fc4671a7a4a6b83c7ea8ec2989a0e68642d9e1fc8f3a143c5761871b698a4eda234533c2096ea4388c01ccfccd17388', '2026-04-23 09:18:07', '2026-04-23 09:18:07'),
('Ww1Xx2Yy3Zz4Aa5Bb6Cc7Dd8Ee9Ff0Gg', 'Hu3Ji7Ko1Lp9Mn5Bv2Cx8Dz4Sr6Ta0Ye', 'credential', 'Hu3Ji7Ko1Lp9Mn5Bv2Cx8Dz4Sr6Ta0Ye', NULL, NULL, NULL, NULL, NULL, NULL, 'f6dc03a5329dc37db121c5781fc3194d:4788b30804eff32e996c751595ba68f13fc4671a7a4a6b83c7ea8ec2989a0e68642d9e1fc8f3a143c5761871b698a4eda234533c2096ea4388c01ccfccd17388', '2026-04-23 09:18:07', '2026-04-23 09:18:07'),
('Hh0Ii1Jj2Kk3Ll4Mm5Nn6Oo7Pp8Qq9Rr', 'Te5Yu1Io9Pa3Sd7Fg2Hj6Kl8Zx4Cv0Bn', 'credential', 'Te5Yu1Io9Pa3Sd7Fg2Hj6Kl8Zx4Cv0Bn', NULL, NULL, NULL, NULL, NULL, NULL, 'f6dc03a5329dc37db121c5781fc3194d:4788b30804eff32e996c751595ba68f13fc4671a7a4a6b83c7ea8ec2989a0e68642d9e1fc8f3a143c5761871b698a4eda234533c2096ea4388c01ccfccd17388', '2026-04-23 09:18:07', '2026-04-23 09:18:07'),
('Ss9Tt8Uu7Vv6Ww5Xx4Yy3Zz2Aa1Bb0Cc', 'Mi2No6Pq0Rs4Tu8Vw1Xy5Za9Bc3De7Fg', 'credential', 'Mi2No6Pq0Rs4Tu8Vw1Xy5Za9Bc3De7Fg', NULL, NULL, NULL, NULL, NULL, NULL, 'f6dc03a5329dc37db121c5781fc3194d:4788b30804eff32e996c751595ba68f13fc4671a7a4a6b83c7ea8ec2989a0e68642d9e1fc8f3a143c5761871b698a4eda234533c2096ea4388c01ccfccd17388', '2026-04-23 09:18:07', '2026-04-23 09:18:07'),
('Dd1Ee2Ff3Gg4Hh5Ii6Jj7Kk8Ll9Mm0Nn', 'Gh8Jk2Lm6Np0Qr4St9Uv3Wx7Yz1Ab5Cd', 'credential', 'Gh8Jk2Lm6Np0Qr4St9Uv3Wx7Yz1Ab5Cd', NULL, NULL, NULL, NULL, NULL, NULL, 'f6dc03a5329dc37db121c5781fc3194d:4788b30804eff32e996c751595ba68f13fc4671a7a4a6b83c7ea8ec2989a0e68642d9e1fc8f3a143c5761871b698a4eda234533c2096ea4388c01ccfccd17388', '2026-04-23 09:18:07', '2026-04-23 09:18:07');

-- Better Auth : sessions
INSERT INTO `session` (`id`, `expiresAt`, `token`, `createdAt`, `updatedAt`, `ipAddress`, `userAgent`, `userId`) VALUES
('6VjT3UPy9HhQKXYfKI6jR4pFSRMT2QRh', '2026-04-30 09:03:03', 'snBXhxKZrAU9Ws0zi6Yt2Aq3HDzCDooj', '2026-04-23 09:03:03', '2026-04-23 09:03:03', '', 'Mozilla/5.0 (X11; Linux x86_64; rv:149.0) Gecko/20100101 Firefox/149.0', 'Zd4kfip6or78ukt2lHV5BObQGUJ0h4Kl'),
('sLKxmBxWuo5GRgp9okLcqaSXZyG8KGyU', '2026-04-30 09:18:15', 'EXs1YfDSLqOzvUtRITgDTh82DR8sqGvB', '2026-04-23 09:18:15', '2026-04-23 09:18:15', '', 'Mozilla/5.0 (X11; Linux x86_64; rv:149.0) Gecko/20100101 Firefox/149.0', 'YGrii7v7iKcdvjXEznpuus97uVFcjugJ');

-- Utilisateurs métier
INSERT INTO `Utilisateur` (`id`, `type_utilisateur`, `nom`, `prenom`, `email`, `num_telephone`, `adresse_ligne`, `code_postal`, `ville`, `idAdmin`) VALUES
(1, 'particulier',   'Test', 'Testeur', 'testparticulier1@gmail.com',            NULL, NULL, NULL, NULL, NULL),
(2, 'professionnel', 'Test', 'Vendeur',   'testprofessionnel1@gmail.com', NULL, NULL, NULL, NULL, NULL),
(3, 'professionnel', 'Test', 'Maraicher', 'testprofessionnel2@gmail.com', NULL, NULL, NULL, NULL, NULL),
(4, 'professionnel', 'Test', 'Primeur',   'testprofessionnel3@gmail.com', NULL, NULL, NULL, NULL, NULL),
(5, 'professionnel', 'Test', 'Artisan',   'testprofessionnel4@gmail.com', NULL, NULL, NULL, NULL, NULL),
(6, 'professionnel', 'Test', 'Eleveur',   'testprofessionnel5@gmail.com', NULL, NULL, NULL, NULL, NULL),
(7, 'professionnel', 'Test', 'Boulanger', 'testprofessionnel6@gmail.com', NULL, NULL, NULL, NULL, NULL),
(8, 'professionnel', 'Test', 'Brasseur',  'testprofessionnel7@gmail.com', NULL, NULL, NULL, NULL, NULL);

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
('Gh8Jk2Lm6Np0Qr4St9Uv3Wx7Yz1Ab5Cd', 'professionnel', NULL,  7,    7,    '2026-04-23 11:18:07', '2026-04-23 11:18:07');

-- Paniers
INSERT INTO `Panier` (`idPanier`, `nom`, `estLivrable`, `idParticulier`, `idProfessionnel`) VALUES
(1, 'Panier de Testeur',    1, 1,    NULL),
(2, 'Panier de Testeur',    1, 1,    NULL),
(3, 'Panier pro de Vendeur', 0, NULL, 1);

-- Points Relais
INSERT INTO `PointRelais` (`nom`, `adresse_ligne`, `code_postal`, `ville`) VALUES
('La Poste de Lannion',             'Quai d\'Aiguillon',                    '22300', 'Lannion'),
('Carrefour City',                  '8 rue des Augustins',                  '22300', 'Lannion'),
('Bar Tabac Le Vieux Servel',       '5 rue de Kerpabu',                     '22300', 'Lannion'),
('Accueil E.Leclerc Lannion Centre','Route de Guingamp Saint Elivet',       '22300', 'Lannion'),
('Consigne Pickup Weldom Lannion',  '38 rue Saint-Marc',                    '22300', 'Lannion');

-- Lieux de Vente
INSERT INTO `LieuVente` (`nom`, `horaires`, `adresse_ligne`, `code_postal`, `ville`) VALUES
('Les Halles de Lannion',          'Mar-Sam 8h-13h',          'Place du Miroir',                              '22300', 'Lannion'),
('Marché de la Mutante',           'Mer 16h-19h',             'Manoir de Trorozec, 8 Rue de Trorozec',        '22300', 'Lannion'),
('Ferme de Keranod',               'Mar-Ven 16h30-18h30',     '102 Ker an Nod',                               '22300', 'Lannion'),
('Au Potager de Kervoigen',        'Ven-Sam 9h-12h',          'Chemin de Kervoigen',                          '22300', 'Lannion'),
('Bergerie de Kroaz Min',          'Mer-Ven 15h-18h',         'Servel',                                       '22300', 'Lannion'),
('Ferme du Wern',                  'Mar 16h-19h',             'Le Launay',                                    '22300', 'Ploubezre'),
('La Ferme Bio de Kernéan',        'Ven 17h-19h',             '6 Route de Kernéan',                           '22560', 'Pleumeur-Bodou'),
('Brasstillerie KanArFoll',        'Mer 16h-19h',             'Pôle Phoenix, Bat B',                          '22560', 'Pleumeur-Bodou'),
('La Fabrique du Potager',         'Sam 9h30-12h30',          '78 rue de Kernevez',                           '22560', 'Trébeurden'),
('Ferme du Lanno',                 'Mar-Sam 9h-12h',          '2 Place du Kroajou',                           '22660', 'Trélévern'),
('Dolmen & Potager',               'Mar 15h-18h, Ven 16h-19h','Ferme de Coat Mez',                            '22660', 'Trévou-Tréguignec'),
('La ferme végétale de Boiséon',   'Mar-Ven 16h-19h',         '3 Bois Yvon',                                  '22710', 'Penvénan'),
('La Ferme des Hautes Terres',     'Mar 17h30-19h',           '5 Kercadieu, route de Pors Hir',               '22820', 'Plougrescant'),
('La Ferme de Keredern',           'Ven 9h-12h, Sam 9h-12h', '14 Lieu-dit Keredern',                         '22220', 'Trédarzec'),
('Bernard Fay Légumes',            'Lun-Sam 9h-12h30',        '54 rue de la Presqu\'île, Bourg de l\'Armor',  '22610', 'Pleubian');

-- =============================================================
--  FIN DU PEUPLEMENT
-- =============================================================
