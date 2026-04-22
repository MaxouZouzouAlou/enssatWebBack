USE localzh;

ALTER TABLE Produit
    DROP FOREIGN KEY fk_produit_producteur;

ALTER TABLE Produit
    CHANGE idProducteur idProfessionnel INT NOT NULL;

ALTER TABLE Produit
    ADD CONSTRAINT fk_produit_professionnel
    FOREIGN KEY (idProfessionnel) REFERENCES Professionnel(idProfessionnel)
    ON DELETE RESTRICT ON UPDATE CASCADE;
