export class GeocodingError extends Error {
	constructor(message, status = 502) {
		super(message);
		this.name = 'GeocodingError';
		this.status = status;
	}
}

function normalizeText(value) {
	return String(value || '').trim();
}

function buildCombinedAddressLine(address) {
	const adresseLigne = normalizeText(address?.adresse_ligne);
	const codePostal = normalizeText(address?.code_postal);
	const ville = normalizeText(address?.ville);

	if (!adresseLigne || !codePostal || !ville) {
		throw new GeocodingError('Adresse incomplete pour le geocodage.', 400);
	}

	return `${adresseLigne}, ${codePostal} ${ville}, France`;
}

export function buildGeocodingQuery(address) {
	const adresseLigne = normalizeText(address?.adresse_ligne);
	const codePostal = normalizeText(address?.code_postal);
	const ville = normalizeText(address?.ville);

	if (!adresseLigne || !codePostal || !ville) {
		throw new GeocodingError('Adresse incomplete pour le geocodage.', 400);
	}

	return {
		street: adresseLigne,
		postalcode: codePostal,
		city: ville,
		country: 'France',
		format: 'jsonv2',
		addressdetails: '0',
		limit: '1'
	};
}

export function buildGeocodingQueries(address) {
	const strictQuery = buildGeocodingQuery(address);
	const combinedAddress = buildCombinedAddressLine(address);

	return [
		strictQuery,
		{
			q: combinedAddress,
			country: 'France',
			format: 'jsonv2',
			addressdetails: '0',
			limit: '1'
		},
		{
			q: `${normalizeText(address?.adresse_ligne)}, ${normalizeText(address?.ville)}, France`,
			postalcode: normalizeText(address?.code_postal),
			country: 'France',
			format: 'jsonv2',
			addressdetails: '0',
			limit: '1'
		}
	];
}

export async function geocodeAddress(address, { fetchImpl = fetch } = {}) {
	const baseUrl = (process.env.GEOCODER_BASE_URL || 'https://nominatim.openstreetmap.org').replace(/\/$/, '');
	const userAgent = process.env.GEOCODER_USER_AGENT || "LOCAL'ZH/1.0";
	const queries = buildGeocodingQueries(address);
	let lastResponseError = null;

	for (const query of queries) {
		const params = new URLSearchParams(query);
		const response = await fetchImpl(`${baseUrl}/search?${params.toString()}`, {
			headers: {
				Accept: 'application/json',
				'User-Agent': userAgent
			}
		});

		if (!response.ok) {
			lastResponseError = new GeocodingError('Le service de geocodage est indisponible.', 502);
			continue;
		}

		const data = await response.json().catch(() => null);
		const match = Array.isArray(data) ? data[0] : null;
		const latitude = Number(match?.lat);
		const longitude = Number(match?.lon);

		if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
			return {
				latitude: Number(latitude.toFixed(6)),
				longitude: Number(longitude.toFixed(6))
			};
		}
	}

	if (lastResponseError) throw lastResponseError;
	throw new GeocodingError('Impossible de calculer les coordonnees pour cette adresse.', 422);
}
