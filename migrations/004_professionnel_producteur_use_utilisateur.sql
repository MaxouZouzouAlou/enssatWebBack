USE localzh;

UPDATE Utilisateur
SET type_utilisateur = 'particulier'
WHERE type_utilisateur = 'client';

ALTER TABLE AuthProfile
    DROP FOREIGN KEY AuthProfile_ibfk_3;

ALTER TABLE Professionnel_SIRET
    DROP FOREIGN KEY Professionnel_SIRET_ibfk_1;

ALTER TABLE Professionnel
    DROP INDEX email,
    DROP COLUMN email,
    DROP COLUMN mdp,
    MODIFY idProfessionnel INT NOT NULL;

ALTER TABLE Professionnel
    ADD CONSTRAINT fk_professionnel_utilisateur
    FOREIGN KEY (idProfessionnel) REFERENCES Utilisateur(id)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE AuthProfile
    ADD CONSTRAINT fk_auth_profile_professionnel
    FOREIGN KEY (professionnelId) REFERENCES Professionnel(idProfessionnel)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE Professionnel_SIRET
    ADD CONSTRAINT fk_professionnel_siret_professionnel
    FOREIGN KEY (idProfessionnel) REFERENCES Professionnel(idProfessionnel)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE Producteur_SIRET
    DROP FOREIGN KEY Producteur_SIRET_ibfk_1;

ALTER TABLE Produit
    DROP FOREIGN KEY Produit_ibfk_1;

ALTER TABLE Producteur
    DROP INDEX email,
    DROP COLUMN email,
    DROP COLUMN mdp,
    MODIFY idProducteur INT NOT NULL;

ALTER TABLE Producteur
    ADD CONSTRAINT fk_producteur_utilisateur
    FOREIGN KEY (idProducteur) REFERENCES Utilisateur(id)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE Producteur_SIRET
    ADD CONSTRAINT fk_producteur_siret_producteur
    FOREIGN KEY (idProducteur) REFERENCES Producteur(idProducteur)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE Produit
    ADD CONSTRAINT fk_produit_producteur
    FOREIGN KEY (idProducteur) REFERENCES Producteur(idProducteur)
    ON DELETE RESTRICT ON UPDATE CASCADE;
