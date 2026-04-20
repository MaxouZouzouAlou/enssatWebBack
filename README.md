# ENSSAT Backend (Node.js + Express + Swagger)

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

3. Install dependencies and start server:

```bash
npm install
npm run dev   # requires nodemon
# or
npm start
```

API docs are available at `http://localhost:3000/api-docs` when the server is running.
