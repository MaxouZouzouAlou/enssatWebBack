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
			return res.status(401).json({ error: 'Non authentifié.' });
		}

		req.authSession = session;
		req.incidentActor = await resolveIncidentActor(session.user);
		return next();
	} catch (error) {
		return handleIncidentError(error, res, next);
	}
}

/**
 * @openapi
 * /incidents:
 *   get:
 *     summary: List incident tickets for the authenticated actor
 *     tags:
 *       - Incidents
 *     responses:
 *       200:
 *         description: List of tickets and actor permissions
 *       401:
 *         description: Unauthorized
 */
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

/**
 * @openapi
 * /incidents:
 *   post:
 *     summary: Create a new incident ticket
 *     tags:
 *       - Incidents
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sujet:
 *                 type: string
 *               description:
 *                 type: string
 *               idCommande:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Ticket created
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post('/', requireIncidentActor, async (req, res, next) => {
	try {
		const detail = await createIncidentTicket(req.incidentActor, req.body || {});
		return res.status(201).json(detail);
	} catch (error) {
		return handleIncidentError(error, res, next);
	}
});

/**
 * @openapi
 * /incidents/{idTicket}:
 *   get:
 *     summary: Get incident ticket details by ID
 *     tags:
 *       - Incidents
 *     parameters:
 *       - in: path
 *         name: idTicket
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Ticket details retrieved successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Ticket not found
 */
router.get('/:idTicket', requireIncidentActor, async (req, res, next) => {
	try {
		const detail = await getIncidentTicketDetail(req.incidentActor, req.params.idTicket);
		return res.json(detail);
	} catch (error) {
		return handleIncidentError(error, res, next);
	}
});

/**
 * @openapi
 * /incidents/{idTicket}/reponses:
 *   post:
 *     summary: Add a reply to an incident ticket
 *     tags:
 *       - Incidents
 *     parameters:
 *       - in: path
 *         name: idTicket
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               message:
 *                 type: string
 *     responses:
 *       201:
 *         description: Reply added successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Ticket not found
 */
router.post('/:idTicket/reponses', requireIncidentActor, async (req, res, next) => {
	try {
		const detail = await addIncidentReply(req.incidentActor, req.params.idTicket, req.body || {});
		return res.status(201).json(detail);
	} catch (error) {
		return handleIncidentError(error, res, next);
	}
});

/**
 * @openapi
 * /incidents/{idTicket}/status:
 *   patch:
 *     summary: Update the status of an incident ticket
 *     tags:
 *       - Incidents
 *     parameters:
 *       - in: path
 *         name: idTicket
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [ouvert, resolu, ferme]
 *     responses:
 *       200:
 *         description: Status updated successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Ticket not found
 */
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