import { betterAuth } from 'better-auth';
import {
	ensureBusinessProfile,
	normalizeAccountType,
	validateSiret
} from './services/auth-profile-service.js';
import { sendAccountVerificationEmail, sendPasswordResetEmail } from './services/email-service.js';
import pool from './server_config/db.js';

const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
const backendPort = process.env.PORT_OPEN || '49161';
const backendOrigin = process.env.BETTER_AUTH_URL || `http://localhost:${backendPort}`;

const normalizeOrigin = (u) => (typeof u === 'string' ? u.replace(/\/$/, '') : u);
const normalizedFrontend = normalizeOrigin(frontendOrigin);
const normalizedBackend = normalizeOrigin(backendOrigin);

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
export const googleAuthEnabled = Boolean(googleClientId && googleClientSecret);
const betterAuthSecret = process.env.BETTER_AUTH_SECRET || 'localzh-dev-better-auth-secret-change-me';

if (!process.env.BETTER_AUTH_SECRET) {
	console.warn('BETTER_AUTH_SECRET is not set. Using development fallback secret.');
}

if ((googleClientId && !googleClientSecret) || (!googleClientId && googleClientSecret)) {
	console.warn('Google OAuth is partially configured. Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
}

export const auth = betterAuth({
	appName: "LOCAL'ZH",
	baseURL: backendOrigin,
	secret: betterAuthSecret,
	database: pool,
	trustedOrigins: [normalizedFrontend, normalizedBackend],
	emailAndPassword: {
		enabled: true,
		minPasswordLength: 8,
		requireEmailVerification: true,
		autoSignIn: false,
		sendResetPassword: async ({ user, url }) => {
			await sendPasswordResetEmail({ user, url });
		}
	},
	emailVerification: {
		sendOnSignUp: true,
		sendOnSignIn: true,
		autoSignInAfterVerification: true,
		expiresIn: 60 * 60 * 24,
		sendVerificationEmail: async (data) => {
			await sendAccountVerificationEmail(data);
		},
		afterEmailVerification: async (user) => {
			if (user.accountType === 'superadmin') return;
			await ensureBusinessProfile(user, {
				accountType: user.accountType || 'particulier'
			});
		}
	},
	socialProviders: googleAuthEnabled
		? {
			google: {
				clientId: googleClientId,
				clientSecret: googleClientSecret,
				prompt: 'select_account'
			}
		}
		: {},
	user: {
		additionalFields: {
			accountType: {
				type: 'string',
				required: false,
				defaultValue: 'particulier',
				input: true
			},
			role: {
				type: 'string',
				required: false,
				defaultValue: 'user',
				input: false
			},
			firstName: {
				type: 'string',
				required: false,
				input: true
			},
			lastName: {
				type: 'string',
				required: false,
				input: true
			}
		}
	},
	account: {
		encryptOAuthTokens: true
	},
	session: {
		expiresIn: 60 * 60 * 24 * 7,
		updateAge: 60 * 60 * 24,
		cookieCache: {
			enabled: true,
			maxAge: 60 * 5
		}
	},
	databaseHooks: {
		user: {
			create: {
				before: async (user, ctx) => {
					const body = ctx?.body || {};
					const rawAccountType = body.accountType || user.accountType || 'particulier';

					if (rawAccountType === 'superadmin') {
						// ctx is null for internal server-side calls (seed only).
						// HTTP requests always have a context — block them from setting superadmin.
						if (ctx !== null) return false;
						return {
							data: {
								...user,
								accountType: 'superadmin',
								firstName: body.prenom || body.firstName || user.firstName || null,
								lastName: body.nom || body.lastName || user.lastName || null
							}
						};
					}

					const accountType = normalizeAccountType(rawAccountType);
					if (accountType === 'professionnel') {
						validateSiret(body.entreprise?.siret);
						if (!String(body.entreprise?.nom || '').trim()) return false;
					}

					return {
						data: {
							...user,
							accountType,
							firstName: body.prenom || body.firstName || user.firstName || null,
							lastName: body.nom || body.lastName || user.lastName || null
						}
					};
				},
				after: async (user, ctx) => {
					if (user.accountType === 'superadmin') return;
					const body = ctx?.body || {};
					const accountType = normalizeAccountType(body.accountType || user.accountType || 'particulier');
					await ensureBusinessProfile(user, {
						accountType,
						nom: body.nom || user.lastName,
						prenom: body.prenom || user.firstName,
						entreprise: body.entreprise
					});
				}
			}
		},
		account: {
			create: {
				before: async (account) => {
					if (account.providerId !== 'google') return;

					const [rows] = await pool.execute('SELECT accountType FROM `user` WHERE id = ? LIMIT 1', [account.userId]);
					if (rows[0]?.accountType === 'professionnel') {
						return false;
					}
				}
			}
		}
	}
});
