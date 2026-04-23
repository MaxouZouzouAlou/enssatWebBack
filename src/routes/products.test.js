import assert from 'node:assert/strict';
import { test } from 'node:test';
import productsRouter from './products.js';

async function invokeRouter(router, req) {
	return await new Promise((resolve, reject) => {
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
}

test('GET /products/:idProduit returns the requested product', async () => {
	const calls = [];
	const fakePool = {
		query: async (sql, params = []) => {
			calls.push({ sql, params });
			if (sql.includes('WHERE p.idProduit = ?')) return [[{ idProduit: 4, nom: 'Pommes', visible: 1, entrepriseNom: 'Les fruits de mamie' }]];
			throw new Error(`unexpected query: ${sql}`);
		}
	};

	const router = productsRouter({ db: fakePool });

	const res = await invokeRouter(router, {
		method: 'GET',
		url: '/4',
		originalUrl: '/products/4',
		headers: {},
		params: { idProduit: '4' }
	});

	assert.equal(res.statusCode, 200);
	assert.deepEqual(res.body, { idProduit: 4, nom: 'Pommes', visible: 1, entrepriseNom: 'Les fruits de mamie' });
	assert.equal(calls.length, 1);
	assert.deepEqual(calls[0].params, [4]);
	assert.match(calls[0].sql, /MAX\(COALESCE\(e\.nom, ''\)\) AS entrepriseNom/);
});

test('GET /products/:idProduit returns 404 when the product is missing', async () => {
	const fakePool = {
		query: async () => [[ ]]
	};

	const router = productsRouter({ db: fakePool });

	const res = await invokeRouter(router, {
		method: 'GET',
		url: '/999',
		originalUrl: '/products/999',
		headers: {},
		params: { idProduit: '999' }
	});

	assert.equal(res.statusCode, 404);
	assert.deepEqual(res.body, { error: 'Produit introuvable.' });
});

test('GET /products exposes pagination query parameters in SQL limits', async () => {
	const calls = [];
	const fakePool = {
		query: async (sql, params = []) => {
			calls.push({ sql, params });
			if (sql.includes('SELECT DISTINCT p.nature')) return [[{ nature: 'Fruit' }, { nature: 'Legume' }]];
			if (sql.includes('COUNT(DISTINCT p.idProduit)')) return [[{ total: 12 }]];
			if (sql.includes('LIMIT ? OFFSET ?')) return [[{ idProduit: 4, nom: 'Pommes', visible: 1 }]];
			throw new Error(`unexpected query: ${sql}`);
		}
	};

	const router = productsRouter({ db: fakePool });

	const res = await invokeRouter(router, {
		method: 'GET',
		url: '/?page=2&limit=5',
		originalUrl: '/products/?page=2&limit=5',
		headers: {},
		query: { page: '2', limit: '5' }
	});

	assert.equal(res.statusCode, 200);
	assert.deepEqual(res.body, {
		items: [{ idProduit: 4, nom: 'Pommes', visible: 1 }],
		page: 2,
		limit: 5,
		total: 12,
		totalPages: 3,
		sort: 'alpha_asc',
		sortApplied: 'alpha_asc',
		proximityAvailable: false,
		availableNatures: ['Fruit', 'Legume']
	});
	assert.deepEqual(calls[2].params, [5, 5]);
});

test('GET /products applies search and filter query parameters', async () => {
	const calls = [];
	const fakePool = {
		query: async (sql, params = []) => {
			calls.push({ sql, params });
			if (sql.includes('SELECT DISTINCT p.nature')) return [[{ nature: 'Fruit' }]];
			if (sql.includes('COUNT(DISTINCT p.idProduit)')) return [[{ total: 1 }]];
			if (sql.includes('LIMIT ? OFFSET ?')) return [[{ idProduit: 10, nom: 'Pommes bio', visible: 1 }]];
			throw new Error(`unexpected query: ${sql}`);
		}
	};

	const router = productsRouter({ db: fakePool });

	const res = await invokeRouter(router, {
		method: 'GET',
		url: '/?q=pomme&bio=true&enStock=true&nature=Fruit,Legume&prixMin=2&prixMax=8&sort=stock_desc',
		originalUrl: '/products/?q=pomme&bio=true&enStock=true&nature=Fruit,Legume&prixMin=2&prixMax=8&sort=stock_desc',
		headers: {},
		query: {
			q: 'pomme',
			bio: 'true',
			enStock: 'true',
			nature: 'Fruit,Legume',
			prixMin: '2',
			prixMax: '8',
			sort: 'stock_desc'
		}
	});

	assert.equal(res.statusCode, 200);
	assert.equal(res.body.sortApplied, 'stock_desc');
	assert.deepEqual(calls[1].params, ['%pomme%', '%pomme%', '%pomme%', 'fruit', 'legume', 2, 8]);
	assert.match(calls[1].sql, /p\.bio = TRUE/);
	assert.match(calls[1].sql, /COALESCE\(p\.stock, 0\) > 0/);
	assert.match(calls[2].sql, /ORDER BY COALESCE\(p\.stock, 0\) DESC/);
});

test('GET /products supports popularity sorting based on product ratings', async () => {
	const calls = [];
	const fakePool = {
		query: async (sql, params = []) => {
			calls.push({ sql, params });
			if (sql.includes('SELECT DISTINCT p.nature')) return [[{ nature: 'Fruit' }]];
			if (sql.includes('COUNT(DISTINCT p.idProduit)')) return [[{ total: 2 }]];
			if (sql.includes('LIMIT ? OFFSET ?')) {
				return [[
					{ idProduit: 8, nom: 'Fraises', noteMoyenneProduit: 4.8, nombreAvisProduit: 12, visible: 1 },
					{ idProduit: 2, nom: 'Pommes', noteMoyenneProduit: 4.6, nombreAvisProduit: 30, visible: 1 }
				]];
			}
			throw new Error(`unexpected query: ${sql}`);
		}
	};

	const router = productsRouter({ db: fakePool });

	const res = await invokeRouter(router, {
		method: 'GET',
		url: '/?sort=rating_desc',
		originalUrl: '/products/?sort=rating_desc',
		headers: {},
		query: { sort: 'rating_desc' }
	});

	assert.equal(res.statusCode, 200);
	assert.equal(res.body.sort, 'rating_desc');
	assert.equal(res.body.sortApplied, 'rating_desc');
	assert.match(calls[2].sql, /ORDER BY COALESCE\(vp\.noteMoyenne, 0\) DESC, COALESCE\(vp\.nombreAvis, 0\) DESC/);
});

test('GET /products sorts by seller proximity for logged-in personal accounts', async () => {
	const fakePool = {
		query: async (sql, params = []) => {
			if (sql.includes('SELECT DISTINCT p.nature')) return [[{ nature: 'Fruit' }]];
			if (sql.includes('GROUP BY p.idProduit')) {
				assert.deepEqual(params, []);
				return [[
					{
						idProduit: 1,
						nom: 'Pommes',
						entrepriseAdresseLigne: '1 rue proche',
						entrepriseCodePostal: '22300',
						entrepriseVille: 'Lannion'
					},
					{
						idProduit: 2,
						nom: 'Tomates',
						entrepriseAdresseLigne: '9 rue loin',
						entrepriseCodePostal: '22300',
						entrepriseVille: 'Lannion'
					}
				]];
			}
			throw new Error(`unexpected query: ${sql}`);
		}
	};

	const router = productsRouter({
		db: fakePool,
		getSessionFn: async () => ({ user: { id: 'auth-user' } }),
		getProfileByAuthUserId: async () => ({
			accountType: 'particulier',
			particulier: {
				adresse_ligne: '10 rue perso',
				code_postal: '22300',
				ville: 'Lannion'
			}
		}),
		geocodeAddressFn: async (address) => {
			if (address.adresse_ligne === '10 rue perso') return { latitude: 48.73, longitude: -3.46 };
			if (address.adresse_ligne === '1 rue proche') return { latitude: 48.731, longitude: -3.461 };
			if (address.adresse_ligne === '9 rue loin') return { latitude: 48.79, longitude: -3.4 };
			throw new Error('unexpected address');
		}
	});

	const res = await invokeRouter(router, {
		method: 'GET',
		url: '/',
		originalUrl: '/products/',
		headers: {},
		query: {}
	});

	assert.equal(res.statusCode, 200);
	assert.equal(res.body.sort, 'proximity');
	assert.equal(res.body.sortApplied, 'proximity');
	assert.equal(res.body.proximityAvailable, true);
	assert.deepEqual(res.body.items.map((item) => item.idProduit), [1, 2]);
	assert.equal(typeof res.body.items[0].distanceKm, 'number');
});

test('GET /products falls back to alphabetical sort when proximity is unavailable', async () => {
	const calls = [];
	const fakePool = {
		query: async (sql, params = []) => {
			calls.push({ sql, params });
			if (sql.includes('SELECT DISTINCT p.nature')) return [[{ nature: 'Fruit' }]];
			if (sql.includes('COUNT(DISTINCT p.idProduit)')) return [[{ total: 2 }]];
			if (sql.includes('LIMIT ? OFFSET ?')) {
				return [[
					{ idProduit: 3, nom: 'Abricot', visible: 1 },
					{ idProduit: 4, nom: 'Banane', visible: 1 }
				]];
			}
			throw new Error(`unexpected query: ${sql}`);
		}
	};

	const router = productsRouter({
		db: fakePool,
		getSessionFn: async () => ({ user: { id: 'auth-user' } }),
		getProfileByAuthUserId: async () => ({
			accountType: 'particulier',
			particulier: {
				adresse_ligne: '99 rue introuvable',
				code_postal: '22300',
				ville: 'Lannion'
			}
		}),
		geocodeAddressFn: async () => {
			throw new Error('geocoding down');
		}
	});

	const res = await invokeRouter(router, {
		method: 'GET',
		url: '/',
		originalUrl: '/products/',
		headers: {},
		query: {}
	});

	assert.equal(res.statusCode, 200);
	assert.equal(res.body.sort, 'proximity');
	assert.equal(res.body.sortApplied, 'alpha_asc');
	assert.equal(res.body.proximityAvailable, false);
	assert.match(calls[2].sql, /ORDER BY LOWER\(COALESCE\(p\.nom, ''\)\) ASC/);
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

	const res = await invokeRouter(router, {
		method: 'GET',
		url: '/professionnel/12',
		originalUrl: '/products/professionnel/12',
		headers: {},
		params: { idProfessionnel: '12' }
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

	const res = await invokeRouter(router, {
		method: 'GET',
		url: '/professionnel/2?idEntreprise=8',
		originalUrl: '/products/professionnel/2?idEntreprise=8',
		headers: {},
		params: { idProfessionnel: '2' },
		query: { idEntreprise: '8' }
	});

	assert.equal(res.statusCode, 200);
	assert.deepEqual(res.body, [{ idProduit: 9, idProfessionnel: 2, idEntreprise: 8, nom: 'Confiture' }]);
	assert.equal(calls.length, 1);
	assert.deepEqual(calls[0].params, [2, 8]);
});
