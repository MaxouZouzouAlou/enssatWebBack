import assert from 'node:assert/strict';
import { test } from 'node:test';
import productsRouter from './products.js';

test('GET /products/:idProduit returns the requested product', async () => {
	const calls = [];
	const fakePool = {
		query: async (sql, params = []) => {
			calls.push({ sql, params });
			if (sql.includes('WHERE p.idProduit = ?')) return [[{ idProduit: 4, nom: 'Pommes', visible: 1 }]];
			throw new Error(`unexpected query: ${sql}`);
		}
	};

	const router = productsRouter({ db: fakePool });

	const req = {
		method: 'GET',
		url: '/4',
		originalUrl: '/products/4',
		headers: {},
		params: { idProduit: '4' }
	};
	const res = await new Promise((resolve, reject) => {
		const response = {
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
			}
		};
		router.handle(req, response, (err) => err ? reject(err) : resolve(response));
	});

	assert.equal(res.statusCode, 200);
	assert.deepEqual(res.body, { idProduit: 4, nom: 'Pommes', visible: 1 });
	assert.equal(calls.length, 1);
	assert.deepEqual(calls[0].params, [4]);
});

test('GET /products/:idProduit returns 404 when the product is missing', async () => {
	const fakePool = {
		query: async () => [[ ]]
	};

	const router = productsRouter({ db: fakePool });

	const req = {
		method: 'GET',
		url: '/999',
		originalUrl: '/products/999',
		headers: {},
		params: { idProduit: '999' }
	};
	const res = await new Promise((resolve, reject) => {
		const response = {
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
			}
		};
		router.handle(req, response, (err) => err ? reject(err) : resolve(response));
	});

	assert.equal(res.statusCode, 404);
	assert.deepEqual(res.body, { error: 'Produit introuvable.' });
});

test('GET /products exposes pagination query parameters in SQL limits', async () => {
	const calls = [];
	const fakePool = {
		query: async (sql, params = []) => {
			calls.push({ sql, params });
			if (sql.includes('COUNT(*)')) return [[{ total: 12 }]];
			if (sql.includes('LIMIT ? OFFSET ?')) return [[{ idProduit: 4, nom: 'Pommes', visible: 1 }]];
			throw new Error(`unexpected query: ${sql}`);
		}
	};

	const router = productsRouter({ db: fakePool });

	const req = {
		method: 'GET',
		url: '/?page=2&limit=5',
		originalUrl: '/products/?page=2&limit=5',
		headers: {},
		query: { page: '2', limit: '5' }
	};
	const res = await new Promise((resolve, reject) => {
		const response = {
			statusCode: 200,
			headers: {},
			setHeader(name, value) {
				this.headers[name.toLowerCase()] = value;
			},
			getHeader(name) {
				return this.headers[name.toLowerCase()];
			},
			json(payload) {
				this.body = payload;
				resolve(this);
			}
		};
		router.handle(req, response, (err) => err ? reject(err) : resolve(response));
	});

	assert.equal(res.statusCode, 200);
	assert.deepEqual(res.body, {
		items: [{ idProduit: 4, nom: 'Pommes', visible: 1 }],
		page: 2,
		limit: 5,
		total: 12,
		totalPages: 3
	});
	assert.deepEqual(calls[1].params, [5, 5]);
});

test('GET /products/professionnel/:idProfessionnel resolves the professional route before :idProduit', async () => {
	const calls = [];
	const fakePool = {
		query: async (sql, params = []) => {
			calls.push({ sql, params });
			if (sql.includes('WHERE p.idProfessionnel = ?')) {
				return [[{ idProduit: 7, idProfessionnel: 12, nom: 'Tomates' }]];
			}
			throw new Error(`unexpected query: ${sql}`);
		}
	};

	const router = productsRouter({ db: fakePool });

	const req = {
		method: 'GET',
		url: '/professionnel/12',
		originalUrl: '/products/professionnel/12',
		headers: {},
		params: { idProfessionnel: '12' }
	};
	const res = await new Promise((resolve, reject) => {
		const response = {
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
			}
		};
		router.handle(req, response, (err) => err ? reject(err) : resolve(response));
	});

	assert.equal(res.statusCode, 200);
	assert.deepEqual(res.body, [{ idProduit: 7, idProfessionnel: 12, nom: 'Tomates' }]);
	assert.equal(calls.length, 1);
	assert.deepEqual(calls[0].params, [12]);
});

test('GET /products/professionnel/:idProfessionnel can scope the catalog to one company', async () => {
	const calls = [];
	const fakePool = {
		query: async (sql, params = []) => {
			calls.push({ sql, params });
			if (sql.includes('WHERE p.idProfessionnel = ? AND p.idEntreprise = ?')) {
				return [[{ idProduit: 9, idProfessionnel: 2, idEntreprise: 8, nom: 'Confiture' }]];
			}
			throw new Error(`unexpected query: ${sql}`);
		}
	};

	const router = productsRouter({ db: fakePool });

	const req = {
		method: 'GET',
		url: '/professionnel/2?idEntreprise=8',
		originalUrl: '/products/professionnel/2?idEntreprise=8',
		headers: {},
		params: { idProfessionnel: '2' },
		query: { idEntreprise: '8' }
	};
	const res = await new Promise((resolve, reject) => {
		const response = {
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
			}
		};
		router.handle(req, response, (err) => err ? reject(err) : resolve(response));
	});

	assert.equal(res.statusCode, 200);
	assert.deepEqual(res.body, [{ idProduit: 9, idProfessionnel: 2, idEntreprise: 8, nom: 'Confiture' }]);
	assert.equal(calls.length, 1);
	assert.deepEqual(calls[0].params, [2, 8]);
});
