# LocalZH — Backend (Node.js + Express)

API REST du projet LocalZH, construite avec Node.js (ES modules), Express, MySQL et Better Auth.

---

## Prérequis

- Node.js >= 16 et npm
- MySQL Server installé localement (sans Docker)

---

## Installation de A à Z

### 1. Cloner le dépôt

```bash
# HTTPS
git clone https://github.com/MaxouZouzouAlou/enssatWebBack.git

# SSH
git clone git@github.com:MaxouZouzouAlou/enssatWebBack.git

cd enssatWebBack
```

### 2. Installer MySQL

```bash
sudo apt update
sudo apt install mysql-server -y
sudo systemctl start mysql
sudo systemctl status mysql --no-pager
```

### 3. Configurer l'authentification MySQL

Sur certaines installations locales, `root` utilise l'authentification par socket. Si `mysql -u root -psqlpassword` échoue, reconfigurer le mot de passe :

```bash
sudo mysql
```

Dans le prompt MySQL :

```sql
SELECT user, host, plugin FROM mysql.user WHERE user = 'root';

ALTER USER 'root'@'localhost'
  IDENTIFIED WITH caching_sha2_password BY 'sqlpassword';
-- Si la version MySQL refuse caching_sha2_password :
-- ALTER USER 'root'@'localhost' IDENTIFIED BY 'sqlpassword';

exit
```

Vérifier ensuite :

```bash
mysql -u root -psqlpassword -e "SELECT VERSION();"
```

### 4. Créer le fichier `.env`

Créer un fichier `.env` à la racine du projet :

```bash
# Base de données
DB_HOST=127.0.0.1
DB_USER=root
DB_PASS=sqlpassword
DB_NAME=localzh

# Serveur
PORT_OPEN=49161
FRONTEND_ORIGIN=http://localhost:3000

# Better Auth
BETTER_AUTH_URL=http://localhost:49161
BETTER_AUTH_SECRET=<openssl rand -base64 32>

# Google OAuth (optionnel — nécessaire uniquement pour la connexion Google)
GOOGLE_CLIENT_ID=<google-oauth-client-id>
GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>

# SMTP (optionnel en dev — les liens de vérification s'affichent dans la console si absent)
MAIL_FROM=No Reply <no-reply@localzh.com>
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<brevo-smtp-login>
SMTP_PASS=<brevo-smtp-key>
```

> L'URL de callback Google OAuth doit pointer vers le backend :
> `http://localhost:49161/api/auth/callback/google`

### 5. Initialiser la base de données

```bash
mysql -u root -psqlpassword < init.sql
```

Pour réinitialiser complètement la base en cours de développement :

```bash
mysql -u root -psqlpassword < init.sql
```

Le script `init.sql` contient `DROP DATABASE IF EXISTS localzh` — il repart de zéro à chaque exécution. Ne pas appliquer les fichiers de `migrations/` pour une installation normale.

### 6. Installer les dépendances

```bash
npm install
```

### 7. Lancer le serveur

```bash
npm run dev   # développement (nodemon, rechargement automatique)
npm start     # production
```

L'API est disponible sur `http://localhost:49161`.  
La documentation Swagger est accessible sur `http://localhost:49161/api-docs`.

---

## Comptes de test

Pour explorer toutes les facettes de la plateforme via le frontend, vous pouvez utiliser les comptes suivants (Mot de passe : `Test1234@`) :

| Type de compte | Email | Particularité |
|---|---|---|
| **Super Admin** | `testsuperadmin1@gmail.com` | Accès à la gestion des comptes, entreprises, produits et tickets incidents. |
| **Producteur** | `testprofessionnel1@gmail.com` | Gère **deux entreprises** (Les fruits de mamie & Conserverie du Trégor). |
| **Particulier** | `client.bulk+008@localzh.test` | Possède déjà un **bon d'achat actif** et un historique de commandes. |

---

## Lancer les tests

```bash
npm test
```

---

## Architecture

```
src/
├── index.js              # Point d'entrée — Express, CORS, routage, Swagger
├── auth.js               # Configuration Better Auth + hooks de création de profil
├── routes/               # Un fichier par domaine (products, orders, shoppingCart, incidents…)
├── services/             # Logique métier réutilisable
├── server_config/
│   ├── db.js             # Pool MySQL (mysql2)
│   └── env.js            # Lecture et validation des variables d'environnement
└── images/produits/      # Images uploadées via multer (stockage local)
```

### Base de données

Le schéma complet est dans `init.sql`. Tables principales :

| Table | Rôle |
|---|---|
| `user`, `session`, `account` | Gestion des comptes Better Auth |
| `AuthProfile` | Lien entre un compte Better Auth et le profil métier |
| `Utilisateur`, `Particulier`, `Professionnel` | Profils métier |
| `Entreprise`, `Professionnel_Entreprise` | Entreprises rattachées aux pros |
| `Produit`, `Image` | Catalogue produits |
| `Panier`, `Panier_Produit` | Panier |
| `Commande`, `LigneCommande` | Commandes |
| `LieuVente`, `PointRelais` | Points de vente et relais |

### Authentification

- Better Auth gère les comptes, la vérification e-mail et les sessions (cookies).
- Les endpoints sont montés sous `/api/auth/*`.
- Les hooks dans `src/auth.js` créent et synchronisent les profils métier lors de l'inscription ou de la vérification e-mail.
- Les routes protégées vérifient la session via `auth.api.getSession()` et l'ownership via `getBusinessProfileByAuthUserId`.
- Sans SMTP configuré, les liens de vérification s'affichent dans la console serveur.

### Gestion des images

- Upload géré par `multer`, fichiers stockés dans `src/images/produits/`.
- Le chemin relatif est enregistré en base dans `Image.path`.
- Les réponses enrichissent les produits avec `imageData` (data URL base64) pour simplifier l'affichage côté client.

### Endpoints principaux

| Méthode | Route | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Inscription particulier/professionnel |
| `GET` | `/api/auth/profile` | Profil de la session courante |
| `POST` | `/api/auth/send-verification-email` | Renvoyer l'e-mail de vérification |
| `GET` | `/products` | Liste des produits |
| `POST` | `/products/professionnel/:id` | Créer un produit (pro authentifié) |
| `PUT` | `/products/professionnel/:id/:idProduit` | Modifier un produit |
| `DELETE` | `/products/professionnel/:id/:idProduit` | Supprimer un produit |
| `GET` | `/professionnels/:id/dashboard` | Dashboard vendeur |

---

## Bonnes pratiques

- Toujours vérifier l'ownership côté serveur avant toute modification ou suppression.
- Valider et assainir les champs reçus (prix, TVA, stock, formats d'image) avant insertion en base.
- Ne jamais commiter `.env` ni les clés secrètes.
- En production, externaliser le stockage d'images (S3 ou équivalent).

---

## Workflow Git

```bash
git pull origin main          # toujours avant de commencer
git checkout -b feat/ma-feature
# ... travail ...
git add <fichiers>
git commit -m "feat: description"
git push origin feat/ma-feature
```

Conventions de nommage des branches et commits : `feat/`, `fix/`, `docs/`, `delete/`.
