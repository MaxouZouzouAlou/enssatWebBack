export class SalesPointValidationError extends Error {
	constructor(message, status = 400) {
		super(message);
		this.name = 'SalesPointValidationError';
		this.status = status;
	}
}

function normalizeAddressPayload(payload) {
	return {
		nom: String(payload?.nom || '').trim(),
		horaires: String(payload?.horaires || '').trim(),
		adresse_ligne: String(payload?.adresse_ligne || '').trim(),
		code_postal: String(payload?.code_postal || '').trim(),
		ville: String(payload?.ville || '').trim()
	};
}

function mapSalesPointRow(row) {
	return {
		idLieu: row.idLieu,
		nom: row.nom,
		horaires: row.horaires,
		adresse: {
			ligne: row.adresse_ligne,
			codePostal: row.code_postal,
			ville: row.ville
		},
		coordinates: row.latitude == null || row.longitude == null
			? null
			: {
				latitude: Number(row.latitude),
				longitude: Number(row.longitude)
			},
		attached: Boolean(row.attached),
		linkedCompaniesCount: row.linkedCompaniesCount != null ? Number(row.linkedCompaniesCount) : undefined
	};
}

export async function getManagedCompany(db, idProfessionnel, idEntreprise) {
	const [rows] = await db.query(
		`SELECT e.idEntreprise, e.nom, e.siret, e.adresse_ligne, e.code_postal, e.ville
		 FROM Professionnel_Entreprise pe
		 INNER JOIN Entreprise e ON e.idEntreprise = pe.idEntreprise
		 WHERE pe.idProfessionnel = ? AND pe.idEntreprise = ?
		 LIMIT 1`,
		[idProfessionnel, idEntreprise]
	);

	if (!rows.length) {
		throw new SalesPointValidationError('Entreprise introuvable pour ce professionnel.', 404);
	}

	return {
		id: rows[0].idEntreprise,
		nom: rows[0].nom,
		siret: rows[0].siret,
		adresse_ligne: rows[0].adresse_ligne,
		code_postal: rows[0].code_postal,
		ville: rows[0].ville
	};
}

export async function listSalesPointsForCompany(db, idEntreprise) {
	const [rows] = await db.query(
		`SELECT
			lv.idLieu,
			lv.nom,
			lv.horaires,
			lv.adresse_ligne,
			lv.code_postal,
			lv.ville,
			lv.latitude,
			lv.longitude,
			MAX(CASE WHEN elv.idEntreprise = ? THEN 1 ELSE 0 END) AS attached,
			COUNT(DISTINCT elv.idEntreprise) AS linkedCompaniesCount
		 FROM LieuVente lv
		 LEFT JOIN Entreprise_LieuVente elv ON elv.idLieu = lv.idLieu
		 GROUP BY lv.idLieu, lv.nom, lv.horaires, lv.adresse_ligne, lv.code_postal, lv.ville, lv.latitude, lv.longitude
		 ORDER BY lv.nom ASC, lv.idLieu ASC`,
		[idEntreprise]
	);

	const mappedRows = rows.map(mapSalesPointRow);

	return {
		currentSalesPoints: mappedRows.filter((row) => row.attached),
		availableSalesPoints: mappedRows.filter((row) => !row.attached)
	};
}

export async function attachExistingSalesPoint(db, idEntreprise, idLieu) {
	const [locationRows] = await db.query(
		`SELECT idLieu, nom, horaires, adresse_ligne, code_postal, ville, latitude, longitude
		 FROM LieuVente
		 WHERE idLieu = ?
		 LIMIT 1`,
		[idLieu]
	);

	if (!locationRows.length) {
		throw new SalesPointValidationError('Point de vente introuvable.', 404);
	}

	await db.query(
		'INSERT IGNORE INTO Entreprise_LieuVente (idEntreprise, idLieu) VALUES (?, ?)',
		[idEntreprise, idLieu]
	);

	return mapSalesPointRow({
		...locationRows[0],
		attached: 1
	});
}

export async function createSalesPointAndAttach(db, idEntreprise, payload, geocodeAddressFn) {
	const normalized = normalizeAddressPayload(payload);
	if (!normalized.nom) {
		throw new SalesPointValidationError('Nom du point de vente requis.');
	}
	if (!normalized.adresse_ligne || !normalized.code_postal || !normalized.ville) {
		throw new SalesPointValidationError('Adresse complete du point de vente requise.');
	}

	const coordinates = await geocodeAddressFn(normalized);
	const conn = await db.getConnection();

	try {
		await conn.beginTransaction();
		const [insertResult] = await conn.execute(
			`INSERT INTO LieuVente (nom, horaires, adresse_ligne, code_postal, ville, latitude, longitude)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`,
			[
				normalized.nom,
				normalized.horaires || null,
				normalized.adresse_ligne,
				normalized.code_postal,
				normalized.ville,
				coordinates.latitude,
				coordinates.longitude
			]
		);
		await conn.execute(
			'INSERT INTO Entreprise_LieuVente (idEntreprise, idLieu) VALUES (?, ?)',
			[idEntreprise, insertResult.insertId]
		);
		await conn.commit();

		return {
			idLieu: insertResult.insertId,
			nom: normalized.nom,
			horaires: normalized.horaires || null,
			adresse: {
				ligne: normalized.adresse_ligne,
				codePostal: normalized.code_postal,
				ville: normalized.ville
			},
			coordinates,
			attached: true
		};
	} catch (error) {
		await conn.rollback();
		throw error;
	} finally {
		conn.release();
	}
}

export async function detachSalesPoint(db, idEntreprise, idLieu) {
	const [result] = await db.query(
		'DELETE FROM Entreprise_LieuVente WHERE idEntreprise = ? AND idLieu = ?',
		[idEntreprise, idLieu]
	);

	if (!result.affectedRows) {
		throw new SalesPointValidationError('Association point de vente introuvable.', 404);
	}
}
