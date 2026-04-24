import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import { createLoyaltyRouter } from './loyalty.js';

function particulierProfile(id = 10) {
	return {
		user: { prenom: 'Ada', nom: 'Lovelace' },
		particulier: { id },
		professionnel: null,
	};
}

function createAuthClient(session) {
	return {
		api: {
			getSession: async () => session,
		},
	};
}

function createRequest(method, url, body) {
	const req = new Readable({
		read() {
			this.push(null);
		},
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
			},
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
		execute: [],
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
		},
	};

	return { calls, connection };
}

function createDb(connection) {
	return {
		async getConnection() {
			return connection;
		},
		query: connection.query.bind(connection),
	};
}

function createRouter({ authClient, db, profile = particulierProfile(), createLoyaltyNotificationFn = async () => {}, createVoucherNotificationFn = async () => {} }) {
	return createLoyaltyRouter({
		authClient,
		db,
		getProfileByAuthUserId: async () => profile,
		headersFromNode: (headers) => headers,
		createLoyaltyNotificationFn,
		createVoucherNotificationFn,
	});
}

test('GET /me exposes challenge verification status from backend rules', async () => {
	const { connection } = createConnectionMock({
		queryHandlers: [
			async (sql) => {
				assert.match(sql, /FROM Particulier/);
				return [[{ idParticulier: 10, pointsFidelite: 42 }]];
			},
			async (sql) => {
				assert.match(sql, /FROM FideliteDefi d/);
				return [[
					{
						idDefi: 1,
						code: 'PREMIERE_COMMANDE',
						titre: 'Premiere commande locale',
						description: 'Valider une premiere commande particulier sur la plateforme.',
						pointsRecompense: 15,
						maxClaims: 1,
						claimsCount: 0,
						canClaim: 1,
					},
					{
						idDefi: 2,
						code: 'AVIS_MULTI_PRODUITS',
						titre: 'Partage gourmand',
						description: 'Laisser plusieurs avis produits apres achat pour enrichir le catalogue.',
						pointsRecompense: 20,
						maxClaims: 2,
						claimsCount: 0,
						canClaim: 1,
					},
				]];
			},
			async (sql) => {
				assert.match(sql, /FROM BonAchat/);
				return [[]];
			},
			async (sql) => {
				assert.match(sql, /FROM Commande/);
				return [[{ total: 1 }]];
			},
			async (sql) => {
				assert.match(sql, /FROM AvisProduit ap/);
				return [[{ total: 2 }]];
			},
		],
	});

	const router = createRouter({
		authClient: createAuthClient({ user: { id: 'auth-user-1' } }),
		db: createDb(connection),
	});

	const response = await dispatch(router, { method: 'GET', url: '/me' });

	assert.equal(response.statusCode, 200);
	assert.equal(response.body.challenges[0].conditionsRemplies, true);
	assert.equal(response.body.challenges[0].progressValue, 1);
	assert.equal(response.body.challenges[1].conditionsRemplies, false);
	assert.equal(response.body.challenges[1].requiredValue, 3);
});

test('POST /challenges/:code/claim rejects a challenge when conditions are not met', async () => {
	const { calls, connection } = createConnectionMock({
		queryHandlers: [
			async (sql) => {
				assert.match(sql, /FROM FideliteDefi/);
				return [[{
					idDefi: 2,
					titre: 'Partage gourmand',
					pointsRecompense: 20,
					maxClaims: 2,
				}]];
			},
			async (sql) => {
				assert.match(sql, /FROM FideliteDefiProgress/);
				return [[{ idProgress: 4, claimsCount: 0 }]];
			},
			async (sql) => {
				assert.match(sql, /FROM AvisProduit ap/);
				return [[{ total: 2 }]];
			},
		],
	});

	const router = createRouter({
		authClient: createAuthClient({ user: { id: 'auth-user-1' } }),
		db: createDb(connection),
	});

	const response = await dispatch(router, { method: 'POST', url: '/challenges/AVIS_MULTI_PRODUITS/claim' });

	assert.equal(response.statusCode, 409);
	assert.equal(response.body.error, 'Les conditions du défi ne sont pas remplies.');
	assert.equal(calls.commit, 0);
	assert.equal(calls.execute.length, 0);
});

test('POST /challenges/:code/claim awards points only when backend conditions are satisfied', async () => {
	const notifications = [];
	const { calls, connection } = createConnectionMock({
		queryHandlers: [
			async (sql) => {
				assert.match(sql, /FROM FideliteDefi/);
				return [[{
					idDefi: 1,
					titre: 'Premiere commande locale',
					pointsRecompense: 15,
					maxClaims: 1,
				}]];
			},
			async (sql) => {
				assert.match(sql, /FROM FideliteDefiProgress/);
				return [[]];
			},
			async (sql) => {
				assert.match(sql, /SELECT COUNT\(\*\) AS total\s+FROM Commande/);
				return [[{ total: 1 }]];
			},
			async (sql) => {
				assert.match(sql, /SELECT pointsFidelite FROM Particulier/);
				return [[{ pointsFidelite: 15 }]];
			},
		],
		executeHandlers: [
			async (sql, params) => {
				assert.match(sql, /INSERT INTO FideliteDefiProgress/);
				assert.deepEqual(params, [10, 1]);
				return [{ affectedRows: 1 }];
			},
			async (sql, params) => {
				assert.match(sql, /UPDATE Particulier SET pointsFidelite = pointsFidelite \+ \?/);
				assert.deepEqual(params, [15, 10]);
				return [{ affectedRows: 1 }];
			},
		],
	});

	const router = createRouter({
		authClient: createAuthClient({ user: { id: 'auth-user-1' } }),
		db: createDb(connection),
		createLoyaltyNotificationFn: async (...args) => {
			notifications.push(args);
		},
	});

	const response = await dispatch(router, { method: 'POST', url: '/challenges/PREMIERE_COMMANDE/claim' });

	assert.equal(response.statusCode, 201);
	assert.equal(response.body.pointsFidelite, 15);
	assert.equal(calls.commit, 1);
	assert.equal(notifications.length, 1);
	assert.deepEqual(notifications[0], ['auth-user-1', 15]);
});
