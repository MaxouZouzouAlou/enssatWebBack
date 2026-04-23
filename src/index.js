import express from 'express';
import dotenv from 'dotenv';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './auth.js';
import cors from 'cors';
import path from 'path';

import authProfileRouter from './routes/auth-profile.js';
import incidentsRouter from './routes/incidents.js';
import loyaltyRouter from './routes/loyalty.js';
import createOrdersRouter from './routes/orders.js';
import mapRouter from './routes/map.js';
import professionnelsRouter from './routes/professionnels.js';
import reviewsRouter from './routes/reviews.js';
import usersRouter from './routes/users.js';
import createProductsRouter from './routes/products.js';
import createProfessionalSalesPointsRouter from './routes/professional-sales-points.js';
import shoppingCartRouter from './routes/shoppingCart.js';
import superadminRouter from './routes/superadmin.js';
import notificationsRouter from './routes/notifications.js';
import { processDueRecurringOrders } from './services/recurring-order-service.js';

import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

dotenv.config();

const app = express();
const PORT_OPEN = process.env.PORT_OPEN || 49161;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';

const swaggerSpec = swaggerJsdoc({
	definition: {
		openapi: '3.0.0',
		info: { title: `LOCAL'ZH API`, version: '1.0.0' }
	},
	apis: ['./src/routes/*.js']
});

const ALLOWED_FRONTEND_ORIGIN = FRONTEND_ORIGIN.replace(/\/$/, '');
app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true); // allow server-to-server or same-origin requests
		const normalized = origin.replace(/\/$/, '');
        if (normalized === ALLOWED_FRONTEND_ORIGIN) return callback(null, true);
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true
}));

app.use('/api/auth', authProfileRouter);
app.use('/api/account', authProfileRouter);
app.all('/api/auth/*', toNodeHandler(auth));

app.use(express.json());
app.use('/images', express.static(path.join(process.cwd(), 'src', 'images')));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/users', usersRouter);
app.use('/professionnels', professionnelsRouter);
app.use('/professionnels', createProfessionalSalesPointsRouter());
app.use('/incidents', incidentsRouter);
app.use('/loyalty', loyaltyRouter);
app.use('/orders', createOrdersRouter());
app.use('/products', createProductsRouter());
app.use('/reviews', reviewsRouter);
app.use('/map', mapRouter);
app.use('/shoppingCart', shoppingCartRouter);
app.use('/superadmin', superadminRouter);
app.use('/notifications', notificationsRouter);

app.use((err, req, res, next) => {
	console.error(err);
	if (res.headersSent) return next(err);
	return res.status(500).json({ error: 'Erreur serveur.' });
});

app.listen(PORT_OPEN, () => {
	console.log(`Server is running on http://localhost:${PORT_OPEN}`);
	console.log(`API documentation available at http://localhost:${PORT_OPEN}/api-docs`);
});

if (process.env.NODE_ENV !== 'test') {
	const intervalMs = Math.max(Number(process.env.RECURRING_ORDERS_INTERVAL_MS || 60000), 15000);
	let processing = false;

	setInterval(async () => {
		if (processing) return;
		processing = true;
		try {
			const results = await processDueRecurringOrders();
			if (results.some((entry) => !entry.ok)) {
				console.warn('Recurring orders processing finished with errors:', results.filter((entry) => !entry.ok));
			}
		} catch (error) {
			console.error('Recurring orders processor failed:', error);
		} finally {
			processing = false;
		}
	}, intervalMs);
}
