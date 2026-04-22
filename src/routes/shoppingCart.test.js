import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import { createShoppingCartRouter } from './shoppingCart.js';

function particulierProfile(id = 10) {
    return {
        user: { prenom: 'Ada', nom: 'Lovelace' },
        particulier: { id },
        professionnel: null
    };
}

function createAuthClient(session) {
    return {
        api: {
            getSession: async () => session
        }
    };
}

function createRouter({ authClient, db, profile = particulierProfile() }) {
    return createShoppingCartRouter({
        authClient,
        db,
        getProfileByAuthUserId: async () => profile,
        headersFromNode: (headers) => headers
    });
}

function createRequest(method, url, body) {
    const req = new Readable({
        read() {
            this.push(null);
        }
    });

    req.method = method;
    req.url = url;
    req.originalUrl = url;
    req.headers = {};
    req.body = body;
    return req;
}

function dispatch(router, { method = 'GET', url, body }) {
    return new Promise((resolve, reject) => {
        const req = createRequest(method, url, body);
        const res = {
            statusCode: 200,
            headers: {},
            setHeader(name, value) {
                this.headers[name.toLowerCase()] = value;
            },
            getHeader(name) {
                return this.headers[name.toLowerCase()];
            },
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(payload) {
                this.body = payload;
                resolve(this);
                return this;
            },
            end(payload) {
                this.body = payload;
                resolve(this);
                return this;
            }
        };

        router.handle(req, res, (err) => {
            if (err) reject(err);
            else resolve(res);
        });
    });
}

test('GET /:id returns 401 without a session', async () => {
    const db = {
        query: async () => { throw new Error('database should not be called'); },
        execute: async () => { throw new Error('database should not be called'); }
    };
    const router = createRouter({ authClient: createAuthClient(null), db });

    const response = await dispatch(router, { url: '/1' });

    assert.equal(response.statusCode, 401);
    assert.equal(response.body.error, 'Non authentifie.');
});

test('GET /:id/items returns 403 for another user cart', async () => {
    const queryCalls = [];
    const db = {
        query: async (sql, params) => {
            queryCalls.push({ sql, params });
            if (sql.includes('WHERE idPanier = ? AND idParticulier = ?')) return [[]];
            throw new Error(`unexpected query: ${sql}`);
        },
        execute: async () => { throw new Error('execute should not be called'); }
    };
    const router = createRouter({
        authClient: createAuthClient({ user: { id: 'auth-user-1' } }),
        db
    });

    const response = await dispatch(router, { url: '/99/items' });

    assert.equal(response.statusCode, 403);
    assert.equal(response.body.error, 'Acces interdit pour ce panier.');
    assert.deepEqual(queryCalls[0].params, [99, 10]);
});

test('POST /item accepts decimal quantity for kilo products', async () => {
    const executeCalls = [];
    const db = {
        query: async (sql, params) => {
            if (sql.includes('WHERE idParticulier = ?')) {
                assert.deepEqual(params, [10]);
                return [[{ idPanier: 5, idParticulier: 10 }]];
            }
            throw new Error(`unexpected query: ${sql}`);
        },
        execute: async (sql, params) => {
            executeCalls.push({ sql, params });
            if (sql.includes('SELECT quantite FROM Panier_Produit')) return [[]];
            if (sql.includes('SELECT * FROM Produit')) {
                return [[{ idProduit: 2, unitaireOuKilo: 0, stock: 10 }]];
            }
            if (sql.includes('INSERT INTO Panier_Produit')) return [{ affectedRows: 1 }];
            throw new Error(`unexpected execute: ${sql}`);
        }
    };
    const router = createRouter({
        authClient: createAuthClient({ user: { id: 'auth-user-1' } }),
        db
    });

    const response = await dispatch(router, {
        method: 'POST',
        url: '/item',
        body: { idProduit: 2, quantite: 0.5 }
    });

    assert.equal(response.statusCode, 201);
    assert.deepEqual(response.body, { idPanier: 5, idProduit: 2, quantite: 0.5 });
    assert.deepEqual(executeCalls.at(-1).params, [5, 2, 0.5]);
});

test('POST /item rejects decimal quantity for unit products', async () => {
    const executeCalls = [];
    const db = {
        query: async (sql) => {
            if (sql.includes('WHERE idParticulier = ?')) return [[{ idPanier: 5, idParticulier: 10 }]];
            throw new Error(`unexpected query: ${sql}`);
        },
        execute: async (sql, params) => {
            executeCalls.push({ sql, params });
            if (sql.includes('SELECT quantite FROM Panier_Produit')) return [[]];
            if (sql.includes('SELECT * FROM Produit')) {
                return [[{ idProduit: 6, unitaireOuKilo: 1, stock: 10 }]];
            }
            throw new Error(`unexpected execute: ${sql}`);
        }
    };
    const router = createRouter({
        authClient: createAuthClient({ user: { id: 'auth-user-1' } }),
        db
    });

    const response = await dispatch(router, {
        method: 'POST',
        url: '/item',
        body: { idProduit: 6, quantite: 0.5 }
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.error, 'La quantite doit etre entiere pour ce produit.');
    assert.equal(executeCalls.some((call) => call.sql.includes('INSERT INTO Panier_Produit')), false);
    assert.equal(executeCalls.some((call) => call.sql.includes('UPDATE Panier_Produit')), false);
});

test('POST /item rejects quantities above available stock', async () => {
    const executeCalls = [];
    const db = {
        query: async (sql) => {
            if (sql.includes('WHERE idParticulier = ?')) return [[{ idPanier: 5, idParticulier: 10 }]];
            throw new Error(`unexpected query: ${sql}`);
        },
        execute: async (sql, params) => {
            executeCalls.push({ sql, params });
            if (sql.includes('SELECT quantite FROM Panier_Produit')) return [[{ quantite: 3 }]];
            if (sql.includes('SELECT * FROM Produit')) {
                return [[{ idProduit: 2, unitaireOuKilo: 0, stock: 3.2 }]];
            }
            throw new Error(`unexpected execute: ${sql}`);
        }
    };
    const router = createRouter({
        authClient: createAuthClient({ user: { id: 'auth-user-1' } }),
        db
    });

    const response = await dispatch(router, {
        method: 'POST',
        url: '/item',
        body: { idProduit: 2, quantite: 0.5 }
    });

    assert.equal(response.statusCode, 409);
    assert.equal(response.body.error, 'Stock insuffisant pour ce produit.');
    assert.equal(executeCalls.some((call) => call.sql.includes('UPDATE Panier_Produit')), false);
    assert.equal(executeCalls.some((call) => call.sql.includes('INSERT INTO Panier_Produit')), false);
});
