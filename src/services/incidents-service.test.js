import assert from 'node:assert/strict';
import test from 'node:test';
import pool from '../server_config/db.js';
import { addIncidentReply } from './incidents-service.js';

function createTicketRow() {
	return {
		idTicket: 42,
		titre: 'Incident test',
		description: 'Description incident',
		moduleConcerne: 'commandes',
		severite: 'high',
		statut: 'open',
		dateCreation: new Date('2026-04-24T10:00:00Z'),
		dateModification: new Date('2026-04-24T10:00:00Z'),
		creatorId: 2,
		creatorNom: 'Creator',
		creatorPrenom: 'User',
		creatorEmail: 'creator@example.test',
		creatorType: 'particulier',
		responseCount: 0,
		lastResponseAt: null,
	};
}

test('addIncidentReply uses superAdminId for IncidentTicketReponse insertion', async () => {
	const originalExecute = pool.execute;
	const originalQuery = pool.query;
	const executeCalls = [];

	pool.query = async () => [[]];
	pool.execute = async (sql, params = []) => {
		executeCalls.push({ sql, params });

		if (sql.includes('FROM IncidentTicket ticket')) {
			return [[createTicketRow()]];
		}

		if (sql.includes('INSERT INTO IncidentTicketReponse')) {
			return [{ insertId: 10 }];
		}

		if (sql.includes('FROM IncidentTicketReponse reponse')) {
			return [[{
				idReponse: 10,
				message: 'Reponse test',
				dateCreation: new Date('2026-04-24T11:00:00Z'),
				authorId: 9,
				authorNom: 'Admin',
				authorPrenom: 'Super',
				authorEmail: 'superadmin@example.test',
			}]];
		}

		if (sql.includes('FROM IncidentTicketHistorique historique')) {
			return [[{
				idHistorique: 1,
				ancienStatut: null,
				nouveauStatut: 'open',
				commentaire: 'Ticket cree',
				dateAction: new Date('2026-04-24T10:00:00Z'),
				actorId: 9,
				actorNom: 'Admin',
				actorPrenom: 'Super',
				actorEmail: 'superadmin@example.test',
				actorType: 'superadmin',
			}]];
		}

		throw new Error(`Unexpected SQL in test: ${sql}`);
	};

	try {
		const detail = await addIncidentReply(
			{
				id: 9,
				typeUtilisateur: 'superadmin',
				nom: 'Admin',
				prenom: 'Super',
				email: 'superadmin@example.test',
				isAdmin: true,
				isSuperAdmin: true,
				superAdminId: 1,
			},
			42,
			{ message: 'Reponse test' }
		);

		const insertCall = executeCalls.find((call) => call.sql.includes('INSERT INTO IncidentTicketReponse'));
		assert.ok(insertCall, 'Expected INSERT INTO IncidentTicketReponse call');
		assert.deepEqual(insertCall.params, [42, 1, 'Reponse test']);
		assert.equal(detail.ticket.id, 42);
	} finally {
		pool.execute = originalExecute;
		pool.query = originalQuery;
	}
});

test('addIncidentReply rejects invalid super admin identity', async () => {
	await assert.rejects(
		() => addIncidentReply(
			{
				id: 9,
				typeUtilisateur: 'superadmin',
				nom: 'Admin',
				prenom: 'Super',
				email: 'superadmin@example.test',
				isAdmin: true,
				isSuperAdmin: true,
				superAdminId: null,
			},
			42,
			{ message: 'Reponse test' }
		),
		(error) => {
			assert.equal(error?.status, 403);
			assert.equal(error?.message, 'Identite super administrateur invalide.');
			return true;
		}
	);
});
