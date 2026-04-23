import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProfessionalSalesPointsRouter } from './professional-sales-points.js';

function createResponse(resolve) {
	return {
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
		},
		send(payload) {
			this.body = payload;
			resolve(this);
		}
	};
}

test('GET company sales points returns current and available locations', async () => {
	const fakeDb = {
		query: async (sql, params = []) => {
			if (sql.includes('FROM Professionnel_Entreprise pe')) {
				return [[{ idEntreprise: 3, nom: 'Primeurs', siret: '123', adresse_ligne: '1 rue', code_postal: '22300', ville: 'Lannion' }]];
			}
			if (sql.includes('FROM LieuVente lv')) {
				return [[
					{ idLieu: 1, nom: 'Halles', horaires: null, adresse_ligne: 'A', code_postal: '22300', ville: 'Lannion', latitude: 48.1, longitude: -3.4, attached: 1, linkedCompaniesCount: 2 },
					{ idLieu: 2, nom: 'Marche', horaires: null, adresse_ligne: 'B', code_postal: '22300', ville: 'Lannion', latitude: 48.2, longitude: -3.5, attached: 0, linkedCompaniesCount: 1 }
				]];
			}
			throw new Error(`unexpected query: ${sql} / ${params.join(',')}`);
		}
	};

	const router = createProfessionalSalesPointsRouter({
		db: fakeDb,
		authClient: {
			api: {
				getSession: async () => ({ user: { id: 'auth-1' } })
			}
		},
		getProfileByAuthUserId: async () => ({
			accountType: 'professionnel',
			professionnel: { id: 9 }
		}),
		headersFromNode: (headers) => headers
	});

	const req = {
		method: 'GET',
		url: '/9/entreprises/3/lieux-vente',
		originalUrl: '/professionnels/9/entreprises/3/lieux-vente',
		headers: {},
		params: { idProfessionnel: '9', idEntreprise: '3' }
	};

	const res = await new Promise((resolve, reject) => {
		router.handle(req, createResponse(resolve), (err) => err ? reject(err) : null);
	});

	assert.equal(res.statusCode, 200);
	assert.equal(res.body.company.id, 3);
	assert.equal(res.body.currentSalesPoints.length, 1);
	assert.equal(res.body.availableSalesPoints.length, 1);
	assert.equal(res.body.currentSalesPoints[0].idLieu, 1);
	assert.equal(res.body.availableSalesPoints[0].idLieu, 2);
});

test('POST company sales point creates and attaches a geocoded location', async () => {
	const executed = [];
	const fakeConnection = {
		beginTransaction: async () => {
			executed.push('begin');
		},
		execute: async (sql, params = []) => {
			executed.push({ sql, params });
			if (sql.startsWith('INSERT INTO LieuVente')) return [{ insertId: 12 }];
			if (sql.startsWith('INSERT INTO Entreprise_LieuVente')) return [{}];
			throw new Error(`unexpected execute: ${sql}`);
		},
		commit: async () => {
			executed.push('commit');
		},
		rollback: async () => {
			executed.push('rollback');
		},
		release: () => {
			executed.push('release');
		}
	};
	const fakeDb = {
		query: async (sql) => {
			if (sql.includes('FROM Professionnel_Entreprise pe')) {
				return [[{ idEntreprise: 4, nom: 'Entreprise test', siret: '123', adresse_ligne: '1 rue', code_postal: '22300', ville: 'Lannion' }]];
			}
			throw new Error(`unexpected query: ${sql}`);
		},
		getConnection: async () => fakeConnection
	};

	const router = createProfessionalSalesPointsRouter({
		db: fakeDb,
		authClient: {
			api: {
				getSession: async () => ({ user: { id: 'auth-1' } })
			}
		},
		getProfileByAuthUserId: async () => ({
			accountType: 'professionnel',
			professionnel: { id: 5 }
		}),
		headersFromNode: (headers) => headers,
		geocodeAddressFn: async () => ({ latitude: 48.7321, longitude: -3.4567 })
	});

	const req = {
		method: 'POST',
		url: '/5/entreprises/4/lieux-vente',
		originalUrl: '/professionnels/5/entreprises/4/lieux-vente',
		headers: {},
		params: { idProfessionnel: '5', idEntreprise: '4' },
		body: {
			nom: 'Nouveau marche',
			horaires: 'Sam 9h-12h',
			adresse_ligne: '10 rue des Tests',
			code_postal: '22300',
			ville: 'Lannion'
		}
	};

	const res = await new Promise((resolve, reject) => {
		router.handle(req, createResponse(resolve), (err) => err ? reject(err) : null);
	});

	assert.equal(res.statusCode, 201);
	assert.equal(res.body.idLieu, 12);
	assert.deepEqual(res.body.coordinates, { latitude: 48.7321, longitude: -3.4567 });
	assert.ok(executed.some((entry) => entry === 'commit'));
});
