export const isTestEnv = process.env.NODE_ENV === 'test';

export function getEnvValue(name, { fallback = undefined, allowEmpty = false } = {}) {
	const value = process.env[name];
	if (value == null) return fallback;
	if (!allowEmpty && String(value).trim() === '') return fallback;
	return value;
}

export function getRequiredEnv(name) {
	const value = process.env[name];
	if (value == null || String(value).trim() === '') {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
}

