import nodemailer from 'nodemailer';

const booleanFromEnv = (value) => String(value || '').toLowerCase() === 'true';

function getTransport() {
	if (!process.env.SMTP_HOST) return null;

	return nodemailer.createTransport({
		host: process.env.SMTP_HOST,
		port: Number(process.env.SMTP_PORT || 587),
		secure: booleanFromEnv(process.env.SMTP_SECURE),
		auth: process.env.SMTP_USER && process.env.SMTP_PASS
			? {
				user: process.env.SMTP_USER,
				pass: process.env.SMTP_PASS
			}
			: undefined
	});
}

export async function sendAccountVerificationEmail({ user, url }) {
	const from = process.env.MAIL_FROM || "LOCAL'ZH <no-reply@localzh.local>";
	const subject = "Verifiez votre compte LOCAL'ZH";
	const text = [
		`Bonjour ${user.name || ''}`.trim(),
		'',
		'Cliquez sur le lien suivant pour verifier votre compte :',
		url,
		'',
		'Si vous n avez pas cree de compte, ignorez cet email.'
	].join('\n');

	const html = `
		<p>Bonjour ${escapeHtml(user.name || '')},</p>
		<p>Cliquez sur le lien suivant pour verifier votre compte :</p>
		<p><a href="${escapeHtml(url)}">Verifier mon compte</a></p>
		<p>Si vous n avez pas cree de compte, ignorez cet email.</p>
	`;

	const transport = getTransport();
	if (!transport) {
		console.warn(`Verification email for ${user.email}: ${url}`);
		return;
	}

	await transport.sendMail({
		from,
		to: user.email,
		subject,
		text,
		html
	});
}

function escapeHtml(value) {
	return String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#039;');
}
