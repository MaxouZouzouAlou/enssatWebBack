const express = require('express');
const dotenv = require('dotenv');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const usersRouter = require('./routes/users');

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
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/users', usersRouter);

app.listen(PORT_OPEN, async () => {
	console.log(`Server is running on http://localhost:${PORT_OPEN}`);
	console.log(`API documentation available at http://localhost:${PORT_OPEN}/api-docs`);
});