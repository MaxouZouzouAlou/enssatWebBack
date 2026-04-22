import express from 'express';
import dotenv from 'dotenv';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './auth.js';
import { seedSuperAdmin } from './seed/superadmin.js';
import cors from 'cors';

import authProfileRouter from './routes/auth-profile.js';
import incidentsRouter from './routes/incidents.js';
import professionnelsRouter from './routes/professionnels.js';
import usersRouter from './routes/users.js';
import productsRouter from './routes/products.js';
import shoppingCartRouter from './routes/shoppingCart.js';

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
app.all('/api/auth/*', toNodeHandler(auth));

app.use(express.json());
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/users', usersRouter);
app.use('/professionnels', professionnelsRouter);
app.use('/incidents', incidentsRouter);
app.use('/products', productsRouter);
app.use('/shoppingCart', shoppingCartRouter);

app.use((err, req, res, next) => {
	console.error(err);
	if (res.headersSent) return next(err);
	return res.status(500).json({ error: 'Erreur serveur.' });
});

app.listen(PORT_OPEN, async () => {
	console.log(`Server is running on http://localhost:${PORT_OPEN}`);
	console.log(`API documentation available at http://localhost:${PORT_OPEN}/api-docs`);
	await seedSuperAdmin().catch(err => console.error('❌ Erreur seed superadmin :', err.message));
});
