USE localzh;

CREATE TABLE IF NOT EXISTS `user` (
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

CREATE TABLE IF NOT EXISTS `session` (
    id          VARCHAR(255) PRIMARY KEY,
    expiresAt   DATETIME NOT NULL,
    token       VARCHAR(255) NOT NULL UNIQUE,
    createdAt   DATETIME NOT NULL,
    updatedAt   DATETIME NOT NULL,
    ipAddress   TEXT,
    userAgent   TEXT,
    userId      VARCHAR(255) NOT NULL,
    INDEX idx_session_userId (userId),
    FOREIGN KEY (userId) REFERENCES `user`(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `account` (
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
    INDEX idx_account_userId (userId),
    FOREIGN KEY (userId) REFERENCES `user`(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `verification` (
    id          VARCHAR(255) PRIMARY KEY,
    identifier  VARCHAR(255) NOT NULL,
    value       TEXT NOT NULL,
    expiresAt   DATETIME NOT NULL,
    createdAt   DATETIME NOT NULL,
    updatedAt   DATETIME NOT NULL,
    INDEX idx_verification_identifier (identifier)
);

CREATE TABLE IF NOT EXISTS AuthProfile (
    authUserId       VARCHAR(255) PRIMARY KEY,
    accountType      ENUM('particulier', 'professionnel') NOT NULL,
    clientId         INT,
    professionnelId  INT,
    entrepriseId     INT,
    createdAt        DATETIME NOT NULL,
    updatedAt        DATETIME NOT NULL,
    INDEX idx_auth_profile_account_type (accountType),
    FOREIGN KEY (authUserId) REFERENCES `user`(id) ON DELETE CASCADE,
    FOREIGN KEY (clientId) REFERENCES Client(idUser) ON DELETE CASCADE,
    FOREIGN KEY (professionnelId) REFERENCES Professionnel(idProfessionnel) ON DELETE CASCADE,
    FOREIGN KEY (entrepriseId) REFERENCES Entreprise(idEntreprise) ON DELETE SET NULL
);
