import express from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../auth.js';
import {
	addIncidentReply,
	createIncidentTicket,
	getIncidentTicketDetail,
	getPermissions,
	IncidentError,
	listIncidentTickets,
	resolveIncidentActor,
	updateIncidentStatus
} from '../services/incidents-service.js';

const router = express.Router();

async function requireIncidentActor(req, res, next) {
	try {
		const session = await auth.api.getSession({
			headers: fromNodeHeaders(req.headers)
		});

		if (!session) {
			return res.status(401).json({ error: 'Non authentifie.' });
		}

		req.authSession = session;
		req.incidentActor = await resolveIncidentActor(session.user);
		return next();
	} catch (error) {
		return handleIncidentError(error, res, next);
	}
}

router.get('/', requireIncidentActor, async (req, res, next) => {
	try {
		const tickets = await listIncidentTickets(req.incidentActor);
		return res.json({
			permissions: getPermissions(req.incidentActor),
			tickets
		});
	} catch (error) {
		return handleIncidentError(error, res, next);
	}
});

router.post('/', requireIncidentActor, async (req, res, next) => {
	try {
		const detail = await createIncidentTicket(req.incidentActor, req.body || {});
		return res.status(201).json(detail);
	} catch (error) {
		return handleIncidentError(error, res, next);
	}
});

router.get('/:idTicket', requireIncidentActor, async (req, res, next) => {
	try {
		const detail = await getIncidentTicketDetail(req.incidentActor, req.params.idTicket);
		return res.json(detail);
	} catch (error) {
		return handleIncidentError(error, res, next);
	}
});

router.post('/:idTicket/reponses', requireIncidentActor, async (req, res, next) => {
	try {
		const detail = await addIncidentReply(req.incidentActor, req.params.idTicket, req.body || {});
		return res.status(201).json(detail);
	} catch (error) {
		return handleIncidentError(error, res, next);
	}
});

router.patch('/:idTicket/status', requireIncidentActor, async (req, res, next) => {
	try {
		const detail = await updateIncidentStatus(req.incidentActor, req.params.idTicket, req.body || {});
		return res.json(detail);
	} catch (error) {
		return handleIncidentError(error, res, next);
	}
});

function handleIncidentError(error, res, next) {
	if (error instanceof IncidentError) {
		return res.status(error.status).json({ error: error.message, details: error.details });
	}
	return next(error);
}

export default router;
