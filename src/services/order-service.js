import { computeOptimalPickupRoute } from './pickup-route-service.js';

class CheckoutError extends Error {
	constructor(status, message) {
		super(message);
		this.name = 'CheckoutError';
		this.status = status;
	}
}

const DELIVERY_FEES = {
	domicile: 7.9,
	point_relais: 3.9,
	lieu_vente: 0
};

const PAYMENT_MODES = {
	carte_bancaire: 'Carte bancaire',
	paypal: 'PayPal',
	apple_pay: 'Apple Pay'
};

function roundCurrency(value) {
	return Number(Number(value || 0).toFixed(2));
}

function normalizeModeLivraison(value) {
	if (typeof value !== 'string') return null;
	const normalized = value.trim().slice(0, 100);
	return Object.prototype.hasOwnProperty.call(DELIVERY_FEES, normalized) ? normalized : null;
}

function normalizeModePaiement(value) {
	if (typeof value !== 'string') return 'carte_bancaire';
	const normalized = value.trim().slice(0, 100);
	return Object.prototype.hasOwnProperty.call(PAYMENT_MODES, normalized) ? normalized : null;
}

function parseVoucherId(value) {
	if (value == null || value === '') return null;
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parsePositiveInteger(value) {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function computeRewardPoints(totalPaid) {
	const normalizedTotal = Number(totalPaid || 0);
	if (!Number.isFinite(normalizedTotal) || normalizedTotal <= 0) return 0;
	return Math.max(Math.floor(normalizedTotal / 2), 0);
}

function buildOwnerOrderColumns(owner) {
	if (owner.column === 'idParticulier') {
		return { idParticulier: owner.id, idProfessionnel: null };
	}

	if (owner.column === 'idProfessionnel') {
		return { idParticulier: null, idProfessionnel: owner.id };
	}

	throw new CheckoutError(500, 'Type de panier non gere.');
}

async function getOwnerOrderSequenceNumber(conn, owner, idCommande) {
	const ownerColumn = owner?.column;
	if (!ownerColumn || !Number.isInteger(Number(owner.id))) {
		throw new CheckoutError(500, 'Proprietaire de commande invalide.');
	}

	const [rows] = await conn.query(
		`SELECT ranked.numeroCommandeUtilisateur
		 FROM (
		 	SELECT
		 		c.idCommande,
		 		ROW_NUMBER() OVER (
		 			PARTITION BY ${ownerColumn}
		 			ORDER BY c.dateCommande ASC, c.idCommande ASC
		 		) AS numeroCommandeUtilisateur
		 	FROM Commande c
		 	WHERE ${ownerColumn} = ?
		 ) AS ranked
		 WHERE ranked.idCommande = ?
		 LIMIT 1`,
		[owner.id, idCommande]
	);

	return Number(rows[0]?.numeroCommandeUtilisateur || 1);
}

function validateCartLine(item) {
	const quantity = Number(item.quantite || 0);
	const stock = Number(item.stock || 0);
	const isUnitProduct = item.unitaireOuKilo === 1 || item.unitaireOuKilo === true;

	if (!Number.isFinite(quantity) || quantity <= 0) {
		throw new CheckoutError(409, `Quantite invalide pour le produit ${item.idProduit}.`);
	}

	if (isUnitProduct && !Number.isInteger(quantity)) {
		throw new CheckoutError(409, `La quantite du produit ${item.idProduit} doit etre entiere.`);
	}

	if (!item.visible) {
		throw new CheckoutError(409, `Le produit ${item.idProduit} n'est plus disponible.`);
	}

	if (quantity > stock) {
		throw new CheckoutError(409, `Stock insuffisant pour le produit ${item.idProduit}.`);
	}
}

function computeLineTotal(item) {
	const quantity = Number(item.quantite || 0);
	const price = Number(item.prix || 0);
	const vatRate = Number(item.tva || 0) / 100;
	const discountRate = Number(item.reductionProfessionnel || 0) / 100;
	const discountedUnitPrice = price * (1 - discountRate);
	const unitPriceTtc = discountedUnitPrice * (1 + vatRate);
	return roundCurrency(quantity * unitPriceTtc);
}

function normalizePickupAssignments(value) {
	if (Array.isArray(value)) {
		return value
			.map((assignment) => ({
				idProduit: parsePositiveInteger(assignment?.idProduit),
				idLieu: parsePositiveInteger(assignment?.idLieu)
			}))
			.filter((assignment) => assignment.idProduit && assignment.idLieu);
	}

	if (value && typeof value === 'object') {
		return Object.entries(value)
			.map(([idProduit, idLieu]) => ({
				idProduit: parsePositiveInteger(idProduit),
				idLieu: parsePositiveInteger(idLieu)
			}))
			.filter((assignment) => assignment.idProduit && assignment.idLieu);
	}

	return [];
}

function formatAddress(address) {
	if (!address) return null;
	const line = String(address.adresse_ligne || '').trim();
	const postalCode = String(address.code_postal || '').trim();
	const city = String(address.ville || '').trim();
	if (!line || !postalCode || !city) return null;
	return {
		adresse_ligne: line,
		code_postal: postalCode,
		ville: city,
		label: `${line}, ${postalCode} ${city}`
	};
}

function resolveDefaultDeliveryAddress(profile) {
	return formatAddress(profile?.particulier || profile?.client || profile?.professionnel);
}

function mapRelayRow(row) {
	return {
		idRelais: Number(row.idRelais),
		nom: row.nom,
		adresse: {
			ligne: row.adresse_ligne,
			codePostal: row.code_postal,
			ville: row.ville
		}
	};
}

async function enrichRelayWithCoordinates(relay, geocodeAddressFn) {
	if (!relay || typeof geocodeAddressFn !== 'function') return relay;

	try {
		const coordinates = await geocodeAddressFn({
			adresse_ligne: relay.adresse?.ligne,
			code_postal: relay.adresse?.codePostal,
			ville: relay.adresse?.ville
		});

		if (!coordinates) return relay;

		return {
			...relay,
			coordinates
		};
	} catch {
		return relay;
	}
}

function mapSalesPointRow(row) {
	return {
		idLieu: Number(row.idLieu),
		nom: row.nom,
		horaires: row.horaires,
		adresse: {
			ligne: row.adresse_ligne,
			codePostal: row.code_postal,
			ville: row.ville
		},
		coordinates: {
			latitude: Number(row.latitude),
			longitude: Number(row.longitude)
		}
	};
}

function buildAssignmentMap(assignments) {
	return new Map(assignments.map((assignment) => [assignment.idProduit, assignment.idLieu]));
}

async function loadCurrentCartWithItems(conn, owner) {
	const [cartRows] = await conn.query(
		`SELECT *
		 FROM Panier
		 WHERE ${owner.column} = ?
		 LIMIT 1
		 FOR UPDATE`,
		[owner.id]
	);

	const cart = cartRows[0];
	if (!cart) {
		throw new CheckoutError(409, 'Aucun panier a valider.');
	}

	const [itemRows] = await conn.query(
		`SELECT
			pp.idPanier,
			pp.idProduit,
			pp.quantite,
			p.nom,
			p.prix,
			p.tva,
			p.reductionProfessionnel,
			p.stock,
			p.unitaireOuKilo,
			p.visible
		 FROM Panier_Produit pp
		 JOIN Produit p ON p.idProduit = pp.idProduit
		 WHERE pp.idPanier = ?
		 FOR UPDATE`,
		[cart.idPanier]
	);

	if (!itemRows.length) {
		throw new CheckoutError(409, 'Le panier est vide.');
	}

	const items = itemRows.map((item) => {
		validateCartLine(item);
		return {
			...item,
			lineTotalTtc: computeLineTotal(item)
		};
	});

	return { cart, items };
}

async function loadRelayOptions(conn) {
	const [rows] = await conn.query(
		`SELECT idRelais, nom, adresse_ligne, code_postal, ville
		 FROM PointRelais
		 ORDER BY nom ASC, idRelais ASC`
	);

	return rows.map(mapRelayRow);
}

async function loadPickupAvailability(conn, cartId) {
	const [rows] = await conn.query(
		`SELECT DISTINCT
			pp.idProduit,
			lv.idLieu,
			lv.nom,
			lv.horaires,
			lv.adresse_ligne,
			lv.code_postal,
			lv.ville,
			lv.latitude,
			lv.longitude
		 FROM Panier_Produit pp
		 JOIN Produit p ON p.idProduit = pp.idProduit
		 JOIN Professionnel_Entreprise pe ON pe.idProfessionnel = p.idProfessionnel
		 JOIN Entreprise_LieuVente elv ON elv.idEntreprise = pe.idEntreprise
		 JOIN LieuVente lv ON lv.idLieu = elv.idLieu
		 WHERE pp.idPanier = ?
		   AND p.visible = TRUE
		 ORDER BY lv.nom ASC, lv.idLieu ASC`,
		[cartId]
	);

	return rows;
}

function buildItemPickupOptions(items, availabilityRows) {
	const optionsByProduct = new Map();
	for (const row of availabilityRows) {
		const productId = Number(row.idProduit);
		if (!optionsByProduct.has(productId)) {
			optionsByProduct.set(productId, []);
		}

		const salesPoint = mapSalesPointRow(row);
		const currentOptions = optionsByProduct.get(productId);
		if (!currentOptions.some((option) => option.idLieu === salesPoint.idLieu)) {
			currentOptions.push(salesPoint);
		}
	}

	return items.map((item) => ({
		idProduit: Number(item.idProduit),
		nom: item.nom,
		quantite: Number(item.quantite),
		prixTTC: item.lineTotalTtc,
		availablePickupPoints: optionsByProduct.get(Number(item.idProduit)) || []
	}));
}

function buildUniquePickupPoints(itemPickupOptions) {
	const salesPoints = new Map();
	itemPickupOptions.forEach((item) => {
		item.availablePickupPoints.forEach((salesPoint) => {
			if (!salesPoints.has(salesPoint.idLieu)) {
				salesPoints.set(salesPoint.idLieu, {
					...salesPoint,
					productIds: [],
					productNames: []
				});
			}

			const target = salesPoints.get(salesPoint.idLieu);
			if (!target.productIds.includes(item.idProduit)) {
				target.productIds.push(item.idProduit);
				target.productNames.push(item.nom);
			}
		});
	});

	return [...salesPoints.values()];
}

function buildRecommendedPickupAssignments(itemPickupOptions) {
	const coverage = buildUniquePickupPoints(itemPickupOptions);
	const uncoveredProducts = new Set(itemPickupOptions.map((item) => item.idProduit));
	const assignments = [];

	for (const salesPoint of coverage) {
		const matchingItems = itemPickupOptions.filter((item) => (
			uncoveredProducts.has(item.idProduit)
			&& item.availablePickupPoints.some((option) => option.idLieu === salesPoint.idLieu)
		));

		if (!matchingItems.length) continue;

		matchingItems.forEach((item) => {
			uncoveredProducts.delete(item.idProduit);
			assignments.push({
				idProduit: item.idProduit,
				idLieu: salesPoint.idLieu
			});
		});
	}

	return assignments;
}

function comparePickupPlans(candidate, best) {
	if (!best) return -1;
	if (candidate.totalDistanceKm !== best.totalDistanceKm) {
		return candidate.totalDistanceKm - best.totalDistanceKm;
	}
	if (candidate.distinctStopsCount !== best.distinctStopsCount) {
		return candidate.distinctStopsCount - best.distinctStopsCount;
	}
	return candidate.assignments.length - best.assignments.length;
}

function buildPickupPlanFromAssignments(itemPickupOptions, assignments, originCoordinates) {
	if (!originCoordinates) return null;
	const selection = buildPickupSelection(itemPickupOptions, assignments);
	if (selection.missingItems.length || selection.invalidAssignments.length) return null;

	const pickupRoute = computeOptimalPickupRoute(selection.selectedStops, { originCoordinates });

	return {
		assignments: selection.assignments.map((assignment) => ({
			idProduit: assignment.idProduit,
			idLieu: assignment.idLieu
		})),
		detailedAssignments: selection.assignments,
		selectedStops: selection.selectedStops,
		pickupRoute,
		distinctStopsCount: selection.selectedStops.length,
		totalDistanceKm: Number(pickupRoute.totalDistanceKm || 0)
	};
}

function buildOptimizedPickupPlan(itemPickupOptions, originCoordinates) {
	const normalizedItems = [...itemPickupOptions]
		.map((item) => ({
			...item,
			availablePickupPoints: item.availablePickupPoints || []
		}))
		.sort((left, right) => left.availablePickupPoints.length - right.availablePickupPoints.length);

	if (!normalizedItems.length || normalizedItems.some((item) => item.availablePickupPoints.length === 0)) {
		return null;
	}

	let bestPlan = null;
	const currentAssignments = [];
	const currentStops = new Set();

		function visit(index) {

		if (index >= normalizedItems.length) {
			const candidatePlan = buildPickupPlanFromAssignments(itemPickupOptions, currentAssignments, originCoordinates);
			if (!candidatePlan) return;
			if (comparePickupPlans(candidatePlan, bestPlan) < 0) {
				bestPlan = candidatePlan;
			}
			return;
		}

		const item = normalizedItems[index];
		for (const point of item.availablePickupPoints) {
			const idLieu = Number(point.idLieu);
			currentAssignments.push({ idProduit: item.idProduit, idLieu });
			const alreadyUsed = currentStops.has(idLieu);
			if (!alreadyUsed) currentStops.add(idLieu);

			visit(index + 1);

			currentAssignments.pop();
			if (!alreadyUsed) currentStops.delete(idLieu);
		}
	}

	visit(0);
	return bestPlan;
}

function buildPickupSelection(itemPickupOptions, rawAssignments) {
	const assignments = normalizePickupAssignments(rawAssignments);
	const assignmentMap = buildAssignmentMap(assignments);
	const missingItems = [];
	const invalidAssignments = [];
	const selectedStopsMap = new Map();
	const lineAssignments = [];

	for (const item of itemPickupOptions) {
		const assignedLieuId = assignmentMap.get(item.idProduit);
		if (!assignedLieuId) {
			missingItems.push({ idProduit: item.idProduit, nom: item.nom });
			continue;
		}

		const selectedPoint = item.availablePickupPoints.find((option) => option.idLieu === assignedLieuId);
		if (!selectedPoint) {
			invalidAssignments.push({ idProduit: item.idProduit, idLieu: assignedLieuId, nom: item.nom });
			continue;
		}

		selectedStopsMap.set(selectedPoint.idLieu, selectedPoint);
		lineAssignments.push({
			idProduit: item.idProduit,
			nom: item.nom,
			quantite: item.quantite,
			idLieu: selectedPoint.idLieu,
			selectedLieu: selectedPoint
		});
	}

	return {
		assignments: lineAssignments,
		missingItems,
		invalidAssignments,
		selectedStops: [...selectedStopsMap.values()]
	};
}

function buildDeliverySelection({
	modeLivraison,
	profile,
	relayOptions,
	relayId,
	originCoordinates,
	adresseLivraison,
	itemPickupOptions,
	pickupAssignments
}) {
	const normalizedModeLivraison = normalizeModeLivraison(modeLivraison);
	if (!normalizedModeLivraison) {
		throw new CheckoutError(400, 'Mode de livraison invalide.');
	}

	if (normalizedModeLivraison === 'domicile') {
		const address = formatAddress(adresseLivraison) || resolveDefaultDeliveryAddress(profile);
		if (!address) {
			throw new CheckoutError(400, 'Renseignez une adresse de livraison complete.');
		}

		return {
			modeLivraison: normalizedModeLivraison,
			fraisLivraison: DELIVERY_FEES[normalizedModeLivraison],
			deliveryRecord: {
				modeLivraison: normalizedModeLivraison,
				adresse: address.label,
				idRelais: null,
				idLieu: null
			},
			summary: {
				type: 'domicile',
				label: address.label,
				address
			},
			pickupRoute: null,
			itemAssignments: []
		};
	}

	if (normalizedModeLivraison === 'point_relais') {
		const normalizedRelayId = parsePositiveInteger(relayId);
		if (!normalizedRelayId) {
			throw new CheckoutError(400, 'Selectionnez un point relais.');
		}

		const relay = relayOptions.find((option) => option.idRelais === normalizedRelayId);
		if (!relay) {
			throw new CheckoutError(404, 'Point relais introuvable.');
		}

		return {
			modeLivraison: normalizedModeLivraison,
			fraisLivraison: DELIVERY_FEES[normalizedModeLivraison],
			deliveryRecord: {
				modeLivraison: normalizedModeLivraison,
				adresse: null,
				idRelais: relay.idRelais,
				idLieu: null
			},
			summary: {
				type: 'point_relais',
				label: relay.nom,
				relay
			},
			pickupRoute: null,
			itemAssignments: []
		};
	}

	const pickupSelection = buildPickupSelection(itemPickupOptions, pickupAssignments);
	if (pickupSelection.missingItems.length) {
		throw new CheckoutError(400, 'Choisissez un point de vente pour chaque produit.');
	}

	if (pickupSelection.invalidAssignments.length) {
		throw new CheckoutError(409, 'Certains points de vente choisis ne correspondent pas aux produits du panier.');
	}

	const pickupRoute = computeOptimalPickupRoute(pickupSelection.selectedStops, { originCoordinates });

	return {
		modeLivraison: normalizedModeLivraison,
		fraisLivraison: DELIVERY_FEES[normalizedModeLivraison],
		deliveryRecord: null,
		summary: {
			type: 'lieu_vente',
			label: `${pickupSelection.selectedStops.length} point(s) de vente`,
			assignments: pickupSelection.assignments
		},
		pickupRoute,
		itemAssignments: pickupSelection.assignments
	};
}

export async function getCheckoutContext({
	db,
	owner,
	profile,
	geocodeAddressFn
}) {
	const conn = await db.getConnection();

	try {
		const { cart, items } = await loadCurrentCartWithItems(conn, owner);
		const relayOptions = await loadRelayOptions(conn);
		const pickupAvailability = await loadPickupAvailability(conn, cart.idPanier);
		const itemPickupOptions = buildItemPickupOptions(items, pickupAvailability);
		const defaultDeliveryAddress = resolveDefaultDeliveryAddress(profile);
		let originCoordinates = null;
		if (defaultDeliveryAddress && typeof geocodeAddressFn === 'function') {
			try {
				originCoordinates = await geocodeAddressFn(defaultDeliveryAddress);
			} catch {
				originCoordinates = null;
			}
		}
		const optimizedPickupPlan = buildOptimizedPickupPlan(itemPickupOptions, originCoordinates);
		const fallbackAssignments = buildRecommendedPickupAssignments(itemPickupOptions);
		const defaultPickupAssignments = optimizedPickupPlan?.assignments || fallbackAssignments;

		return {
			cart: {
				idPanier: cart.idPanier,
				itemsCount: items.length,
				sousTotalProduits: roundCurrency(items.reduce((sum, item) => sum + item.lineTotalTtc, 0))
			},
			defaultDeliveryAddress,
			paymentModes: Object.entries(PAYMENT_MODES).map(([value, label]) => ({ value, label })),
			deliveryModes: [
				{
					value: 'domicile',
					label: 'Livraison a domicile',
					frais: DELIVERY_FEES.domicile,
					available: true,
					address: resolveDefaultDeliveryAddress(profile)
				},
				{
					value: 'point_relais',
					label: 'Point relais',
					frais: DELIVERY_FEES.point_relais,
					available: relayOptions.length > 0
				},
				{
					value: 'lieu_vente',
					label: 'Retrait en point de vente',
					frais: DELIVERY_FEES.lieu_vente,
					available: itemPickupOptions.every((item) => item.availablePickupPoints.length > 0)
				}
			],
			relayOptions,
			items: itemPickupOptions,
			pickup: {
				defaultAssignments: defaultPickupAssignments,
				uniqueSalesPoints: buildUniquePickupPoints(itemPickupOptions),
				optimizedRoute: optimizedPickupPlan?.pickupRoute || null,
				optimizedStopsCount: optimizedPickupPlan?.distinctStopsCount || 0,
				originCoordinates,
				requiresGeocodedOrigin: true,
				originGeocoded: Boolean(originCoordinates)
			}
		};
	} finally {
		conn.release();
	}
}

export async function previewCheckout({
	db,
	owner,
	profile,
	modeLivraison,
	modePaiement,
	relayId,
	adresseLivraison,
	pickupAssignments,
	voucherId,
	geocodeAddressFn
}) {
	const conn = await db.getConnection();

	try {
		const { cart, items } = await loadCurrentCartWithItems(conn, owner);
		const relayOptions = await loadRelayOptions(conn);
		const pickupAvailability = await loadPickupAvailability(conn, cart.idPanier);
		const itemPickupOptions = buildItemPickupOptions(items, pickupAvailability);
		const originAddress = modeLivraison === 'lieu_vente'
			? (formatAddress(adresseLivraison) || resolveDefaultDeliveryAddress(profile))
			: null;
		let originCoordinates = null;
		if (originAddress && typeof geocodeAddressFn === 'function') {
			try {
				originCoordinates = await geocodeAddressFn(originAddress);
			} catch {
				originCoordinates = null;
			}
		}
		if (modeLivraison === 'lieu_vente' && !originCoordinates) {
			throw new CheckoutError(422, 'Impossible de géocoder votre adresse de départ. Renseignez une adresse personnelle exploitable avant de calculer le trajet.');
		}
		const delivery = buildDeliverySelection({
			modeLivraison,
			profile,
			relayOptions,
			relayId,
			originCoordinates,
			adresseLivraison,
			itemPickupOptions,
			pickupAssignments
		});
		const normalizedModePaiement = normalizeModePaiement(modePaiement);
		if (!normalizedModePaiement) {
			throw new CheckoutError(400, 'Mode de paiement invalide.');
		}

		const normalizedVoucherId = parseVoucherId(voucherId);
		let appliedVoucher = null;

		if (voucherId != null && normalizedVoucherId == null) {
			throw new CheckoutError(400, 'Identifiant de bon invalide.');
		}

		if (normalizedVoucherId != null) {
			if (owner.column !== 'idParticulier') {
				throw new CheckoutError(403, "Bon d'achat réservé aux comptes particuliers.");
			}

			const [voucherRows] = await conn.query(
				`SELECT idBon, idParticulier, codeBon, valeurEuros, statut, dateExpiration
				 FROM BonAchat
				 WHERE idBon = ?
				 LIMIT 1`,
				[normalizedVoucherId]
			);
			const voucher = voucherRows[0];
			if (!voucher || Number(voucher.idParticulier) !== Number(owner.id)) {
				throw new CheckoutError(404, "Bon d'achat introuvable.");
			}
			if (voucher.statut !== 'actif') {
				throw new CheckoutError(409, "Ce bon d'achat n'est plus utilisable.");
			}
			if (voucher.dateExpiration && new Date(voucher.dateExpiration).getTime() <= Date.now()) {
				throw new CheckoutError(409, "Ce bon d'achat a expiré.");
			}

			appliedVoucher = {
				idBon: voucher.idBon,
				codeBon: voucher.codeBon,
				valeurEuros: roundCurrency(voucher.valeurEuros)
			};
		}

		const sousTotalProduits = roundCurrency(items.reduce((sum, item) => sum + item.lineTotalTtc, 0));
		const totalBeforeVoucher = roundCurrency(sousTotalProduits + delivery.fraisLivraison);
		const prixTotal = roundCurrency(
			Math.max(totalBeforeVoucher - Number(appliedVoucher?.valeurEuros || 0), 0)
		);
		const deliverySummary = delivery.modeLivraison === 'point_relais'
			? {
				...delivery.summary,
				relay: await enrichRelayWithCoordinates(delivery.summary.relay, geocodeAddressFn)
			}
			: delivery.summary;

		return {
			cart: {
				idPanier: cart.idPanier,
				itemsCount: items.length
			},
			modeLivraison: delivery.modeLivraison,
			modePaiement: normalizedModePaiement,
			modePaiementLabel: PAYMENT_MODES[normalizedModePaiement],
			sousTotalProduits,
			fraisLivraison: delivery.fraisLivraison,
			totalBeforeVoucher,
			prixTotal,
			appliedVoucher,
			delivery: deliverySummary,
			pickupRoute: delivery.pickupRoute,
			items: items.map((item) => ({
				idProduit: Number(item.idProduit),
				nom: item.nom,
				quantite: Number(item.quantite),
				prixTTC: item.lineTotalTtc,
				selectedLieu: delivery.itemAssignments.find((assignment) => assignment.idProduit === Number(item.idProduit))?.selectedLieu || null
			}))
		};
	} finally {
		conn.release();
	}
}

export async function checkoutCart({
	db,
	owner,
	profile,
	modeLivraison,
	modePaiement,
	relayId,
	adresseLivraison,
	pickupAssignments,
	voucherId,
	geocodeAddressFn
}) {
	const conn = await db.getConnection();

	try {
		await conn.beginTransaction();

		const { cart, items } = await loadCurrentCartWithItems(conn, owner);
		const relayOptions = await loadRelayOptions(conn);
		const pickupAvailability = await loadPickupAvailability(conn, cart.idPanier);
		const itemPickupOptions = buildItemPickupOptions(items, pickupAvailability);
		const originAddress = modeLivraison === 'lieu_vente'
			? (formatAddress(adresseLivraison) || resolveDefaultDeliveryAddress(profile))
			: null;
		let originCoordinates = null;
		if (originAddress && typeof geocodeAddressFn === 'function') {
			try {
				originCoordinates = await geocodeAddressFn(originAddress);
			} catch {
				originCoordinates = null;
			}
		}
		if (modeLivraison === 'lieu_vente' && !originCoordinates) {
			throw new CheckoutError(422, 'Impossible de géocoder votre adresse de départ. Renseignez une adresse personnelle exploitable avant de calculer le trajet.');
		}
		const delivery = buildDeliverySelection({
			modeLivraison,
			profile,
			relayOptions,
			relayId,
			originCoordinates,
			adresseLivraison,
			itemPickupOptions,
			pickupAssignments
		});
		const normalizedModePaiement = normalizeModePaiement(modePaiement);
		if (!normalizedModePaiement) {
			throw new CheckoutError(400, 'Mode de paiement invalide.');
		}

		const normalizedVoucherId = parseVoucherId(voucherId);
		let appliedVoucher = null;

		if (voucherId != null && normalizedVoucherId == null) {
			throw new CheckoutError(400, 'Identifiant de bon invalide.');
		}

		if (normalizedVoucherId != null) {
			if (owner.column !== 'idParticulier') {
				throw new CheckoutError(403, "Bon d'achat réservé aux comptes particuliers.");
			}

			const [voucherRows] = await conn.query(
				`SELECT idBon, idParticulier, codeBon, valeurEuros, statut, dateExpiration
				 FROM BonAchat
				 WHERE idBon = ?
				 LIMIT 1
				 FOR UPDATE`,
				[normalizedVoucherId]
			);

			const voucher = voucherRows[0];
			if (!voucher || Number(voucher.idParticulier) !== Number(owner.id)) {
				throw new CheckoutError(404, "Bon d'achat introuvable.");
			}

			if (voucher.statut !== 'actif') {
				throw new CheckoutError(409, "Ce bon d'achat n'est plus utilisable.");
			}

			if (voucher.dateExpiration && new Date(voucher.dateExpiration).getTime() <= Date.now()) {
				await conn.execute(
					"UPDATE BonAchat SET statut = 'expire' WHERE idBon = ?",
					[voucher.idBon]
				);
				throw new CheckoutError(409, "Ce bon d'achat a expiré.");
			}

			appliedVoucher = {
				idBon: voucher.idBon,
				codeBon: voucher.codeBon,
				valeurEuros: roundCurrency(voucher.valeurEuros)
			};
		}

		const sousTotalProduits = roundCurrency(items.reduce((sum, item) => sum + item.lineTotalTtc, 0));
		const totalBeforeVoucher = roundCurrency(sousTotalProduits + delivery.fraisLivraison);
		const prixTotal = roundCurrency(
			Math.max(totalBeforeVoucher - Number(appliedVoucher?.valeurEuros || 0), 0)
		);
		const gainedPoints = owner.column === 'idParticulier' ? computeRewardPoints(prixTotal) : 0;
		let updatedPointsBalance = null;
		const ownerColumns = buildOwnerOrderColumns(owner);

		const [orderResult] = await conn.execute(
			`INSERT INTO Commande
			 (modeLivraison, modePaiement, prixTotal, status, idParticulier, idProfessionnel)
			 VALUES (?, ?, ?, 'en_attente', ?, ?)`,
			[
				delivery.modeLivraison,
				normalizedModePaiement,
				prixTotal,
				ownerColumns.idParticulier,
				ownerColumns.idProfessionnel
			]
		);
		const numeroCommandeUtilisateur = await getOwnerOrderSequenceNumber(conn, owner, Number(orderResult.insertId));

		for (const item of items) {
			const linePickupAssignment = delivery.itemAssignments.find((assignment) => assignment.idProduit === Number(item.idProduit));

			await conn.execute(
				`INSERT INTO LigneCommande (idCommande, idProduit, quantite, prixTTC, idLieu)
				 VALUES (?, ?, ?, ?, ?)`,
				[orderResult.insertId, item.idProduit, item.quantite, item.lineTotalTtc, linePickupAssignment?.idLieu || null]
			);

			await conn.execute(
				'UPDATE Produit SET stock = stock - ? WHERE idProduit = ?',
				[item.quantite, item.idProduit]
			);
		}

		if (delivery.modeLivraison === 'lieu_vente') {
			for (const stop of delivery.pickupRoute.stops) {
				await conn.execute(
					`INSERT INTO Livraison
					 (idCommande, idParticulier, idProfessionnel, modeLivraison, adresse, idRelais, idLieu)
					 VALUES (?, ?, ?, 'lieu_vente', NULL, NULL, ?)`,
					[orderResult.insertId, ownerColumns.idParticulier, ownerColumns.idProfessionnel, stop.idLieu]
				);
			}
		} else {
			await conn.execute(
				`INSERT INTO Livraison
				 (idCommande, idParticulier, idProfessionnel, modeLivraison, adresse, idRelais, idLieu)
				 VALUES (?, ?, ?, ?, ?, ?, ?)`,
				[
					orderResult.insertId,
					ownerColumns.idParticulier,
					ownerColumns.idProfessionnel,
					delivery.modeLivraison,
					delivery.deliveryRecord?.adresse || null,
					delivery.deliveryRecord?.idRelais || null,
					delivery.deliveryRecord?.idLieu || null
				]
			);
		}

		if (appliedVoucher) {
			await conn.execute(
				`UPDATE BonAchat
				 SET statut = 'utilise',
				     dateUtilisation = NOW()
				 WHERE idBon = ?`,
				[appliedVoucher.idBon]
			);
		}

		if (owner.column === 'idParticulier') {
			if (gainedPoints > 0) {
				await conn.execute(
					'UPDATE Particulier SET pointsFidelite = pointsFidelite + ? WHERE idParticulier = ?',
					[gainedPoints, owner.id]
				);
			}

			const [particulierRows] = await conn.query(
				'SELECT pointsFidelite FROM Particulier WHERE idParticulier = ? LIMIT 1',
				[owner.id]
			);
			updatedPointsBalance = Number(particulierRows[0]?.pointsFidelite || 0);
		}

		await conn.execute('DELETE FROM Panier_Produit WHERE idPanier = ?', [cart.idPanier]);
		await conn.commit();

		return {
			order: {
				idCommande: orderResult.insertId,
				numeroCommandeUtilisateur,
				idPanier: cart.idPanier,
				modeLivraison: delivery.modeLivraison,
				modePaiement: normalizedModePaiement,
				sousTotalProduits,
				fraisLivraison: delivery.fraisLivraison,
				totalBeforeVoucher,
				prixTotal,
				status: 'en_attente'
			},
			delivery: delivery.summary,
			pickupRoute: delivery.pickupRoute,
			loyalty: owner.column === 'idParticulier'
				? {
					gainedPoints,
					pointsFidelite: updatedPointsBalance
				}
				: null,
			appliedVoucher,
			items: items.map((item) => ({
				idProduit: item.idProduit,
				nom: item.nom,
				quantite: Number(item.quantite),
				prixTTC: item.lineTotalTtc,
				selectedLieu: delivery.itemAssignments.find((assignment) => assignment.idProduit === Number(item.idProduit))?.selectedLieu || null
			}))
		};
	} catch (error) {
		await conn.rollback();
		throw error;
	} finally {
		conn.release();
	}
}

export { CheckoutError, computeRewardPoints, DELIVERY_FEES, PAYMENT_MODES };
