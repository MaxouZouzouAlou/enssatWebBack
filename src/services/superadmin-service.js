import pool from '../server_config/db.js';
import {
	ConflictError,
	deleteCompanyById,
	deletePersonalAccountByAuthUserId,
	getBusinessProfileByAuthUserId,
	ValidationError
} from './auth-profile-service.js';

export class SuperAdminError extends Error {
	constructor(status, message) {
		super(message);
		this.name = 'SuperAdminError';
		this.status = status;
	}
}

export function assertSuperAdminSession(session) {
	if (!session?.user) {
		throw new SuperAdminError(401, 'Non authentifié.');
	}

	if (session.user.accountType !== 'superadmin') {
		throw new SuperAdminError(403, 'Compte super administrateur requis.');
	}
}

export async function getAdminOverview() {
	const [[accountRow]] = await pool.execute('SELECT COUNT(*) AS total FROM `user`');
	const [[companyRow]] = await pool.execute('SELECT COUNT(*) AS total FROM Entreprise');
	const [[productRow]] = await pool.execute('SELECT COUNT(*) AS total FROM Produit');

	return {
		accounts: Number(accountRow?.total || 0),
		companies: Number(companyRow?.total || 0),
		products: Number(productRow?.total || 0),
	};
}

export async function listAdminAccounts() {
	const [rows] = await pool.execute(
		`SELECT
			u.id,
			u.email,
			u.name,
			u.firstName,
			u.lastName,
			u.accountType,
			u.role,
			u.emailVerified,
			ap.professionnelId,
			ap.particulierId,
			COUNT(DISTINCT pe.idEntreprise) AS companyCount,
			COUNT(DISTINCT p.idProduit) AS productCount
		 FROM \`user\` u
		 LEFT JOIN AuthProfile ap ON ap.authUserId = u.id
		 LEFT JOIN Professionnel_Entreprise pe ON pe.idProfessionnel = ap.professionnelId
		 LEFT JOIN Produit p ON p.idProfessionnel = ap.professionnelId
		 GROUP BY
			u.id, u.email, u.name, u.firstName, u.lastName, u.accountType, u.role,
			u.emailVerified, ap.professionnelId, ap.particulierId
		 ORDER BY u.createdAt DESC, u.id DESC`
	);

	return rows.map((row) => ({
		id: row.id,
		email: row.email,
		name: row.name,
		firstName: row.firstName,
		lastName: row.lastName,
		accountType: row.accountType,
		role: row.role,
		emailVerified: Boolean(row.emailVerified),
		professionnelId: row.professionnelId,
		particulierId: row.particulierId,
		companyCount: Number(row.companyCount || 0),
		productCount: Number(row.productCount || 0),
	}));
}

export async function listAdminCompanies() {
	const [rows] = await pool.execute(
		`SELECT
			e.idEntreprise AS id,
			e.nom,
			e.siret,
			e.adresse_ligne,
			e.code_postal,
			e.ville,
			COUNT(DISTINCT p.idProduit) AS productCount,
			COUNT(DISTINCT pe.idProfessionnel) AS professionalCount
		 FROM Entreprise e
		 LEFT JOIN Produit p ON p.idEntreprise = e.idEntreprise
		 LEFT JOIN Professionnel_Entreprise pe ON pe.idEntreprise = e.idEntreprise
		 GROUP BY e.idEntreprise, e.nom, e.siret, e.adresse_ligne, e.code_postal, e.ville
		 ORDER BY e.idEntreprise DESC`
	);

	return rows.map((row) => ({
		id: row.id,
		nom: row.nom,
		siret: row.siret,
		adresse_ligne: row.adresse_ligne,
		code_postal: row.code_postal,
		ville: row.ville,
		productCount: Number(row.productCount || 0),
		professionalCount: Number(row.professionalCount || 0),
	}));
}

export async function listAdminProducts() {
	const [rows] = await pool.execute(
		`SELECT
			p.idProduit,
			p.nom,
			p.nature,
			p.prix,
			p.stock,
			p.visible,
			p.bio,
			p.idEntreprise,
			p.idProfessionnel,
			e.nom AS entrepriseNom,
			u.nom AS professionnelNom,
			u.prenom AS professionnelPrenom
		 FROM Produit p
		 LEFT JOIN Entreprise e ON e.idEntreprise = p.idEntreprise
		 LEFT JOIN Professionnel pr ON pr.idProfessionnel = p.idProfessionnel
		 LEFT JOIN Utilisateur u ON u.id = pr.id
		 ORDER BY p.idProduit DESC`
	);

	return rows.map((row) => ({
		idProduit: row.idProduit,
		nom: row.nom,
		nature: row.nature,
		prix: Number(row.prix || 0),
		stock: Number(row.stock || 0),
		visible: Boolean(row.visible),
		bio: Boolean(row.bio),
		idEntreprise: row.idEntreprise,
		idProfessionnel: row.idProfessionnel,
		entrepriseNom: row.entrepriseNom,
		professionnelNom: row.professionnelNom,
		professionnelPrenom: row.professionnelPrenom,
	}));
}

export async function deleteAdminAccount(authUserId, actorAuthUserId = null) {
	const normalizedId = String(authUserId || '').trim();
	if (!normalizedId) {
		throw new ValidationError('Identifiant compte invalide.');
	}

	if (actorAuthUserId && normalizedId === actorAuthUserId) {
		throw new ConflictError('Un superadmin ne peut pas supprimer son propre compte.');
	}

	const [authRows] = await pool.execute(
		'SELECT id, accountType FROM `user` WHERE id = ? LIMIT 1',
		[normalizedId]
	);
	if (!authRows.length) {
		throw new ValidationError('Compte introuvable.');
	}

	if (authRows[0].accountType === 'superadmin') {
		throw new ConflictError('La suppression des comptes superadmin n est pas autorisee via cet espace.');
	}

	const profile = await getBusinessProfileByAuthUserId(normalizedId);
	if (profile?.professionnel?.entreprises?.length) {
		for (const company of profile.professionnel.entreprises) {
			await deleteCompanyById(company.id);
		}
	}

	await deletePersonalAccountByAuthUserId(normalizedId);
	return { deleted: true };
}

export async function deleteAdminCompany(idEntreprise) {
	await deleteCompanyById(idEntreprise);
	return { deleted: true };
}

export async function updateAdminProductVisibility(idProduit, visible) {
	const productId = Number(idProduit);
	if (!Number.isInteger(productId) || productId <= 0) {
		throw new ValidationError('Identifiant produit invalide.');
	}

	const nextVisible = Boolean(visible);
	const [result] = await pool.execute(
		'UPDATE Produit SET visible = ? WHERE idProduit = ?',
		[nextVisible ? 1 : 0, productId]
	);

	if (!result.affectedRows) {
		throw new ValidationError('Produit introuvable.');
	}

	const [rows] = await pool.execute(
		'SELECT idProduit, visible FROM Produit WHERE idProduit = ? LIMIT 1',
		[productId]
	);
	return rows[0];
}

export async function deleteAdminProduct(idProduit) {
	const productId = Number(idProduit);
	if (!Number.isInteger(productId) || productId <= 0) {
		throw new ValidationError('Identifiant produit invalide.');
	}

	const conn = await pool.getConnection();
	try {
		await conn.beginTransaction();

		const [productRows] = await conn.execute(
			'SELECT idProduit FROM Produit WHERE idProduit = ? LIMIT 1',
			[productId]
		);
		if (!productRows.length) {
			throw new ValidationError('Produit introuvable.');
		}

		await conn.execute('DELETE FROM LigneCommande WHERE idProduit = ?', [productId]);
		await conn.execute('DELETE FROM Produit WHERE idProduit = ?', [productId]);

		await conn.commit();
		return { deleted: true };
	} catch (error) {
		await conn.rollback();
		if (error?.code === 'ER_ROW_IS_REFERENCED_2' || error?.errno === 1451) {
			throw new ConflictError('Suppression impossible : le produit est encore reference par des donnees historiques.');
		}
		throw error;
	} finally {
		conn.release();
	}
}
