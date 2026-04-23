function roundDistance(value) {
	return Number(Number(value || 0).toFixed(2));
}

function toCoordinatePair(value) {
	const latitude = Number(value?.latitude);
	const longitude = Number(value?.longitude);

	if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
		return null;
	}

	return { latitude, longitude };
}

function haversineDistanceKm(from, to) {
	const source = toCoordinatePair(from);
	const target = toCoordinatePair(to);
	if (!source || !target) return 0;

	const earthRadiusKm = 6371;
	const dLat = ((target.latitude - source.latitude) * Math.PI) / 180;
	const dLon = ((target.longitude - source.longitude) * Math.PI) / 180;
	const lat1 = (source.latitude * Math.PI) / 180;
	const lat2 = (target.latitude * Math.PI) / 180;

	const a = Math.sin(dLat / 2) ** 2
		+ Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

	return earthRadiusKm * c;
}

export function annotatePickupRoute(stops) {
	let totalDistanceKm = 0;

	return stops.map((stop, index) => {
		if (index === 0) {
			return {
				...stop,
				legDistanceKm: 0
			};
		}

		const legDistanceKm = roundDistance(haversineDistanceKm(stops[index - 1].coordinates, stop.coordinates));
		totalDistanceKm += legDistanceKm;

		return {
			...stop,
			legDistanceKm
		};
	}).map((stop, index, array) => ({
		...stop,
		stopNumber: index + 1,
		totalDistanceKm: index === array.length - 1 ? roundDistance(totalDistanceKm) : undefined
	}));
}

function permute(values) {
	if (values.length <= 1) return [values];

	const results = [];

	values.forEach((value, index) => {
		const remaining = values.slice(0, index).concat(values.slice(index + 1));
		for (const permutation of permute(remaining)) {
			results.push([value, ...permutation]);
		}
	});

	return results;
}

function nearestNeighbourRoute(stops, startIndex) {
	const remaining = stops.map((_, index) => index).filter((index) => index !== startIndex);
	const orderedIndexes = [startIndex];

	while (remaining.length) {
		const lastIndex = orderedIndexes[orderedIndexes.length - 1];
		let closestIndex = remaining[0];
		let closestDistance = haversineDistanceKm(
			stops[lastIndex].coordinates,
			stops[closestIndex].coordinates
		);

		for (const candidate of remaining.slice(1)) {
			const distance = haversineDistanceKm(stops[lastIndex].coordinates, stops[candidate].coordinates);
			if (distance < closestDistance) {
				closestDistance = distance;
				closestIndex = candidate;
			}
		}

		orderedIndexes.push(closestIndex);
		remaining.splice(remaining.indexOf(closestIndex), 1);
	}

	return orderedIndexes.map((index) => stops[index]);
}

export function computeOptimalPickupRoute(stops) {
	if (!Array.isArray(stops) || stops.length === 0) {
		return {
			stops: [],
			totalDistanceKm: 0
		};
	}

	if (stops.length === 1) {
		return {
			stops: annotatePickupRoute(stops),
			totalDistanceKm: 0
		};
	}

	let bestRoute = null;
	let bestDistance = Number.POSITIVE_INFINITY;

	if (stops.length <= 8) {
		for (const permutation of permute(stops)) {
			const routeStops = annotatePickupRoute(permutation);
			const totalDistanceKm = routeStops[routeStops.length - 1]?.totalDistanceKm ?? 0;
			if (totalDistanceKm < bestDistance) {
				bestDistance = totalDistanceKm;
				bestRoute = routeStops;
			}
		}
	} else {
		for (let startIndex = 0; startIndex < stops.length; startIndex += 1) {
			const candidate = nearestNeighbourRoute(stops, startIndex);
			const routeStops = annotatePickupRoute(candidate);
			const totalDistanceKm = routeStops[routeStops.length - 1]?.totalDistanceKm ?? 0;
			if (totalDistanceKm < bestDistance) {
				bestDistance = totalDistanceKm;
				bestRoute = routeStops;
			}
		}
	}

	return {
		stops: bestRoute || annotatePickupRoute(stops),
		totalDistanceKm: roundDistance(bestDistance === Number.POSITIVE_INFINITY ? 0 : bestDistance)
	};
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

export function normalizePickupLieuIds(values) {
	if (!Array.isArray(values)) return [];

	const uniqueIds = new Set();

	for (const value of values) {
		const parsed = Number(value);
		if (Number.isInteger(parsed) && parsed > 0) {
			uniqueIds.add(parsed);
		}
	}

	return [...uniqueIds];
}

async function getCurrentCartByOwner(db, owner) {
	const [rows] = await db.query(
		`SELECT idPanier
		 FROM Panier
		 WHERE ${owner.column} = ?
		 LIMIT 1`,
		[owner.id]
	);

	return rows[0] || null;
}

async function loadPickupRows(db, owner) {
	const cart = await getCurrentCartByOwner(db, owner);
	if (!cart) {
		return { cart: null, rows: [] };
	}

	const [rows] = await db.query(
		`SELECT DISTINCT
			pp.idProduit,
			pp.quantite,
			p.nom AS nomProduit,
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
		 ORDER BY lv.nom ASC, p.nom ASC, lv.idLieu ASC`,
		[cart.idPanier]
	);

	return { cart, rows };
}

function buildPickupContext(rows) {
	const productsMap = new Map();
	const salesPointsMap = new Map();

	for (const row of rows) {
		if (!productsMap.has(row.idProduit)) {
			productsMap.set(row.idProduit, {
				idProduit: Number(row.idProduit),
				nom: row.nomProduit,
				quantite: Number(row.quantite || 0),
				availableLieuIds: []
			});
		}

		const product = productsMap.get(row.idProduit);
		if (!product.availableLieuIds.includes(Number(row.idLieu))) {
			product.availableLieuIds.push(Number(row.idLieu));
		}

		if (!salesPointsMap.has(row.idLieu)) {
			salesPointsMap.set(row.idLieu, {
				...mapSalesPointRow(row),
				productIds: [],
				productNames: []
			});
		}

		const salesPoint = salesPointsMap.get(row.idLieu);
		if (!salesPoint.productIds.includes(Number(row.idProduit))) {
			salesPoint.productIds.push(Number(row.idProduit));
			salesPoint.productNames.push(row.nomProduit);
		}
	}

	return {
		products: [...productsMap.values()],
		salesPoints: [...salesPointsMap.values()]
	};
}

function computeRecommendedLieuIds(products, salesPoints) {
	const uncovered = new Set(products.map((product) => product.idProduit));
	const remaining = new Map(salesPoints.map((salesPoint) => [salesPoint.idLieu, salesPoint]));
	const recommended = [];

	while (uncovered.size && remaining.size) {
		let bestSalesPoint = null;
		let bestCoverage = -1;

		for (const salesPoint of remaining.values()) {
			const coverage = salesPoint.productIds.filter((productId) => uncovered.has(productId)).length;
			if (coverage > bestCoverage) {
				bestCoverage = coverage;
				bestSalesPoint = salesPoint;
			}
		}

		if (!bestSalesPoint || bestCoverage <= 0) break;

		recommended.push(bestSalesPoint.idLieu);
		bestSalesPoint.productIds.forEach((productId) => uncovered.delete(productId));
		remaining.delete(bestSalesPoint.idLieu);
	}

	return recommended;
}

export async function getPickupOptionsForOwner({ db, owner }) {
	const { cart, rows } = await loadPickupRows(db, owner);
	if (!cart || rows.length === 0) {
		return {
			cartId: cart?.idPanier || null,
			items: [],
			salesPoints: [],
			recommendedLieuIds: []
		};
	}

	const context = buildPickupContext(rows);

	return {
		cartId: cart.idPanier,
		items: context.products,
		salesPoints: context.salesPoints,
		recommendedLieuIds: computeRecommendedLieuIds(context.products, context.salesPoints)
	};
}

export async function planPickupRouteForOwner({ db, owner, selectedLieuIds }) {
	const normalizedLieuIds = normalizePickupLieuIds(selectedLieuIds);
	if (!normalizedLieuIds.length) {
		return {
			selectedLieuIds: [],
			uncoveredProducts: [],
			route: {
				stops: [],
				totalDistanceKm: 0
			}
		};
	}

	const { cart, rows } = await loadPickupRows(db, owner);
	if (!cart || rows.length === 0) {
		return {
			selectedLieuIds: normalizedLieuIds,
			uncoveredProducts: [],
			route: {
				stops: [],
				totalDistanceKm: 0
			}
		};
	}

	const context = buildPickupContext(rows);
	const salesPointMap = new Map(context.salesPoints.map((salesPoint) => [salesPoint.idLieu, salesPoint]));
	const selectedSalesPoints = normalizedLieuIds
		.map((idLieu) => salesPointMap.get(idLieu))
		.filter(Boolean);

	const coveredProductIds = new Set(
		selectedSalesPoints.flatMap((salesPoint) => salesPoint.productIds)
	);
	const uncoveredProducts = context.products.filter((product) => !coveredProductIds.has(product.idProduit));
	const route = computeOptimalPickupRoute(selectedSalesPoints);

	return {
		selectedLieuIds: normalizedLieuIds,
		uncoveredProducts,
		route
	};
}
