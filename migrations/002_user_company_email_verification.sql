USE localzh;

ALTER TABLE Utilisateur
    ADD COLUMN email VARCHAR(255) UNIQUE AFTER prenom,
    ADD COLUMN num_telephone VARCHAR(20) AFTER email,
    ADD COLUMN adresse_ligne VARCHAR(255) AFTER num_telephone,
    ADD COLUMN code_postal VARCHAR(10) AFTER adresse_ligne,
    ADD COLUMN ville VARCHAR(100) AFTER code_postal,
    ADD COLUMN idAdmin INT UNIQUE AFTER ville;

UPDATE Utilisateur
LEFT JOIN Client ON Client.idUser = Utilisateur.id
SET Utilisateur.email = Client.email
WHERE Utilisateur.email IS NULL
  AND Client.email IS NOT NULL;

UPDATE Utilisateur
SET nom = ''
WHERE nom IS NULL;

UPDATE Utilisateur
SET prenom = ''
WHERE prenom IS NULL;

ALTER TABLE Utilisateur
    MODIFY nom VARCHAR(100) NOT NULL,
    MODIFY prenom VARCHAR(100) NOT NULL;

ALTER TABLE Utilisateur
    ADD CONSTRAINT fk_utilisateur_superadmin
    FOREIGN KEY (idAdmin) REFERENCES SuperAdmin(idAdmin)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE Client
    MODIFY email VARCHAR(255) NULL;

ALTER TABLE Entreprise
    ADD COLUMN adresse_ligne VARCHAR(255) AFTER siret,
    ADD COLUMN code_postal VARCHAR(10) AFTER adresse_ligne,
    ADD COLUMN ville VARCHAR(100) AFTER code_postal;
