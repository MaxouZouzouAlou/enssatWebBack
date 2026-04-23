import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import { createOrdersRouter } from './orders.js';

function particulierProfile(id = 10) {
	return {
		user: { prenom: 'Ada', nom: 'Lovelace' },
		particulier: {
			id,
			adresse_ligne: '12 rue des Tests',
			code_postal: '22300',
			ville: 'Lannion'
		},
		client: {
			id,
			adresse_ligne: '12 rue des Tests',
			code_postal: '22300',
			ville: 'Lannion'
		},
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
		},
		query: connection.query?.bind(connection)
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

test('GET /checkout/context returns guided checkout data', async () => {
	const fakeDb = {
		async getConnection() {
			return {
				async query(sql, params) {
					if (/FROM Panier\s/i.test(sql)) return [[{ idPanier: 5, idParticulier: 10 }]];
					if (sql.includes('JOIN LieuVente')) {
						return [[{
							idProduit: 6,
							idLieu: 3,
							nom: 'Les Halles de Lannion',
							horaires: '8h-13h',
							adresse_ligne: 'Place du Miroir',
							code_postal: '22300',
							ville: 'Lannion',
							latitude: 48.73,
							longitude: -3.45
						}]];
					}
					if (sql.includes('FROM Panier_Produit pp')) {
						return [[{
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
						}]];
					}
					if (sql.includes('FROM PointRelais')) {
						return [[{
							idRelais: 2,
							nom: 'Carrefour City',
							adresse_ligne: '8 rue des Augustins',
							code_postal: '22300',
							ville: 'Lannion'
						}]];
					}
					throw new Error(`unexpected query: ${sql}`);
				},
				release() {}
			};
		}
	};

	const router = createRouter({
		authClient: createAuthClient({ user: { id: 'auth-user-1' } }),
		db: fakeDb
	});

	const response = await dispatch(router, {
		method: 'GET',
		url: '/checkout/context'
	});

	assert.equal(response.statusCode, 200);
	assert.equal(response.body.cart.idPanier, 5);
	assert.equal(response.body.relayOptions.length, 1);
	assert.equal(response.body.items.length, 1);
	assert.equal(response.body.pickup.defaultAssignments.length, 1);
});

test('POST /checkout/preview returns a priced relay checkout preview', async () => {
	const fakeDb = {
		async getConnection() {
			return {
				async query(sql) {
					if (/FROM Panier\s/i.test(sql)) return [[{ idPanier: 5, idParticulier: 10 }]];
					if (sql.includes('JOIN LieuVente')) return [[]];
					if (sql.includes('FROM Panier_Produit pp') && sql.includes('JOIN Produit p')) {
						return [[{
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
						}]];
					}
					if (sql.includes('FROM PointRelais')) {
						return [[{
							idRelais: 2,
							nom: 'Carrefour City',
							adresse_ligne: '8 rue des Augustins',
							code_postal: '22300',
							ville: 'Lannion'
						}]];
					}
					throw new Error(`unexpected query: ${sql}`);
				},
				release() {}
			};
		}
	};

	const router = createRouter({
		authClient: createAuthClient({ user: { id: 'auth-user-1' } }),
		db: fakeDb
	});

	const response = await dispatch(router, {
		method: 'POST',
		url: '/checkout/preview',
		body: {
			modeLivraison: 'point_relais',
			modePaiement: 'carte_bancaire',
			relayId: 2
		}
	});

	assert.equal(response.statusCode, 200);
	assert.equal(response.body.modeLivraison, 'point_relais');
	assert.equal(response.body.modePaiement, 'carte_bancaire');
	assert.equal(response.body.fraisLivraison, 3.9);
	assert.equal(response.body.prixTotal, 6.43);
});

test('POST /checkout/preview returns a per-product pickup route', async () => {
	const fakeDb = {
		async getConnection() {
			return {
				async query(sql) {
					if (/FROM Panier\s/i.test(sql)) return [[{ idPanier: 5, idParticulier: 10 }]];
					if (sql.includes('JOIN LieuVente')) {
						return [[
							{
								idProduit: 6,
								idLieu: 3,
								nom: 'Les Halles de Lannion',
								horaires: '8h-13h',
								adresse_ligne: 'Place du Miroir',
								code_postal: '22300',
								ville: 'Lannion',
								latitude: 48.73,
								longitude: -3.45
							},
							{
								idProduit: 7,
								idLieu: 4,
								nom: 'Marché Saint-Marc',
								horaires: null,
								adresse_ligne: '2 rue Saint-Marc',
								code_postal: '22300',
								ville: 'Lannion',
								latitude: 48.72,
								longitude: -3.44
							}
						]];
					}
					if (sql.includes('FROM Panier_Produit pp') && sql.includes('JOIN Produit p')) {
						return [[
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
								idProduit: 7,
								quantite: 1,
								nom: 'Pommes',
								prix: 3,
								tva: 5.5,
								reductionProfessionnel: 0,
								stock: 50,
								unitaireOuKilo: 1,
								visible: 1
							}
						]];
					}
					if (sql.includes('FROM PointRelais')) return [[]];
					throw new Error(`unexpected query: ${sql}`);
				},
				release() {}
			};
		}
	};

	const router = createRouter({
		authClient: createAuthClient({ user: { id: 'auth-user-1' } }),
		db: fakeDb
	});

	const response = await dispatch(router, {
		method: 'POST',
		url: '/checkout/preview',
		body: {
			modeLivraison: 'lieu_vente',
			modePaiement: 'carte_bancaire',
			pickupAssignments: [
				{ idProduit: 6, idLieu: 3 },
				{ idProduit: 7, idLieu: 4 }
			]
		}
	});

	assert.equal(response.statusCode, 200);
	assert.equal(response.body.pickupRoute.stops.length, 2);
	assert.equal(response.body.items[0].selectedLieu.idLieu, 3);
	assert.equal(response.body.items[1].selectedLieu.idLieu, 4);
});

test('GET /orders returns authenticated order history with payment mode', async () => {
	const fakeDb = {
		query: async (sql, params) => {
			assert.match(sql, /FROM Commande c/);
			assert.deepEqual(params, [10]);
			return [[{
				idCommande: 17,
				dateCommande: '2026-04-23 10:00:00',
				modeLivraison: 'point_relais',
				modePaiement: 'carte_bancaire',
				prixTotal: 24.5,
				status: 'en_attente',
				lignesCount: 2,
				quantiteTotale: 3
			}]];
		}
	};

	const router = createRouter({
		authClient: createAuthClient({ user: { id: 'auth-user-1' } }),
		db: fakeDb
	});

	const response = await dispatch(router, {
		method: 'GET',
		url: '/'
	});

	assert.equal(response.statusCode, 200);
	assert.equal(response.body.items[0].modePaiement, 'carte_bancaire');
});

test('GET /orders/:idCommande returns order detail with delivery and pickup assignment', async () => {
	const fakeDb = {
		query: async (sql, params) => {
			if (sql.includes('WHERE c.idCommande = ?')) {
				assert.deepEqual(params, [33, 10]);
				return [[{
					idCommande: 33,
					dateCommande: '2026-04-23 12:00:00',
					modeLivraison: 'lieu_vente',
					modePaiement: 'carte_bancaire',
					prixTotal: 18.75,
					status: 'en_attente'
				}]];
			}

			if (sql.includes('FROM LigneCommande lc')) {
				assert.deepEqual(params, [33]);
				return [[{
					idProduit: 6,
					idLieu: 3,
					quantite: 2,
					prixTTC: 5.06,
					nom: 'Baguette tradition',
					nature: 'Boulangerie',
					unitaireOuKilo: 1,
					imagePath: '/images/produits/baguette.jpg',
					lieuNom: 'Les Halles de Lannion',
					lieuHoraires: '8h-13h',
					lieuAdresseLigne: 'Place du Miroir',
					lieuCodePostal: '22300',
					lieuVille: 'Lannion'
				}]];
			}

			if (sql.includes('FROM Livraison l')) {
				assert.deepEqual(params, [33]);
				return [[{
					idLivraison: 1,
					idLieu: 3,
					modeLivraison: 'lieu_vente',
					adresse: null,
					idRelais: null,
					relaisNom: null,
					relaisAdresseLigne: null,
					relaisCodePostal: null,
					relaisVille: null,
					nom: 'Les Halles de Lannion',
					horaires: '8h-13h',
					adresse_ligne: 'Place du Miroir',
					code_postal: '22300',
					ville: 'Lannion',
					latitude: 48.73,
					longitude: -3.45
				}]];
			}

			throw new Error(`unexpected query: ${sql}`);
		}
	};

	const router = createRouter({
		authClient: createAuthClient({ user: { id: 'auth-user-1' } }),
		db: fakeDb
	});

	const response = await dispatch(router, {
		method: 'GET',
		url: '/33'
	});

	assert.equal(response.statusCode, 200);
	assert.equal(response.body.order.modePaiement, 'carte_bancaire');
	assert.equal(response.body.pickupRoute.stops.length, 1);
	assert.equal(response.body.items[0].selectedLieu.idLieu, 3);
});

test('POST /checkout creates an order with relay delivery and payment mode', async () => {
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
				idRelais: 2,
				nom: 'Carrefour City',
				adresse_ligne: '8 rue des Augustins',
				code_postal: '22300',
				ville: 'Lannion'
			}]],
			async () => [[]],
			async () => [[{ pointsFidelite: 42 }]]
		],
		executeHandlers: [
			async (sql, params) => {
				assert.match(sql, /INSERT INTO Commande/);
				assert.deepEqual(params, ['point_relais', 'carte_bancaire', 6.43, 10, null]);
				return [{ insertId: 44 }];
			},
			async (sql, params) => {
				assert.match(sql, /INSERT INTO LigneCommande/);
				assert.deepEqual(params, [44, 6, 2, 2.53, null]);
				return [{ affectedRows: 1 }];
			},
			async (sql, params) => {
				assert.equal(sql, 'UPDATE Produit SET stock = stock - ? WHERE idProduit = ?');
				assert.deepEqual(params, [2, 6]);
				return [{ affectedRows: 1 }];
			},
			async (sql, params) => {
				assert.match(sql, /INSERT INTO Livraison/);
				assert.deepEqual(params, [44, 10, null, 'point_relais', null, 2, null]);
				return [{ affectedRows: 1 }];
			},
			async (sql, params) => {
				assert.equal(sql, 'UPDATE Particulier SET pointsFidelite = pointsFidelite + ? WHERE idParticulier = ?');
				assert.deepEqual(params, [6, 10]);
				return [{ affectedRows: 1 }];
			},
			async (sql, params) => {
				assert.equal(sql, 'DELETE FROM Panier_Produit WHERE idPanier = ?');
				assert.deepEqual(params, [5]);
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
		body: {
			modeLivraison: 'point_relais',
			modePaiement: 'carte_bancaire',
			relayId: 2
		}
	});

	assert.equal(response.statusCode, 201);
	assert.equal(response.body.order.modePaiement, 'carte_bancaire');
	assert.equal(response.body.order.fraisLivraison, 3.9);
	assert.equal(calls.commit, 1);
	assert.equal(calls.rollback, 0);
});
