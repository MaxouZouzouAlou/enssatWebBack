# ENSSAT Backend (Node.js + Express + Swagger + Better Auth)

Prerequisites
- Install Node.js (>=16) and npm
- Install MySQL server locally (no Docker)

Setup
1. Install MySQL if needed.

```bash
sudo apt update
sudo apt install mysql-server -y
```

2. Check that the MySQL service is running.

```bash
sudo systemctl status mysql --no-pager
```

3. Make sure the MySQL `root` account can authenticate with a password.

On some local installs, `root` uses socket authentication and `mysql -u root
-p...` will fail even if MySQL is running. In that case, configure the local
`root` password once:

```bash
sudo mysql
```

Inside the MySQL prompt, first check the current plugin:

```sql
SELECT user, host, plugin FROM mysql.user WHERE user = 'root';
```

Then set the root password and enable password authentication:

```sql
ALTER USER 'root'@'localhost'
IDENTIFIED WITH caching_sha2_password BY 'sqlpassword';
```

If your MySQL version rejects `caching_sha2_password`, use the default
authentication plugin:

```sql
ALTER USER 'root'@'localhost' IDENTIFIED BY 'sqlpassword';
```

Then quit MySQL:

```sql
exit
```

4. Check the MySQL `root` password before importing the schema.

The expected local password is `sqlpassword`. Verify it with:

```bash
# from project root
mysql -u root -psqlpassword -e "SELECT VERSION();"
```

You can also test interactively:

```bash
mysql -u root -p
```

Password:

```text
sqlpassword
```

If the command fails with `Access denied`, the local MySQL `root` password is
not `sqlpassword`. Either use the correct password in the commands below, or
update the MySQL root password locally before continuing.

5. Create `.env` and configure the required database credentials.

Recommended project database values:

```bash
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=sqlpassword
DB_NAME=localzh
```

6. Initialize the database from `init.sql`:

```bash
# from project root
mysql -u root -psqlpassword < init.sql
```

Do not apply files from `migrations/` for the normal setup. The current schema
used by the project is fully defined in `init.sql`.

If you need to recreate the database from scratch during local development:

```bash
mysql -u root -psqlpassword -e "DROP DATABASE IF EXISTS localzh;"
mysql -u root -psqlpassword < init.sql
```

These variables are required at runtime outside tests. The backend now fails
fast at startup when one of them is missing.

6. Configure auth environment variables:

```bash
PORT_OPEN=49161
FRONTEND_ORIGIN=http://localhost:3000
BETTER_AUTH_URL=http://localhost:49161
BETTER_AUTH_SECRET=<openssl rand -base64 32>
GOOGLE_CLIENT_ID=<google-oauth-client-id>
GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>
MAIL_FROM=No Reply <no-reply@localzh.com>
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<brevo-smtp-login>
SMTP_PASS=<brevo-smtp-key>
```

`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are required only for Google
login. The Google OAuth redirect URL must target the backend Better Auth
callback, for example:

```text
http://localhost:49161/api/auth/callback/google
```

Passwords are hashed by Better Auth and stored in its `account` table. The
`Utilisateur`, `Professionnel`, and `Producteur` tables do not store account
passwords. Professional and producer account identity fields live in
`Utilisateur`; `Professionnel` and `Producteur` stay as business extension
tables keyed by the same id.

Email/password accounts require email verification before login. When SMTP is
not configured, the backend prints the verification link in the server logs for
local development. With SMTP configured, the link is sent to the account email.

The `Utilisateur` address fields are not part of registration. Professional
registration stores company address fields on `Entreprise`.

Minimum required `.env` example:

```bash
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=sqlpassword
DB_NAME=localzh
PORT_OPEN=49161
FRONTEND_ORIGIN=http://localhost:3000
BETTER_AUTH_URL=http://localhost:49161
BETTER_AUTH_SECRET=<openssl rand -base64 32>
```

7. Install dependencies and start server:

```bash
npm install
npm run dev   # requires nodemon
# or
npm start
```

API docs are available at `http://localhost:49161/api-docs` when the server is running.

Auth endpoints:

- `POST /api/auth/register` for local particulier/professionnel registration.
- `GET /api/auth/profile` for current session plus domain profile.
- `POST /api/auth/send-verification-email` to resend a verification email.
- Better Auth native endpoints are mounted under `/api/auth/*`.
- `GET /professionnels/:idProfessionnel/dashboard` for the authenticated
  professional seller dashboard.
