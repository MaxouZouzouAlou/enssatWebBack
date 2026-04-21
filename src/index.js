import express from 'express';
import dotenv from 'dotenv';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './auth.js';
import authProfileRouter from './routes/auth-profile.js';
import usersRouter from './routes/users.js';

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

app.use((req, res, next) => {
	res.header('Access-Control-Allow-Origin', FRONTEND_ORIGIN);
	res.header('Vary', 'Origin');
	res.header('Access-Control-Allow-Credentials', 'true');
	res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
	res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
	if (req.method === 'OPTIONS') return res.sendStatus(204);
	return next();
});

app.use('/api/auth', authProfileRouter);
app.all('/api/auth/*', toNodeHandler(auth));

app.use(express.json());
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/users', usersRouter);

app.listen(PORT_OPEN, async () => {
	console.log(`Server is running on http://localhost:${PORT_OPEN}`);
	console.log(`API documentation available at http://localhost:${PORT_OPEN}/api-docs`);
});
