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

export async function sendPasswordResetEmail({ user, url }) {
	const from = process.env.MAIL_FROM || "LOCAL'ZH <no-reply@localzh.local>";
	const subject = "Réinitialisation de votre mot de passe LOCAL'ZH";
	const text = [
		`Bonjour ${user.name || ''}`.trim(),
		'',
		'Cliquez sur le lien suivant pour réinitialiser votre mot de passe :',
		url,
		'',
		'Ce lien expire dans 1 heure.',
		'Si vous n avez pas fait cette demande, ignorez cet email.'
	].join('\n');

	const html = `
		<p>Bonjour ${escapeHtml(user.name || '')},</p>
		<p>Cliquez sur le lien suivant pour réinitialiser votre mot de passe :</p>
		<p><a href="${escapeHtml(url)}">Réinitialiser mon mot de passe</a></p>
		<p>Ce lien expire dans 1 heure.</p>
		<p>Si vous n'avez pas fait cette demande, ignorez cet email.</p>
	`;

	const transport = getTransport();
	if (!transport) {
		console.warn(`Password reset email for ${user.email}: ${url}`);
		return;
	}

	await transport.sendMail({ from, to: user.email, subject, text, html });
}

export async function sendIncidentCreatedEmail({ creator, recipients, ticket }) {
	if (!recipients.length) return;

	const url = getIncidentUrl(ticket.id);
	await sendMail({
		to: recipients,
		subject: `[LOCAL'ZH] Nouveau ticket ${ticket.severity}`,
		text: [
			`Un nouveau ticket a ete cree par ${formatUserName(creator)}.`,
			'',
			`Titre : ${ticket.title}`,
			`Module : ${ticket.moduleConcerne}`,
			`Severite : ${ticket.severity}`,
			'',
			ticket.description,
			'',
			`Consulter le ticket : ${url}`
		].join('\n'),
		html: `
			<p>Un nouveau ticket a ete cree par ${escapeHtml(formatUserName(creator))}.</p>
			<ul>
				<li><strong>Titre :</strong> ${escapeHtml(ticket.title)}</li>
				<li><strong>Module :</strong> ${escapeHtml(ticket.moduleConcerne)}</li>
				<li><strong>Severite :</strong> ${escapeHtml(ticket.severity)}</li>
			</ul>
			<p>${escapeHtml(ticket.description)}</p>
			<p><a href="${escapeHtml(url)}">Consulter le ticket</a></p>
		`
	});
}

export async function sendIncidentReplyEmail({ recipient, responder, ticket }) {
	if (!recipient?.email) return;

	const url = getIncidentUrl(ticket.id);
	await sendMail({
		to: recipient.email,
		subject: `[LOCAL'ZH] Reponse a votre ticket`,
		text: [
			`${formatUserName(responder)} a repondu a votre ticket.`,
			'',
			`Titre : ${ticket.title}`,
			`Statut : ${ticket.status}`,
			'',
			`Consulter l'echange : ${url}`
		].join('\n'),
		html: `
			<p>${escapeHtml(formatUserName(responder))} a repondu a votre ticket.</p>
			<ul>
				<li><strong>Titre :</strong> ${escapeHtml(ticket.title)}</li>
				<li><strong>Statut :</strong> ${escapeHtml(ticket.status)}</li>
			</ul>
			<p><a href="${escapeHtml(url)}">Consulter l'echange</a></p>
		`
	});
}

export async function sendIncidentStatusEmail({ actor, recipient, ticket, previousStatus }) {
	if (!recipient?.email) return;

	const url = getIncidentUrl(ticket.id);
	await sendMail({
		to: recipient.email,
		subject: `[LOCAL'ZH] Statut de ticket mis a jour`,
		text: [
			`Le statut de votre ticket a ete mis a jour par ${formatUserName(actor)}.`,
			'',
			`Titre : ${ticket.title}`,
			`Ancien statut : ${previousStatus}`,
			`Nouveau statut : ${ticket.status}`,
			'',
			`Consulter le ticket : ${url}`
		].join('\n'),
		html: `
			<p>Le statut de votre ticket a ete mis a jour par ${escapeHtml(formatUserName(actor))}.</p>
			<ul>
				<li><strong>Titre :</strong> ${escapeHtml(ticket.title)}</li>
				<li><strong>Ancien statut :</strong> ${escapeHtml(previousStatus)}</li>
				<li><strong>Nouveau statut :</strong> ${escapeHtml(ticket.status)}</li>
			</ul>
			<p><a href="${escapeHtml(url)}">Consulter le ticket</a></p>
		`
	});
}

async function sendMail({ html, subject, text, to }) {
	const from = process.env.MAIL_FROM || "LOCAL'ZH <no-reply@localzh.local>";
	const transport = getTransport();
	if (!transport) {
		console.warn(`Email "${subject}" to ${Array.isArray(to) ? to.join(', ') : to}`);
		return;
	}

	await transport.sendMail({
		from,
		to,
		subject,
		text,
		html
	});
}

function getIncidentUrl(ticketId) {
	const origin = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
	return `${origin}/tickets-incidents?ticket=${encodeURIComponent(ticketId)}`;
}

function formatUserName(user) {
	return [user?.prenom, user?.nom].filter(Boolean).join(' ') || user?.email || 'Utilisateur';
}

function escapeHtml(value) {
	return String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#039;');
}
