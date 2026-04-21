# ENSSAT Backend (Node.js + Express + Swagger + Better Auth)

Prerequisites
- Install Node.js (>=16) and npm
- Install MySQL server locally (no Docker)

Setup
1. Copy `.env.example` to `.env` and edit DB credentials if needed.
2. Initialize the database:

```bash
# from project root (adjust user/host if necessary)
mysql -u root -p < init.sql
```

If the `localzh` database already exists, apply the migrations in order:

```bash
mysql -u root -p localzh < migrations/001_auth.sql
mysql -u root -p localzh < migrations/002_user_company_email_verification.sql
mysql -u root -p localzh < migrations/003_drop_utilisateur_mdp.sql
mysql -u root -p localzh < migrations/004_professionnel_producteur_use_utilisateur.sql
```

3. Configure auth environment variables:

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

4. Install dependencies and start server:

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
