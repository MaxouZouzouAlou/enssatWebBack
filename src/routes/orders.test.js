import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import { createOrdersRouter } from './orders.js';

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

function createConnectionMock({ queryHandlers = [], executeHandlers = [] } = {}) {
	const calls = {
		beginTransaction: 0,
		commit: 0,
		rollback: 0,
		release: 0,
		query: [],
		execute: []
	};

	const connection = {
		async beginTransaction() {
			calls.beginTransaction += 1;
		},
		async commit() {
			calls.commit += 1;
		},
		async rollback() {
			calls.rollback += 1;
		},
		release() {
			calls.release += 1;
		},
		async query(sql, params) {
			calls.query.push({ sql, params });
			const handler = queryHandlers.shift();
			if (!handler) throw new Error(`unexpected query: ${sql}`);
			return handler(sql, params);
		},
		async execute(sql, params) {
			calls.execute.push({ sql, params });
			const handler = executeHandlers.shift();
			if (!handler) throw new Error(`unexpected execute: ${sql}`);
			return handler(sql, params);
		}
	};

	return { calls, connection };
}

function createDb(connection) {
	return {
		async getConnection() {
			return connection;
		}
	};
}

function createRouter({ authClient, db, profile = particulierProfile() }) {
	return createOrdersRouter({
		authClient,
		db,
		getProfileByAuthUserId: async () => profile,
		headersFromNode: (headers) => headers
	});
}

test('POST /checkout returns 401 without a session', async () => {
	const db = {
		async getConnection() {
			throw new Error('database should not be called');
		}
	};
	const router = createRouter({ authClient: createAuthClient(null), db });

	const response = await dispatch(router, {
		method: 'POST',
		url: '/checkout'
	});

	assert.equal(response.statusCode, 401);
	assert.equal(response.body.error, 'Non authentifie.');
});

test('POST /checkout returns 409 for an empty cart', async () => {
	const { calls, connection } = createConnectionMock({
		queryHandlers: [
			async () => [[{ idPanier: 5, idParticulier: 10 }]],
			async () => [[]]
		]
	});
	const router = createRouter({
		authClient: createAuthClient({ user: { id: 'auth-user-1' } }),
		db: createDb(connection)
	});

	const response = await dispatch(router, {
		method: 'POST',
		url: '/checkout',
		body: { modeLivraison: 'domicile' }
	});

	assert.equal(response.statusCode, 409);
	assert.equal(response.body.error, 'Le panier est vide.');
	assert.equal(calls.beginTransaction, 1);
	assert.equal(calls.commit, 0);
	assert.equal(calls.rollback, 1);
	assert.equal(calls.release, 1);
});

test('POST /checkout returns 409 when stock is insufficient', async () => {
	const { calls, connection } = createConnectionMock({
		queryHandlers: [
			async () => [[{ idPanier: 5, idParticulier: 10 }]],
			async () => [[{
				idPanier: 5,
				idProduit: 7,
				quantite: 3,
				nom: 'Pain complet',
				prix: 2.5,
				tva: 5.5,
				reductionProfessionnel: 0,
				stock: 2,
				unitaireOuKilo: 1,
				visible: 1
			}]]
		]
	});
	const router = createRouter({
		authClient: createAuthClient({ user: { id: 'auth-user-1' } }),
		db: createDb(connection)
	});

	const response = await dispatch(router, {
		method: 'POST',
		url: '/checkout'
	});

	assert.equal(response.statusCode, 409);
	assert.equal(response.body.error, 'Stock insuffisant pour le produit 7.');
	assert.equal(calls.commit, 0);
	assert.equal(calls.rollback, 1);
	assert.equal(calls.execute.length, 0);
});

test('POST /checkout creates order lines, updates stock, and empties the cart', async () => {
	const { calls, connection } = createConnectionMock({
		queryHandlers: [
			async () => [[{ idPanier: 5, idParticulier: 10 }]],
			async () => [[
				{
					idPanier: 5,
					idProduit: 6,
					quantite: 2,
					nom: 'Baguette tradition',
					prix: 1.2,
					tva: 5.5,
					reductionProfessionnel: 0,
					stock: 50,
					unitaireOuKilo: 1,
					visible: 1
				},
				{
					idPanier: 5,
					idProduit: 9,
					quantite: 1.5,
					nom: 'Carottes (1 kg)',
					prix: 1.8,
					tva: 5.5,
					reductionProfessionnel: 0,
					stock: 99,
					unitaireOuKilo: 0,
					visible: 1
				}
			]]
		],
		executeHandlers: [
			async (sql, params) => {
				assert.match(sql, /INSERT INTO Commande/);
				assert.deepEqual(params, ['point_relais', 5.38, 10, null]);
				return [{ insertId: 44 }];
			},
			async (sql, params) => {
				assert.match(sql, /INSERT INTO LigneCommande/);
				assert.deepEqual(params, [44, 6, 2, 2.53]);
				return [{ affectedRows: 1 }];
			},
			async (sql, params) => {
				assert.equal(sql, 'UPDATE Produit SET stock = stock - ? WHERE idProduit = ?');
				assert.deepEqual(params, [2, 6]);
				return [{ affectedRows: 1 }];
			},
			async (sql, params) => {
				assert.match(sql, /INSERT INTO LigneCommande/);
				assert.deepEqual(params, [44, 9, 1.5, 2.85]);
				return [{ affectedRows: 1 }];
			},
			async (sql, params) => {
				assert.equal(sql, 'UPDATE Produit SET stock = stock - ? WHERE idProduit = ?');
				assert.deepEqual(params, [1.5, 9]);
				return [{ affectedRows: 1 }];
			},
			async (sql, params) => {
				assert.equal(sql, 'DELETE FROM Panier_Produit WHERE idPanier = ?');
				assert.deepEqual(params, [5]);
				return [{ affectedRows: 2 }];
			}
		]
	});
	const router = createRouter({
		authClient: createAuthClient({ user: { id: 'auth-user-1' } }),
		db: createDb(connection)
	});

	const response = await dispatch(router, {
		method: 'POST',
		url: '/checkout',
		body: { modeLivraison: 'point_relais' }
	});

	assert.equal(response.statusCode, 201);
	assert.deepEqual(response.body.order, {
		idCommande: 44,
		idPanier: 5,
		modeLivraison: 'point_relais',
		totalBeforeVoucher: 5.38,
		prixTotal: 5.38,
		status: 'en_attente'
	});
	assert.equal(response.body.appliedVoucher, null);
	assert.deepEqual(response.body.items, [
		{ idProduit: 6, nom: 'Baguette tradition', quantite: 2, prixTTC: 2.53 },
		{ idProduit: 9, nom: 'Carottes (1 kg)', quantite: 1.5, prixTTC: 2.85 }
	]);
	assert.equal(calls.beginTransaction, 1);
	assert.equal(calls.commit, 1);
	assert.equal(calls.rollback, 0);
	assert.equal(calls.release, 1);
});

test('POST /checkout rejects an expired voucher', async () => {
	const { calls, connection } = createConnectionMock({
		queryHandlers: [
			async () => [[{ idPanier: 5, idParticulier: 10 }]],
			async () => [[{
				idPanier: 5,
				idProduit: 6,
				quantite: 2,
				nom: 'Baguette tradition',
				prix: 1.2,
				tva: 5.5,
				reductionProfessionnel: 0,
				stock: 50,
				unitaireOuKilo: 1,
				visible: 1
			}]],
			async () => [[{
				idBon: 33,
				idParticulier: 10,
				codeBon: 'BON-TEST',
				valeurEuros: 5,
				statut: 'actif',
				dateExpiration: '2000-01-01T00:00:00.000Z'
			}]]
		],
		executeHandlers: [
			async (sql, params) => {
				assert.match(sql, /UPDATE BonAchat SET statut = 'expire'/);
				assert.deepEqual(params, [33]);
				return [{ affectedRows: 1 }];
			}
		]
	});
	const router = createRouter({
		authClient: createAuthClient({ user: { id: 'auth-user-1' } }),
		db: createDb(connection)
	});

	const response = await dispatch(router, {
		method: 'POST',
		url: '/checkout',
		body: { voucherId: 33 }
	});

	assert.equal(response.statusCode, 409);
	assert.equal(response.body.error, 'Ce bon d achat a expire.');
	assert.equal(calls.commit, 0);
	assert.equal(calls.rollback, 1);
	assert.equal(calls.release, 1);
});

test('POST /checkout applies an active voucher during checkout', async () => {
	const { calls, connection } = createConnectionMock({
		queryHandlers: [
			async () => [[{ idPanier: 5, idParticulier: 10 }]],
			async () => [[
				{
					idPanier: 5,
					idProduit: 6,
					quantite: 2,
					nom: 'Baguette tradition',
					prix: 1.2,
					tva: 5.5,
					reductionProfessionnel: 0,
					stock: 50,
					unitaireOuKilo: 1,
					visible: 1
				},
				{
					idPanier: 5,
					idProduit: 9,
					quantite: 1.5,
					nom: 'Carottes (1 kg)',
					prix: 1.8,
					tva: 5.5,
					reductionProfessionnel: 0,
					stock: 99,
					unitaireOuKilo: 0,
					visible: 1
				}
			]],
			async () => [[{
				idBon: 33,
				idParticulier: 10,
				codeBon: 'BON-TEST',
				valeurEuros: 5,
				statut: 'actif',
				dateExpiration: '2999-01-01T00:00:00.000Z'
			}]]
		],
		executeHandlers: [
			async (sql, params) => {
				assert.match(sql, /INSERT INTO Commande/);
				assert.deepEqual(params, ['point_relais', 0.38, 10, null]);
				return [{ insertId: 45 }];
			},
			async (sql, params) => {
				assert.match(sql, /INSERT INTO LigneCommande/);
				assert.deepEqual(params, [45, 6, 2, 2.53]);
				return [{ affectedRows: 1 }];
			},
			async (sql, params) => {
				assert.equal(sql, 'UPDATE Produit SET stock = stock - ? WHERE idProduit = ?');
				assert.deepEqual(params, [2, 6]);
				return [{ affectedRows: 1 }];
			},
			async (sql, params) => {
				assert.match(sql, /INSERT INTO LigneCommande/);
				assert.deepEqual(params, [45, 9, 1.5, 2.85]);
				return [{ affectedRows: 1 }];
			},
			async (sql, params) => {
				assert.equal(sql, 'UPDATE Produit SET stock = stock - ? WHERE idProduit = ?');
				assert.deepEqual(params, [1.5, 9]);
				return [{ affectedRows: 1 }];
			},
			async (sql, params) => {
				assert.match(sql, /UPDATE BonAchat/);
				assert.deepEqual(params, [33]);
				return [{ affectedRows: 1 }];
			},
			async (sql, params) => {
				assert.equal(sql, 'DELETE FROM Panier_Produit WHERE idPanier = ?');
				assert.deepEqual(params, [5]);
				return [{ affectedRows: 2 }];
			}
		]
	});
	const router = createRouter({
		authClient: createAuthClient({ user: { id: 'auth-user-1' } }),
		db: createDb(connection)
	});

	const response = await dispatch(router, {
		method: 'POST',
		url: '/checkout',
		body: { modeLivraison: 'point_relais', voucherId: 33 }
	});

	assert.equal(response.statusCode, 201);
	assert.deepEqual(response.body.order, {
		idCommande: 45,
		idPanier: 5,
		modeLivraison: 'point_relais',
		totalBeforeVoucher: 5.38,
		prixTotal: 0.38,
		status: 'en_attente'
	});
	assert.deepEqual(response.body.appliedVoucher, {
		idBon: 33,
		codeBon: 'BON-TEST',
		valeurEuros: 5
	});
	assert.equal(calls.commit, 1);
	assert.equal(calls.rollback, 0);
});
