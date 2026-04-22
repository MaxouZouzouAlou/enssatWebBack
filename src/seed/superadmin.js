import { auth } from '../auth.js';
import pool from '../server_config/db.js';

export async function seedSuperAdmin() {
	const email = process.env.SUPER_ADMIN_EMAIL;
	const password = process.env.SUPER_ADMIN_PASSWORD;

	if (!email || !password) {
		console.warn('⚠️  SUPER_ADMIN_EMAIL ou SUPER_ADMIN_PASSWORD non définis, seed superadmin ignoré.');
		return;
	}

	const [[existing]] = await pool.execute(
		'SELECT id FROM `user` WHERE email = ? LIMIT 1',
		[email]
	);
	if (existing) {
		console.log('ℹ️  Super admin déjà présent, seed ignoré.');
		return;
	}

	// Création via Better Auth : gère le hashage du mot de passe et la table `account`
	await auth.api.signUpEmail({
		body: {
			email,
			password,
			name: 'Super Admin',
			accountType: 'superadmin',
			firstName: 'Super',
			lastName: 'Admin'
		}
	});

	const [[authUser]] = await pool.execute(
		'SELECT id FROM `user` WHERE email = ? LIMIT 1',
		[email]
	);

	// Email considéré vérifié d'office + rôle superadmin
	await pool.execute(
		'UPDATE `user` SET emailVerified = TRUE, role = ? WHERE id = ?',
		['superadmin', authUser.id]
	);

	// Entrées métier : Utilisateur → Admin → SuperAdmin (transaction)
	const conn = await pool.getConnection();
	try {
		await conn.beginTransaction();

		const [utilResult] = await conn.execute(
			`INSERT INTO Utilisateur (type_utilisateur, nom, prenom, email)
			 VALUES ('superadmin', 'Admin', 'Super', ?)`,
			[email]
		);
		const utilisateurId = utilResult.insertId;

		await conn.execute('INSERT INTO Admin (idAdmin) VALUES (?)', [utilisateurId]);
		await conn.execute('INSERT INTO SuperAdmin (idAdmin) VALUES (?)', [utilisateurId]);

		await conn.commit();
		console.log(`✅ Super admin créé : ${email}`);
	} catch (err) {
		await conn.rollback();
		// Annuler l'entrée Better Auth si les tables métier échouent
		await pool.execute('DELETE FROM `user` WHERE id = ?', [authUser.id]);
		throw err;
	} finally {
		conn.release();
	}
}
