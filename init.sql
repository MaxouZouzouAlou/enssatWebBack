CREATE DATABASE IF NOT EXISTS localzh;
USE localzh;

-- ========================
-- BETTER AUTH
-- ========================

CREATE TABLE `user` (
    id              VARCHAR(255) PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    email           VARCHAR(255) NOT NULL UNIQUE,
    emailVerified   BOOLEAN NOT NULL DEFAULT FALSE,
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
    FOREIGN KEY (userId) REFERENCES `user`(id) ON DELETE CASCADE
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
    FOREIGN KEY (userId) REFERENCES `user`(id) ON DELETE CASCADE
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

-- ========================
-- UTILISATEURS (héritage)
-- ========================

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
    idAdmin          INT          UNIQUE
);

CREATE TABLE Client (
    idUser          INT PRIMARY KEY,
    pointsFidelite  INT DEFAULT 0,
    FOREIGN KEY (idUser) REFERENCES Utilisateur(id) ON DELETE CASCADE
);

CREATE TABLE Admin (
    idAdmin         INT PRIMARY KEY,
    FOREIGN KEY (idAdmin) REFERENCES Utilisateur(id) ON DELETE CASCADE
);

CREATE TABLE SuperAdmin (
    idAdmin         INT PRIMARY KEY,
    FOREIGN KEY (idAdmin) REFERENCES Admin(idAdmin) ON DELETE CASCADE
    -- SuperAdmin "est un" Admin (double héritage)
);

ALTER TABLE Utilisateur
    ADD CONSTRAINT fk_utilisateur_superadmin
    FOREIGN KEY (idAdmin) REFERENCES SuperAdmin(idAdmin)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ========================
-- PRODUCTEUR & PROFESSIONNEL
-- ========================

CREATE TABLE Producteur (
    idProducteur    INT PRIMARY KEY,
    rating          FLOAT DEFAULT 0,
    adresse         VARCHAR(255),
    num_telephone   VARCHAR(20),
    FOREIGN KEY (idProducteur) REFERENCES Utilisateur(id) ON DELETE CASCADE
);

CREATE TABLE Producteur_SIRET (
    idProducteur    INT NOT NULL,
    numero_siret    VARCHAR(14) NOT NULL,
    PRIMARY KEY (idProducteur, numero_siret),
    FOREIGN KEY (idProducteur) REFERENCES Producteur(idProducteur) ON DELETE CASCADE
);

CREATE TABLE Professionnel (
    idProfessionnel INT PRIMARY KEY,
    FOREIGN KEY (idProfessionnel) REFERENCES Utilisateur(id) ON DELETE CASCADE
);

CREATE TABLE Professionnel_SIRET (
    idProfessionnel INT NOT NULL,
    numero_siret    VARCHAR(14) NOT NULL,
    PRIMARY KEY (idProfessionnel, numero_siret),
    FOREIGN KEY (idProfessionnel) REFERENCES Professionnel(idProfessionnel) ON DELETE CASCADE
);

-- ========================
-- ENTREPRISE
-- ========================

CREATE TABLE Entreprise (
    idEntreprise    INT PRIMARY KEY AUTO_INCREMENT,
    nom             VARCHAR(255) NOT NULL,
    siret           VARCHAR(14) UNIQUE NOT NULL,
    adresse_ligne   VARCHAR(255),
    code_postal     VARCHAR(10),
    ville           VARCHAR(100),
    latitude        FLOAT,
    longitude       FLOAT
);

-- Mapping entre Better Auth et les tables metier existantes.
CREATE TABLE AuthProfile (
    authUserId       VARCHAR(255) PRIMARY KEY,
    accountType      ENUM('particulier', 'professionnel') NOT NULL,
    clientId         INT,
    professionnelId  INT,
    entrepriseId     INT,
    createdAt        DATETIME NOT NULL,
    updatedAt        DATETIME NOT NULL,
    FOREIGN KEY (authUserId) REFERENCES `user`(id) ON DELETE CASCADE,
    FOREIGN KEY (clientId) REFERENCES Client(idUser) ON DELETE CASCADE,
    FOREIGN KEY (professionnelId) REFERENCES Professionnel(idProfessionnel) ON DELETE CASCADE,
    FOREIGN KEY (entrepriseId) REFERENCES Entreprise(idEntreprise) ON DELETE SET NULL
);

CREATE INDEX idx_auth_profile_account_type ON AuthProfile(accountType);

-- ========================
-- PRODUIT
-- ========================

CREATE TABLE Produit (
    idProduit               INT PRIMARY KEY AUTO_INCREMENT,
    idProducteur            INT NOT NULL,
    nom                     VARCHAR(255) NOT NULL,
    nature                  VARCHAR(100),
    bio                     BOOLEAN DEFAULT FALSE,
    prix                    FLOAT NOT NULL,
    tva                     FLOAT NOT NULL,
    reductionProfessionnel  FLOAT DEFAULT 0,
    stock                   INT DEFAULT 0,
    visible                 BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (idProducteur) REFERENCES Producteur(idProducteur) ON DELETE RESTRICT
);

-- Favoris (association Client <-> Produit)
CREATE TABLE Favoris (
    idUser      INT NOT NULL,
    idProduit   INT NOT NULL,
    PRIMARY KEY (idUser, idProduit),
    FOREIGN KEY (idUser)    REFERENCES Client(idUser) ON DELETE CASCADE,
    FOREIGN KEY (idProduit) REFERENCES Produit(idProduit) ON DELETE CASCADE
);

-- ========================
-- LIEUX
-- ========================

CREATE TABLE LieuVente (
    idLieu      INT PRIMARY KEY AUTO_INCREMENT,
    adresse     VARCHAR(255),
    horaires    VARCHAR(255),
    typeLieu    VARCHAR(100),
    latitude    FLOAT,
    longitude   FLOAT
);

-- Produits exposés sur un LieuVente (association "Est exposé sur")
CREATE TABLE LieuVente_Produit (
    idLieu      INT NOT NULL,
    idProduit   INT NOT NULL,
    PRIMARY KEY (idLieu, idProduit),
    FOREIGN KEY (idLieu)    REFERENCES LieuVente(idLieu) ON DELETE CASCADE,
    FOREIGN KEY (idProduit) REFERENCES Produit(idProduit) ON DELETE CASCADE
);

CREATE TABLE PointRelais (
    idRelais    INT PRIMARY KEY AUTO_INCREMENT,
    adresse     VARCHAR(255),
    typeLieu    VARCHAR(100),
    latitude    FLOAT,
    longitude   FLOAT
);

-- ========================
-- COMMANDE
-- ========================

CREATE TABLE Commande (
    idCommande      INT PRIMARY KEY AUTO_INCREMENT,
    idClient        INT NOT NULL,
    dateCommande    DATE NOT NULL,
    modeLivraison   VARCHAR(100),
    prixTotal       FLOAT,
    status          VARCHAR(50),
    estLivrable     BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (idClient) REFERENCES Client(idUser) ON DELETE RESTRICT
);

-- Ligne de commande (association Commande <-> Produit, "Composée de")
CREATE TABLE LigneCommande (
    idCommande      INT NOT NULL,
    idProduit       INT NOT NULL,
    quantite        INT NOT NULL DEFAULT 1,
    prixTTC         FLOAT NOT NULL,
    PRIMARY KEY (idCommande, idProduit),
    FOREIGN KEY (idCommande)    REFERENCES Commande(idCommande) ON DELETE CASCADE,
    FOREIGN KEY (idProduit)     REFERENCES Produit(idProduit) ON DELETE RESTRICT
);

-- ========================
-- LIVRAISON
-- ========================

CREATE TABLE Livraison (
    idLivraison     INT PRIMARY KEY AUTO_INCREMENT,
    idCommande      INT NOT NULL,
    idClient        INT NOT NULL,
    adresse         VARCHAR(255),
    FOREIGN KEY (idCommande)    REFERENCES Commande(idCommande) ON DELETE CASCADE,
    FOREIGN KEY (idClient)      REFERENCES Client(idUser) ON DELETE RESTRICT
);

-- Livraison via LieuVente ("Utilise")
CREATE TABLE Livraison_LieuVente (
    idLivraison INT NOT NULL,
    idLieu      INT NOT NULL,
    PRIMARY KEY (idLivraison, idLieu),
    FOREIGN KEY (idLivraison)   REFERENCES Livraison(idLivraison) ON DELETE CASCADE,
    FOREIGN KEY (idLieu)        REFERENCES LieuVente(idLieu) ON DELETE RESTRICT
);

-- Livraison via PointRelais ("Utilise")
CREATE TABLE Livraison_PointRelais (
    idLivraison INT NOT NULL,
    idRelais    INT NOT NULL,
    PRIMARY KEY (idLivraison, idRelais),
    FOREIGN KEY (idLivraison)   REFERENCES Livraison(idLivraison) ON DELETE CASCADE,
    FOREIGN KEY (idRelais)      REFERENCES PointRelais(idRelais) ON DELETE RESTRICT
);

-- ========================
-- LISTE DE COURSES & COMMANDE AUTO
-- ========================

CREATE TABLE ListeCourse (
    idListe     INT PRIMARY KEY AUTO_INCREMENT,
    nom         VARCHAR(255),
    idClient    INT NOT NULL,
    FOREIGN KEY (idClient) REFERENCES Client(idUser) ON DELETE CASCADE
);

-- Produits dans une liste de courses
CREATE TABLE ListeCourse_Produit (
    idListe     INT NOT NULL,
    idProduit   INT NOT NULL,
    quantite    INT DEFAULT 1,
    PRIMARY KEY (idListe, idProduit),
    FOREIGN KEY (idListe)   REFERENCES ListeCourse(idListe) ON DELETE CASCADE,
    FOREIGN KEY (idProduit) REFERENCES Produit(idProduit) ON DELETE CASCADE
);

CREATE TABLE CommandeAuto (
    idAuto              INT PRIMARY KEY AUTO_INCREMENT,
    idRefCommande       INT NOT NULL,           -- référence une commande modèle
    idListe             INT,                    -- peut être liée à une liste de courses
    frequence           VARCHAR(50),
    estActif            BOOLEAN DEFAULT TRUE,
    prochaineEcheance   DATE,
    FOREIGN KEY (idRefCommande) REFERENCES Commande(idCommande) ON DELETE RESTRICT,
    FOREIGN KEY (idListe)       REFERENCES ListeCourse(idListe) ON DELETE SET NULL
);
