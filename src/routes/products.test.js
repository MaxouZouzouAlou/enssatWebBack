import assert from 'node:assert/strict';
import { test } from 'node:test';
import productsRouter from './products.js';

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
