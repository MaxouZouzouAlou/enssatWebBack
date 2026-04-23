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

export async function geocodeAddress(address, { fetchImpl = fetch } = {}) {
	const baseUrl = (process.env.GEOCODER_BASE_URL || 'https://nominatim.openstreetmap.org').replace(/\/$/, '');
	const userAgent = process.env.GEOCODER_USER_AGENT || "LOCAL'ZH/1.0";
	const params = new URLSearchParams(buildGeocodingQuery(address));
	const response = await fetchImpl(`${baseUrl}/search?${params.toString()}`, {
		headers: {
			Accept: 'application/json',
			'User-Agent': userAgent
		}
	});

	if (!response.ok) {
		throw new GeocodingError('Le service de geocodage est indisponible.', 502);
	}

	const data = await response.json().catch(() => null);
	const match = Array.isArray(data) ? data[0] : null;
	const latitude = Number(match?.lat);
	const longitude = Number(match?.lon);

	if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
		throw new GeocodingError('Impossible de calculer les coordonnees pour cette adresse.', 422);
	}

	return {
		latitude: Number(latitude.toFixed(6)),
		longitude: Number(longitude.toFixed(6))
	};
}
