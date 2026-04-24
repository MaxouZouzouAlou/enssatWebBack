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

/**
 * @openapi
 * /notifications:
 *   get:
 *     summary: Get all notifications for the authenticated user
 *     tags:
 *       - Notifications
 *     responses:
 *       200:
 *         description: List of notifications
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/', requireAuth, async (req, res) => {
	try {
		const notifications = await getUserNotifications(req.authSession.user.id);
		return res.json({ notifications });
	} catch (error) {
		console.error('notifications GET error:', error);
		return res.status(500).json({ error: 'Erreur serveur.' });
	}
});

/**
 * @openapi
 * /notifications/read-all:
 *   patch:
 *     summary: Mark all notifications as read for the authenticated user
 *     tags:
 *       - Notifications
 *     responses:
 *       200:
 *         description: All notifications marked as read
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.patch('/read-all', requireAuth, async (req, res) => {
	try {
		await markAllNotificationsRead(req.authSession.user.id);
		return res.json({ ok: true });
	} catch (error) {
		console.error('notifications read-all error:', error);
		return res.status(500).json({ error: 'Erreur serveur.' });
	}
});

/**
 * @openapi
 * /notifications/{id}:
 *   delete:
 *     summary: Delete a notification by ID
 *     tags:
 *       - Notifications
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Notification deleted successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.delete('/:id', requireAuth, async (req, res) => {
	try {
		await deleteNotification(req.params.id, req.authSession.user.id);
		return res.json({ ok: true });
	} catch (error) {
		console.error('notifications delete error:', error);
		return res.status(500).json({ error: 'Erreur serveur.' });
	}
});

/**
 * @openapi
 * /notifications/{id}/read:
 *   patch:
 *     summary: Mark a specific notification as read
 *     tags:
 *       - Notifications
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Notification marked as read
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
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