USE localzh;

CREATE TABLE IF NOT EXISTS IncidentTicket (
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

CREATE TABLE IF NOT EXISTS IncidentTicketReponse (
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

CREATE TABLE IF NOT EXISTS IncidentTicketHistorique (
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
