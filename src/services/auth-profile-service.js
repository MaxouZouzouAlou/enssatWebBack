import pool from '../server_config/db.js';

const ACCOUNT_TYPES = new Set(['particulier', 'professionnel']);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_REGEX = /^[A-Za-zÀ-ÖØ-öø-ÿ' -]{2,100}$/;
const POSTAL_CODE_REGEX = /^\d{5}$/;

export class ValidationError extends Error {
	constructor(message, details = {}) {
		super(message);
		this.name = 'ValidationError';
		this.status = 400;
		this.details = details;
	}
}

export class ConflictError extends Error {
	constructor(message) {
		super(message);
		this.name = 'ConflictError';
		this.status = 409;
	}
}

const trim = (value) => String(value || '').trim();

async function waitForAuthUserExists(authUserId, attempts = 5, delayMs = 100) {
	for (let i = 0; i < attempts; i++) {
		const [rows] = await pool.execute('SELECT id FROM `user` WHERE id = ? LIMIT 1', [authUserId]);
		if (rows.length) return true;
		await new Promise((r) => setTimeout(r, delayMs));
	}
	return false;
}

export function normalizeEmail(email) {
	return trim(email).toLowerCase();
}

export function normalizeAccountType(accountType) {
	const normalized = trim(accountType || 'particulier').toLowerCase();
	if (!ACCOUNT_TYPES.has(normalized)) {
		throw new ValidationError('Type de compte invalide.');
	}
	return normalized;
}

export function validateSiret(siret) {
	const normalized = trim(siret);
	if (!/^\d{14}$/.test(normalized)) {
		throw new ValidationError('Le SIRET doit contenir exactement 14 chiffres.');
	}
	return normalized;
}

function validateName(value, label) {
	if (!NAME_REGEX.test(value)) {
		throw new ValidationError(`${label} invalide.`);
	}
}

function validatePostalCode(codePostal) {
	if (!POSTAL_CODE_REGEX.test(codePostal)) {
		throw new ValidationError('Code postal invalide.');
	}
}

export function validateRegistrationPayload(payload) {
	const accountType = normalizeAccountType(payload.accountType);
	const email = normalizeEmail(payload.email);
	const nom = trim(payload.nom);
	const prenom = trim(payload.prenom);
	const password = String(payload.password || '');

	if (!email || !EMAIL_REGEX.test(email)) {
		throw new ValidationError('Adresse email invalide.');
	}
	validateName(nom, 'Nom');
	validateName(prenom, 'Prenom');
	if (password.length < 8) {
		throw new ValidationError('Le mot de passe doit contenir au moins 8 caracteres.');
	}

	const normalized = {
		accountType,
		email,
		nom,
		prenom,
		password
	};

	if (accountType === 'professionnel') {
		const entreprise = payload.entreprise || {};
		const nomEntreprise = trim(entreprise.nom);
		const siret = validateSiret(entreprise.siret);
		const adresseLigne = trim(entreprise.adresse_ligne);
		const codePostal = trim(entreprise.code_postal);
		const ville = trim(entreprise.ville);
		if (!nomEntreprise) {
			throw new ValidationError("Le nom de l'entreprise est requis.");
		}
		if (!adresseLigne || !codePostal || !ville) {
			throw new ValidationError("L'adresse de l'entreprise est requise.");
		}
		validatePostalCode(codePostal);
		normalized.entreprise = {
			nom: nomEntreprise,
			siret,
			adresse_ligne: adresseLigne,
			code_postal: codePostal,
			ville
		};
	}

	return normalized;
}

export async function assertRegistrationAvailable({ email, accountType, siret }) {
	const [authRows] = await pool.execute('SELECT id FROM `user` WHERE email = ? LIMIT 1', [email]);
	if (authRows.length) {
		throw new ConflictError('Un compte existe deja avec cette adresse email.');
	}

	const [userRows] = await pool.execute('SELECT id FROM Utilisateur WHERE email = ? LIMIT 1', [email]);
	if (userRows.length) {
		throw new ConflictError('Cette adresse email est deja utilisee.');
	}

	if (accountType === 'professionnel') {
		const [siretRows] = await pool.execute(
			'SELECT idProfessionnel FROM Professionnel_Siret WHERE numero_siret = ? LIMIT 1',
			[siret]
		);
		if (siretRows.length) {
			throw new ConflictError('Ce SIRET est deja rattache a un compte professionnel.');
		}
	}
}

export async function ensureBusinessProfile(authUser, options = {}) {
	const accountType = normalizeAccountType(options.accountType || authUser.accountType || 'particulier');
	const email = normalizeEmail(authUser.email);
	const nom = trim(options.nom || authUser.lastName || getLastName(authUser.name));
	const prenom = trim(options.prenom || authUser.firstName || getFirstName(authUser.name));
	const entreprise = options.entreprise || {};

	// Ensure the Better Auth `user` row exists before creating FK referencing records
	const exists = await waitForAuthUserExists(authUser.id);
	if (!exists) {
		throw new ValidationError('Auth user record not found yet. Please retry.');
	}

	const conn = await pool.getConnection();
	try {
		await conn.beginTransaction();

		const [existingRows] = await conn.execute(
			`SELECT authUserId, accountType, particulierId, professionnelId, entrepriseId
			 FROM AuthProfile
			 WHERE authUserId = ?
			 FOR UPDATE`,
			[authUser.id]
		);

		if (existingRows.length) {
			await conn.commit();
			return getBusinessProfileByAuthUserId(authUser.id);
		}

		if (accountType === 'professionnel') {
			await createProfessionalProfile(conn, {
				authUserId: authUser.id,
				email,
				entreprise,
				nom,
				prenom
			});
		} else {
			await createParticulierProfile(conn, {
				authUserId: authUser.id,
				email,
				nom,
				prenom
			});
		}

		await conn.commit();
		return getBusinessProfileByAuthUserId(authUser.id);
	} catch (error) {
		await conn.rollback();
		throw error;
	} finally {
		conn.release();
	}
}

async function createParticulierProfile(conn, { authUserId, email, nom, prenom }) {
	const [userResult] = await conn.execute(
		`INSERT INTO Utilisateur
		 (type_utilisateur, nom, prenom, email, num_telephone, adresse_ligne, code_postal, ville, idAdmin)
		 VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL)`,
		['particulier', nom, prenom, email]
	);
	const utilisateurId = userResult.insertId;
	const [particulierResult] = await conn.execute('INSERT INTO Particulier (id) VALUES (?)', [utilisateurId]);
	await conn.execute(
		`INSERT INTO AuthProfile
		 (authUserId, accountType, particulierId, professionnelId, entrepriseId, createdAt, updatedAt)
		 VALUES (?, 'particulier', ?, NULL, NULL, NOW(), NOW())`,
		[authUserId, particulierResult.insertId]
	);
}

async function createProfessionalProfile(conn, { authUserId, email, entreprise, nom, prenom }) {
	const companyName = trim(entreprise.nom);
	const siret = validateSiret(entreprise.siret);
	if (!companyName) {
		throw new ValidationError("Le nom de l'entreprise est requis.");
	}

	const [userResult] = await conn.execute(
		`INSERT INTO Utilisateur
		 (type_utilisateur, nom, prenom, email, num_telephone, adresse_ligne, code_postal, ville, idAdmin)
		 VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL)`,
		['professionnel', nom, prenom, email]
	);
	const utilisateurId = userResult.insertId;

	const [proResult] = await conn.execute('INSERT INTO Professionnel (id) VALUES (?)', [utilisateurId]);
	const idProfessionnel = proResult.insertId;

	const [existingCompanyRows] = await conn.execute('SELECT idEntreprise FROM Entreprise WHERE siret = ? LIMIT 1', [siret]);
	let entrepriseId = existingCompanyRows[0]?.idEntreprise;
	if (!entrepriseId) {
		const [companyResult] = await conn.execute(
			'INSERT INTO Entreprise (nom, siret, adresse_ligne, code_postal, ville) VALUES (?, ?, ?, ?, ?)',
			[companyName, siret, entreprise.adresse_ligne, entreprise.code_postal, entreprise.ville]
		);
		entrepriseId = companyResult.insertId;
	}

	await conn.execute('INSERT INTO Professionnel_Siret (idProfessionnel, numero_siret) VALUES (?, ?)', [
		idProfessionnel,
		siret
	]);
	await conn.execute('INSERT INTO Professionnel_Entreprise (idProfessionnel, idEntreprise) VALUES (?, ?)', [
		idProfessionnel,
		entrepriseId
	]);
	await conn.execute(
		`INSERT INTO AuthProfile
		 (authUserId, accountType, particulierId, professionnelId, entrepriseId, createdAt, updatedAt)
		 VALUES (?, 'professionnel', NULL, ?, ?, NOW(), NOW())`,
		[authUserId, idProfessionnel, entrepriseId]
	);
}

export async function getBusinessProfileByAuthUserId(authUserId) {
	const [rows] = await pool.execute(
		`SELECT
			ap.authUserId,
			ap.accountType,
			ap.particulierId,
			ap.professionnelId,
			ap.entrepriseId,
			u.email AS authEmail,
			u.name AS authName,
			u.image AS authImage,
			u.emailVerified,
			u.firstName AS authFirstName,
			u.lastName AS authLastName,
			particulierUtilisateur.email AS particulierEmail,
			particulierUtilisateur.nom AS particulierNom,
			particulierUtilisateur.prenom AS particulierPrenom,
			particulier.pointsFidelite AS particulierPointsFidelite,
			particulierUtilisateur.num_telephone AS particulierTelephone,
			particulierUtilisateur.adresse_ligne AS particulierAdresseLigne,
			particulierUtilisateur.code_postal AS particulierCodePostal,
			particulierUtilisateur.ville AS particulierVille,
			proUtilisateur.email AS professionnelEmail,
			proUtilisateur.nom AS professionnelNom,
			proUtilisateur.prenom AS professionnelPrenom,
			proUtilisateur.num_telephone AS professionnelTelephone,
			proUtilisateur.adresse_ligne AS professionnelAdresseLigne,
			proUtilisateur.code_postal AS professionnelCodePostal,
			proUtilisateur.ville AS professionnelVille,
			entreprise.nom AS entrepriseNom,
			entreprise.siret AS entrepriseSiret,
			entreprise.adresse_ligne AS entrepriseAdresseLigne,
			entreprise.code_postal AS entrepriseCodePostal,
			entreprise.ville AS entrepriseVille
		 FROM AuthProfile ap
		 INNER JOIN \`user\` u ON u.id = ap.authUserId
		 LEFT JOIN Particulier particulier ON particulier.idParticulier = ap.particulierId
		 LEFT JOIN Utilisateur particulierUtilisateur ON particulierUtilisateur.id = particulier.id
		 LEFT JOIN Professionnel pro ON pro.idProfessionnel = ap.professionnelId
		 LEFT JOIN Utilisateur proUtilisateur ON proUtilisateur.id = pro.id
		 LEFT JOIN Entreprise entreprise ON entreprise.idEntreprise = ap.entrepriseId
		 WHERE ap.authUserId = ?
		 LIMIT 1`,
		[authUserId]
	);

	if (!rows.length) return null;
	const row = rows[0];

	let professionalCompanies = [];
	if (row.professionnelId) {
		const [companyRows] = await pool.execute(
			`SELECT
				e.idEntreprise AS id,
				e.nom,
				e.siret,
				e.adresse_ligne,
				e.code_postal,
				e.ville
			 FROM Professionnel_Entreprise pe
			 INNER JOIN Entreprise e ON e.idEntreprise = pe.idEntreprise
			 WHERE pe.idProfessionnel = ?
			 ORDER BY e.idEntreprise`,
			[row.professionnelId]
		);

		professionalCompanies = companyRows.map((company) => ({
			id: company.id,
			nom: company.nom,
			siret: company.siret,
			adresse_ligne: company.adresse_ligne,
			code_postal: company.code_postal,
			ville: company.ville
		}));
	}

	const selectedCompany = row.entrepriseId
		? {
			id: row.entrepriseId,
			nom: row.entrepriseNom,
			siret: row.entrepriseSiret,
			adresse_ligne: row.entrepriseAdresseLigne,
			code_postal: row.entrepriseCodePostal,
			ville: row.entrepriseVille
		}
		: (professionalCompanies[0] || null);

	return {
		authUserId: row.authUserId,
		accountType: row.accountType,
		user: {
			email: row.authEmail,
			name: row.authName,
			image: row.authImage,
			emailVerified: Boolean(row.emailVerified),
			nom: row.particulierNom || row.professionnelNom || row.authLastName || null,
			prenom: row.particulierPrenom || row.professionnelPrenom || row.authFirstName || null
		},
		particulier: row.particulierId
			? {
				id: row.particulierId,
				pointsFidelite: Number(row.particulierPointsFidelite || 0),
				email: row.particulierEmail,
				num_telephone: row.particulierTelephone,
				adresse_ligne: row.particulierAdresseLigne,
				code_postal: row.particulierCodePostal,
				ville: row.particulierVille
			}
			: null,
		client: row.particulierId
			? {
				id: row.particulierId,
				pointsFidelite: Number(row.particulierPointsFidelite || 0),
				email: row.particulierEmail,
				num_telephone: row.particulierTelephone,
				adresse_ligne: row.particulierAdresseLigne,
				code_postal: row.particulierCodePostal,
				ville: row.particulierVille
			}
			: null,
		professionnel: row.professionnelId
			? {
				id: row.professionnelId,
				email: row.professionnelEmail,
				nom: row.professionnelNom,
				prenom: row.professionnelPrenom,
				num_telephone: row.professionnelTelephone,
				adresse_ligne: row.professionnelAdresseLigne,
				code_postal: row.professionnelCodePostal,
				ville: row.professionnelVille,
				entreprise: selectedCompany,
				entreprises: professionalCompanies
			}
			: null
	};
}

export async function updatePersonalAddressByAuthUserId(authUserId, payload = {}) {
	const adresseLigne = trim(payload.adresse_ligne);
	const codePostal = trim(payload.code_postal);
	const ville = trim(payload.ville);

	if (!adresseLigne || !codePostal || !ville) {
		throw new ValidationError('Adresse incomplete.');
	}

	validatePostalCode(codePostal);

	const profile = await getBusinessProfileByAuthUserId(authUserId);
	if (!profile?.particulier?.id) {
		throw new ValidationError('Seuls les comptes particuliers peuvent enregistrer une adresse personnelle.');
	}

	await pool.execute(
		`UPDATE Utilisateur u
		 INNER JOIN Particulier p ON p.id = u.id
		 SET u.adresse_ligne = ?, u.code_postal = ?, u.ville = ?
		 WHERE p.idParticulier = ?`,
		[adresseLigne, codePostal, ville, profile.particulier.id]
	);

	return getBusinessProfileByAuthUserId(authUserId);
}

function getFirstName(name) {
	const parts = trim(name).split(/\s+/).filter(Boolean);
	if (!parts.length) return '';
	return parts.slice(0, -1).join(' ') || parts[0];
}

function getLastName(name) {
	const parts = trim(name).split(/\s+/).filter(Boolean);
	if (parts.length <= 1) return '';
	return parts[parts.length - 1];
}
