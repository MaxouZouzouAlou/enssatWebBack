CREATE DATABASE IF NOT EXISTS localzh;
USE localzh;

-- ========================
-- UTILISATEURS (héritage)
-- ========================

CREATE TABLE Utilisateur (
    id                  INT PRIMARY KEY AUTO_INCREMENT,
    mdp                 VARCHAR(255) NOT NULL,
    nom                 VARCHAR(100),
    prenom              VARCHAR(100),
    type_utilisateur    VARCHAR(50) NOT NULL  -- 'client', 'admin', 'superadmin'
);

CREATE TABLE Client (
    idUser          INT PRIMARY KEY,
    email           VARCHAR(255) UNIQUE NOT NULL,
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

-- ========================
-- PRODUCTEUR & PROFESSIONNEL
-- ========================

CREATE TABLE Producteur (
    idProducteur    INT PRIMARY KEY AUTO_INCREMENT,
    email           VARCHAR(255) UNIQUE NOT NULL,
    mdp             VARCHAR(255) NOT NULL,
    rating          FLOAT DEFAULT 0,
    adresse         VARCHAR(255),
    num_telephone   VARCHAR(20)
);

CREATE TABLE Producteur_SIRET (
    idProducteur    INT NOT NULL,
    numero_siret    VARCHAR(14) NOT NULL,
    PRIMARY KEY (idProducteur, numero_siret),
    FOREIGN KEY (idProducteur) REFERENCES Producteur(idProducteur) ON DELETE CASCADE
);

CREATE TABLE Professionnel (
    idProfessionnel INT PRIMARY KEY AUTO_INCREMENT,
    email           VARCHAR(255) UNIQUE NOT NULL,
    mdp             VARCHAR(255) NOT NULL
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
    latitude        FLOAT,
    longitude       FLOAT
);

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