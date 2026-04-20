const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

const pool = mysql.createPool({
	host: process.env.DB_HOST || '127.0.0.1',
	user: process.env.DB_USER || 'root',
	password: process.env.DB_PASS || 'sqlpassword',
	database: process.env.DB_NAME || 'localzh',
	waitForConnections: true,
	connectionLimit: 10
});

// Test de connexion au démarrage
pool.getConnection()
	.then(conn => {
		console.log('✅ Connecté à MySQL');
		conn.release();
	})
	.catch(err => {
		console.error('❌ Erreur de connexion MySQL :', err.message);
	});

module.exports = pool;