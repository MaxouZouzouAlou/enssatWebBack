USE localzh;

ALTER TABLE `user`
    ADD COLUMN role VARCHAR(50) NOT NULL DEFAULT 'user' AFTER accountType;
