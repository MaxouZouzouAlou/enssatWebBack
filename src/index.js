const express = require('express');
const dotenv = require('dotenv');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const usersRouter = require('./routes/users');
const commandRouter = require('./routes/commands');
const shoppingCartRouter = require('./routes/shoopingCart');

dotenv.config();

const app = express();
const PORT_OPEN = process.env.PORT_OPEN;

const swaggerSpec = swaggerJsdoc({
	definition: {
		openapi: '3.0.0',
		info: { title: `LOCAL'ZH API`, version: '1.0.0' }
	},
	apis: ['./src/routes/*.js']
});

app.use(express.json());
app.use(express.static('public'));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/users', usersRouter);
app.use('/command', commandRouter);
app.use('/shoopingCart', shoppingCartRouter);

// Middleware pour les routes non trouvées
app.use((req, res) => {
	res.status(404).json({ error: 'Route not found' });
});

// Middleware pour les erreurs
app.use((err, req, res, next) => {
	console.error('Error:', err);
	res.status(err.status || 500).json({ 
		error: err.message || 'Internal server error'
	});
});

app.listen(PORT_OPEN, async () => {
	console.log(`Server is running on http://localhost:${PORT_OPEN}`);
	console.log(`API documentation available at http://localhost:${PORT_OPEN}/api-docs`);
});