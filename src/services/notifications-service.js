import pool from '../server_config/db.js';

export async function createWelcomeNotification(userId) {
	await pool.execute(
		'INSERT INTO Notification (userId, type, message, lien) VALUES (?, ?, ?, ?)',
		[userId, 'bienvenue', "Bienvenue sur Local'zh ! Complétez votre profil en ajoutant votre adresse et numéro de téléphone.", '/compte']
	);
}

export async function createOrderNotification(authUserId, idCommande, numeroCommandeUtilisateur = idCommande) {
	await pool.execute(
		'INSERT INTO Notification (userId, type, message, lien) VALUES (?, ?, ?, ?)',
		[authUserId, 'commande', `Votre commande #${numeroCommandeUtilisateur} a bien été confirmée. Merci pour votre achat !`, `/commandes/${idCommande}`]
	);
}

async function getAuthUserIdByEmail(email) {
	const [rows] = await pool.execute('SELECT id FROM `user` WHERE email = ? LIMIT 1', [email]);
	return rows[0]?.id || null;
}

export async function createIncidentReplyNotification(creatorEmail) {
	const userId = await getAuthUserIdByEmail(creatorEmail);
	if (!userId) return;
	await pool.execute(
		'INSERT INTO Notification (userId, type, message, lien) VALUES (?, ?, ?, ?)',
		[userId, 'incident', "Le support a répondu à votre ticket d'incident.", '/tickets-incidents']
	);
}

export async function createIncidentStatusNotification(creatorEmail, status) {
	const userId = await getAuthUserIdByEmail(creatorEmail);
	if (!userId) return;
	const label = status === 'resolved' ? 'résolu' : 'clôturé';
	await pool.execute(
		'INSERT INTO Notification (userId, type, message, lien) VALUES (?, ?, ?, ?)',
		[userId, 'incident', `Votre ticket d'incident a été ${label}.`, '/tickets-incidents']
	);
}

export async function createVoucherNotification(authUserId, valueEuros, codeBon) {
	await pool.execute(
		'INSERT INTO Notification (userId, type, message, lien) VALUES (?, ?, ?, ?)',
		[authUserId, 'fidelite', `Votre bon d'achat de ${valueEuros}€ (code : ${codeBon}) est disponible.`, '/fidelite']
	);
}

export async function createLoyaltyNotification(authUserId, points) {
	await pool.execute(
		'INSERT INTO Notification (userId, type, message, lien) VALUES (?, ?, ?, ?)',
		[authUserId, 'fidelite', `Bravo ! Vous avez gagné ${points} point(s) de fidélité.`, '/fidelite']
	);
}

export async function getUserNotifications(userId) {
	const [rows] = await pool.execute(
		'SELECT id, type, message, lien, lu, createdAt FROM Notification WHERE userId = ? ORDER BY createdAt DESC LIMIT 50',
		[userId]
	);
	return rows;
}

export async function markNotificationRead(id, userId) {
	await pool.execute(
		'UPDATE Notification SET lu = TRUE WHERE id = ? AND userId = ?',
		[id, userId]
	);
}

export async function markAllNotificationsRead(userId) {
	await pool.execute(
		'UPDATE Notification SET lu = TRUE WHERE userId = ?',
		[userId]
	);
}

export async function deleteNotification(id, userId) {
	await pool.execute(
		'DELETE FROM Notification WHERE id = ? AND userId = ?',
		[id, userId]
	);
}
