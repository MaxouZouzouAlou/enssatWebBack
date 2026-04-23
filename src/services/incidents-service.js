import pool from '../server_config/db.js';
import {
	sendIncidentCreatedEmail,
	sendIncidentReplyEmail,
	sendIncidentStatusEmail
} from './email-service.js';
import { createIncidentReplyNotification, createIncidentStatusNotification } from './notifications-service.js';

const SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);
const STATUSES = new Set(['open', 'in_progress', 'resolved', 'closed']);

export class IncidentError extends Error {
	constructor(status, message, details = {}) {
		super(message);
		this.name = 'IncidentError';
		this.status = status;
		this.details = details;
	}
}

const trim = (value) => String(value || '').trim();

export async function resolveIncidentActor(authUser) {
	const email = trim(authUser?.email).toLowerCase();
	if (!email) {
		throw new IncidentError(403, 'Utilisateur metier introuvable.');
	}

	const [rows] = await pool.execute(
		`SELECT
			u.id,
			u.type_utilisateur AS typeUtilisateur,
			u.nom,
			u.prenom,
			u.email,
			u.idAdmin AS adminId,
			superAdmin.idAdmin AS superAdminId
		 FROM Utilisateur u
		 LEFT JOIN SuperAdmin superAdmin ON superAdmin.idAdmin = u.idAdmin
		 WHERE LOWER(u.email) = ?
		 LIMIT 1`,
		[email]
	);

	if (!rows.length) {
		throw new IncidentError(403, 'Utilisateur metier introuvable.');
	}

	const row = rows[0];
	return {
		id: row.id,
		typeUtilisateur: row.typeUtilisateur,
		nom: row.nom,
		prenom: row.prenom,
		email: row.email,
		isAdmin: Boolean(row.adminId),
		isSuperAdmin: Boolean(row.superAdminId)
	};
}

export async function listIncidentTickets(actor) {
	const params = [];
	let where = '';
	if (!actor.isSuperAdmin) {
		where = 'WHERE ticket.idUtilisateurCreateur = ?';
		params.push(actor.id);
	}

	const [rows] = await pool.execute(
		`SELECT
			ticket.idTicket,
			ticket.titre,
			ticket.description,
			ticket.moduleConcerne,
			ticket.severite,
			ticket.statut,
			ticket.dateCreation,
			ticket.dateModification,
			creator.id AS creatorId,
			creator.nom AS creatorNom,
			creator.prenom AS creatorPrenom,
			creator.email AS creatorEmail,
			creator.type_utilisateur AS creatorType,
			(SELECT COUNT(*) FROM IncidentTicketReponse r WHERE r.idTicket = ticket.idTicket) AS responseCount,
			(SELECT MAX(r.dateCreation) FROM IncidentTicketReponse r WHERE r.idTicket = ticket.idTicket) AS lastResponseAt
		 FROM IncidentTicket ticket
		 JOIN Utilisateur creator ON creator.id = ticket.idUtilisateurCreateur
		 ${where}
		 ORDER BY ticket.dateModification DESC, ticket.dateCreation DESC`,
		params
	);

	return rows.map(mapTicketRow);
}

export async function getIncidentTicketDetail(actor, idTicket) {
	const ticket = await getTicketForActor(actor, idTicket);
	const [responseRows] = await pool.execute(
		`SELECT
			reponse.idReponse,
			reponse.message,
			reponse.dateCreation,
			superAdminUser.id AS authorId,
			superAdminUser.nom AS authorNom,
			superAdminUser.prenom AS authorPrenom,
			superAdminUser.email AS authorEmail
		 FROM IncidentTicketReponse reponse
		 JOIN SuperAdmin superAdmin ON superAdmin.idAdmin = reponse.idSuperAdmin
		 JOIN Utilisateur superAdminUser ON superAdminUser.id = superAdmin.idAdmin
		 WHERE reponse.idTicket = ?
		 ORDER BY reponse.dateCreation ASC, reponse.idReponse ASC`,
		[idTicket]
	);
	const [historyRows] = await pool.execute(
		`SELECT
			historique.idHistorique,
			historique.ancienStatut,
			historique.nouveauStatut,
			historique.commentaire,
			historique.dateAction,
			actorUser.id AS actorId,
			actorUser.nom AS actorNom,
			actorUser.prenom AS actorPrenom,
			actorUser.email AS actorEmail,
			actorUser.type_utilisateur AS actorType
		 FROM IncidentTicketHistorique historique
		 JOIN Utilisateur actorUser ON actorUser.id = historique.idUtilisateurAction
		 WHERE historique.idTicket = ?
		 ORDER BY historique.dateAction ASC, historique.idHistorique ASC`,
		[idTicket]
	);

	return {
		ticket,
		responses: responseRows.map(mapResponseRow),
		history: historyRows.map(mapHistoryRow),
		permissions: getPermissions(actor)
	};
}

export async function createIncidentTicket(actor, payload) {
	const data = validateCreatePayload(payload);
	const conn = await pool.getConnection();

	try {
		await conn.beginTransaction();
		const [result] = await conn.execute(
			`INSERT INTO IncidentTicket
			 (idUtilisateurCreateur, titre, description, moduleConcerne, severite, statut)
			 VALUES (?, ?, ?, ?, ?, 'open')`,
			[actor.id, data.title, data.description, data.moduleConcerne, data.severity]
		);
		const idTicket = result.insertId;
		await conn.execute(
			`INSERT INTO IncidentTicketHistorique
			 (idTicket, ancienStatut, nouveauStatut, idUtilisateurAction, commentaire)
			 VALUES (?, NULL, 'open', ?, ?)`,
			[idTicket, actor.id, 'Ticket cree']
		);
		await conn.commit();

		const detail = await getIncidentTicketDetail(actor, idTicket);
		void notifyIncidentCreated(detail.ticket, actor);
		return detail;
	} catch (error) {
		await conn.rollback();
		throw error;
	} finally {
		conn.release();
	}
}

export async function addIncidentReply(actor, idTicket, payload) {
	assertSuperAdmin(actor);
	const message = validateMessage(payload?.message);
	const ticket = await getTicketForActor(actor, idTicket);

	await pool.execute(
		`INSERT INTO IncidentTicketReponse
		 (idTicket, idSuperAdmin, message)
		 VALUES (?, ?, ?)`,
		[idTicket, actor.id, message]
	);

	const detail = await getIncidentTicketDetail(actor, idTicket);
	void notifyIncidentReply(ticket, actor);
	void createIncidentReplyNotification(ticket.creator.email).catch(() => {});
	return detail;
}

export async function updateIncidentStatus(actor, idTicket, payload) {
	assertSuperAdmin(actor);
	const nextStatus = validateStatus(payload?.status);
	const commentaire = optionalText(payload?.commentaire, 500);
	const ticket = await getTicketForActor(actor, idTicket);

	if (ticket.status === nextStatus) {
		throw new IncidentError(400, 'Le ticket possède déjà ce statut.');
	}

	const conn = await pool.getConnection();
	try {
		await conn.beginTransaction();
		await conn.execute(
			`UPDATE IncidentTicket
			 SET statut = ?
			 WHERE idTicket = ?`,
			[nextStatus, idTicket]
		);
		await conn.execute(
			`INSERT INTO IncidentTicketHistorique
			 (idTicket, ancienStatut, nouveauStatut, idUtilisateurAction, commentaire)
			 VALUES (?, ?, ?, ?, ?)`,
			[idTicket, ticket.status, nextStatus, actor.id, commentaire || null]
		);
		await conn.commit();

		const detail = await getIncidentTicketDetail(actor, idTicket);
		void notifyIncidentStatus(detail.ticket, actor, ticket.status);
		if (nextStatus === 'resolved' || nextStatus === 'closed') {
			void createIncidentStatusNotification(ticket.creator.email, nextStatus).catch(() => {});
		}
		return detail;
	} catch (error) {
		await conn.rollback();
		throw error;
	} finally {
		conn.release();
	}
}

export function getPermissions(actor) {
	return {
		canManageTickets: Boolean(actor?.isSuperAdmin),
		canReply: Boolean(actor?.isSuperAdmin),
		canChangeStatus: Boolean(actor?.isSuperAdmin)
	};
}

async function getTicketForActor(actor, idTicket) {
	const numericId = Number(idTicket);
	if (!Number.isInteger(numericId) || numericId <= 0) {
		throw new IncidentError(400, 'Identifiant de ticket invalide.');
	}

	const params = [numericId];
	let scope = '';
	if (!actor.isSuperAdmin) {
		scope = 'AND ticket.idUtilisateurCreateur = ?';
		params.push(actor.id);
	}

	const [rows] = await pool.execute(
		`SELECT
			ticket.idTicket,
			ticket.titre,
			ticket.description,
			ticket.moduleConcerne,
			ticket.severite,
			ticket.statut,
			ticket.dateCreation,
			ticket.dateModification,
			creator.id AS creatorId,
			creator.nom AS creatorNom,
			creator.prenom AS creatorPrenom,
			creator.email AS creatorEmail,
			creator.type_utilisateur AS creatorType,
			(SELECT COUNT(*) FROM IncidentTicketReponse r WHERE r.idTicket = ticket.idTicket) AS responseCount,
			(SELECT MAX(r.dateCreation) FROM IncidentTicketReponse r WHERE r.idTicket = ticket.idTicket) AS lastResponseAt
		 FROM IncidentTicket ticket
		 JOIN Utilisateur creator ON creator.id = ticket.idUtilisateurCreateur
		 WHERE ticket.idTicket = ? ${scope}
		 LIMIT 1`,
		params
	);

	if (!rows.length) {
		throw new IncidentError(404, 'Ticket introuvable.');
	}

	return mapTicketRow(rows[0]);
}

function validateCreatePayload(payload = {}) {
	const title = requiredText(payload.title || payload.titre, 3, 255, 'Titre invalide.');
	const description = requiredText(payload.description, 10, 5000, 'Description invalide.');
	const moduleConcerne = requiredText(
		payload.moduleConcerne || payload.area || payload.zone,
		2,
		100,
		'Module concerne invalide.'
	);
	const severity = trim(payload.severity || payload.severite || 'medium');
	if (!SEVERITIES.has(severity)) {
		throw new IncidentError(400, 'Severite invalide.');
	}

	return {
		description,
		moduleConcerne,
		severity,
		title
	};
}

function validateMessage(value) {
	return requiredText(value, 1, 5000, 'Message invalide.');
}

function validateStatus(value) {
	const status = trim(value);
	if (!STATUSES.has(status)) {
		throw new IncidentError(400, 'Statut invalide.');
	}
	return status;
}

function requiredText(value, min, max, message) {
	const normalized = trim(value);
	if (normalized.length < min || normalized.length > max) {
		throw new IncidentError(400, message);
	}
	return normalized;
}

function optionalText(value, max) {
	const normalized = trim(value);
	if (!normalized) return '';
	if (normalized.length > max) {
		throw new IncidentError(400, 'Commentaire trop long.');
	}
	return normalized;
}

function assertSuperAdmin(actor) {
	if (!actor.isSuperAdmin) {
		throw new IncidentError(403, 'Compte super administrateur requis.');
	}
}

function mapTicketRow(row) {
	return {
		id: row.idTicket,
		title: row.titre,
		description: row.description,
		moduleConcerne: row.moduleConcerne,
		severity: row.severite,
		status: row.statut,
		createdAt: row.dateCreation,
		updatedAt: row.dateModification,
		responseCount: Number(row.responseCount || 0),
		lastResponseAt: row.lastResponseAt || null,
		creator: {
			id: row.creatorId,
			nom: row.creatorNom,
			prenom: row.creatorPrenom,
			email: row.creatorEmail,
			typeUtilisateur: row.creatorType
		}
	};
}

function mapResponseRow(row) {
	return {
		id: row.idReponse,
		message: row.message,
		createdAt: row.dateCreation,
		author: {
			id: row.authorId,
			nom: row.authorNom,
			prenom: row.authorPrenom,
			email: row.authorEmail,
			typeUtilisateur: 'superadmin'
		}
	};
}

function mapHistoryRow(row) {
	return {
		id: row.idHistorique,
		previousStatus: row.ancienStatut,
		nextStatus: row.nouveauStatut,
		commentaire: row.commentaire,
		createdAt: row.dateAction,
		actor: {
			id: row.actorId,
			nom: row.actorNom,
			prenom: row.actorPrenom,
			email: row.actorEmail,
			typeUtilisateur: row.actorType
		}
	};
}

async function notifyIncidentCreated(ticket, creator) {
	try {
		const recipients = await getSuperAdminEmails();
		await sendIncidentCreatedEmail({ creator, recipients, ticket });
	} catch (error) {
		console.error('Incident email error:', error.message);
	}
}

async function notifyIncidentReply(ticket, responder) {
	try {
		await sendIncidentReplyEmail({
			recipient: ticket.creator,
			responder,
			ticket
		});
	} catch (error) {
		console.error('Incident reply email error:', error.message);
	}
}

async function notifyIncidentStatus(ticket, actor, previousStatus) {
	try {
		await sendIncidentStatusEmail({
			actor,
			recipient: ticket.creator,
			ticket,
			previousStatus
		});
	} catch (error) {
		console.error('Incident status email error:', error.message);
	}
}

async function getSuperAdminEmails() {
	const [rows] = await pool.execute(
		`SELECT u.email
		 FROM SuperAdmin superAdmin
		 JOIN Utilisateur u ON u.id = superAdmin.idAdmin
		 WHERE u.email IS NOT NULL AND u.email <> ''`
	);
	return rows.map((row) => row.email);
}
