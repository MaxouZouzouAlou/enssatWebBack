import express from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../auth.js';
import {
	deleteNotification,
	getUserNotifications,
	markAllNotificationsRead,
	markNotificationRead,
} from '../services/notifications-service.js';

const router = express.Router();

async function requireAuth(req, res, next) {
	try {
		const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
		if (!session) return res.status(401).json({ error: 'Non authentifié.' });
		req.authSession = session;
		return next();
	} catch {
		return res.status(401).json({ error: 'Non authentifié.' });
	}
}

router.get('/', requireAuth, async (req, res) => {
	try {
		const notifications = await getUserNotifications(req.authSession.user.id);
		return res.json({ notifications });
	} catch (error) {
		console.error('notifications GET error:', error);
		return res.status(500).json({ error: 'Erreur serveur.' });
	}
});

router.patch('/read-all', requireAuth, async (req, res) => {
	try {
		await markAllNotificationsRead(req.authSession.user.id);
		return res.json({ ok: true });
	} catch (error) {
		console.error('notifications read-all error:', error);
		return res.status(500).json({ error: 'Erreur serveur.' });
	}
});

router.delete('/:id', requireAuth, async (req, res) => {
	try {
		await deleteNotification(req.params.id, req.authSession.user.id);
		return res.json({ ok: true });
	} catch (error) {
		console.error('notifications delete error:', error);
		return res.status(500).json({ error: 'Erreur serveur.' });
	}
});

router.patch('/:id/read', requireAuth, async (req, res) => {
	try {
		await markNotificationRead(req.params.id, req.authSession.user.id);
		return res.json({ ok: true });
	} catch (error) {
		console.error('notifications read error:', error);
		return res.status(500).json({ error: 'Erreur serveur.' });
	}
});

export default router;
