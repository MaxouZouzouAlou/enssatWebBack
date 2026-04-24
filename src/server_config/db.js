import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { getEnvValue, getRequiredEnv, isTestEnv } from './env.js';

dotenv.config();

const dbHost = isTestEnv ? getEnvValue('DB_HOST', { fallback: '127.0.0.1' }) : getRequiredEnv('DB_HOST');
const dbUser = isTestEnv ? getEnvValue('DB_USER', { fallback: 'root' }) : getRequiredEnv('DB_USER');
const dbPassword = isTestEnv
	? getEnvValue('DB_PASS', { fallback: getEnvValue('DB_PASSWORD', { fallback: 'sqlpassword' }) })
	: (getEnvValue('DB_PASS') ?? getRequiredEnv('DB_PASSWORD'));
const dbName = isTestEnv ? getEnvValue('DB_NAME', { fallback: 'localzh' }) : getRequiredEnv('DB_NAME');

const pool = mysql.createPool({
	host: dbHost,
	user: dbUser,
	password: dbPassword,
	database: dbName,
	timezone: 'Z',
	waitForConnections: true,
	connectionLimit: 10
});

// Test de connexion au démarrage
if (!isTestEnv) {
	pool.getConnection()
		.then(conn => {
			console.log('✅ Connecté à MySQL');
			conn.release();
		})
		.catch(err => {
			console.error('❌ Erreur de connexion MySQL :', err.message);
		});
}

export default pool;
