import nodemailer from 'nodemailer';

const DELIVERY_MODE_LABELS = {
	domicile: 'Livraison à domicile',
	point_relais: 'Point relais',
	lieu_vente: 'Retrait en point de vente'
};

const PAYMENT_MODE_LABELS = {
	carte_bancaire: 'Carte bancaire',
	paypal: 'PayPal',
	apple_pay: 'Apple Pay'
};

// --- Utilities ---

function escapeHtml(value) {
	return String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#039;');
}

function formatPrice(value) {
	return `${Number(value || 0).toFixed(2).replace('.', ',')} €`;
}

// --- HTML template helpers ---

function buildEmailHtml({ title, preheader = '', body }) {
	return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f0e6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:#f5f0e6;">${escapeHtml(preheader)}</div>
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f0e6;">
  <tr><td align="center" style="padding:32px 16px;">
    <table cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="background-color:#0B2B0E;padding:28px 32px;text-align:center;">
          <div style="font-size:26px;font-weight:700;color:#ffffff;letter-spacing:3px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">LOCAL&#039;ZH</div>
          <div style="margin-top:6px;color:#a8d5a2;font-size:13px;">${escapeHtml(title)}</div>
        </td>
      </tr>
      <tr><td style="padding:32px;">${body}</td></tr>
      <tr>
        <td style="background-color:#f5f0e6;padding:20px 32px;text-align:center;border-top:1px solid #e8e0d0;">
          <p style="margin:0;color:#546e7a;font-size:12px;">&#169; LOCAL&#039;ZH &mdash; Produits locaux de qualit&eacute;</p>
          <p style="margin:6px 0 0;color:#90a4ae;font-size:11px;">Vous recevez cet email en tant que client LOCAL&#039;ZH.</p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function p(htmlContent, extraStyle = '') {
	return `<p style="margin:0 0 14px;font-size:15px;color:#1a1a1a;line-height:1.6;${extraStyle}">${htmlContent}</p>`;
}

function ctaButton(url, label) {
	return `<p style="text-align:center;margin:24px 0;"><a href="${escapeHtml(url)}" style="display:inline-block;background-color:#2D8635;color:#ffffff;text-decoration:none;font-weight:600;padding:14px 32px;border-radius:8px;font-size:15px;">${escapeHtml(label)}</a></p>`;
}

function infoBox(htmlContent) {
	return `<div style="background-color:#f5f0e6;border-radius:8px;padding:16px 20px;margin:16px 0;">${htmlContent}</div>`;
}

function sectionHeading(text) {
	return `<p style="margin:20px 0 10px;font-size:12px;font-weight:600;color:#546e7a;text-transform:uppercase;letter-spacing:0.8px;">${escapeHtml(text)}</p>`;
}

function hr() {
	return `<hr style="border:none;border-top:1px solid #e8e0d0;margin:24px 0;">`;
}

// --- Transport ---

const booleanFromEnv = (value) => String(value || '').toLowerCase() === 'true';

function getTransport() {
	if (!process.env.SMTP_HOST) return null;

	return nodemailer.createTransport({
		host: process.env.SMTP_HOST,
		port: Number(process.env.SMTP_PORT || 587),
		secure: booleanFromEnv(process.env.SMTP_SECURE),
		auth: process.env.SMTP_USER && process.env.SMTP_PASS
			? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
			: undefined
	});
}

async function sendMail({ html, subject, text, to }) {
	const from = process.env.MAIL_FROM || "LOCAL'ZH <no-reply@localzh.local>";
	const transport = getTransport();
	if (!transport) {
		console.warn(`Email "${subject}" to ${Array.isArray(to) ? to.join(', ') : to}`);
		return;
	}
	await transport.sendMail({ from, to, subject, text, html });
}

// --- URL helpers ---

function getIncidentUrl(ticketId) {
	const origin = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
	return `${origin}/tickets-incidents?ticket=${encodeURIComponent(ticketId)}`;
}

function getOrderUrl(orderId) {
	const origin = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
	return `${origin}/commandes/${encodeURIComponent(orderId)}`;
}

function formatUserName(user) {
	return [user?.prenom, user?.nom].filter(Boolean).join(' ') || user?.email || 'Utilisateur';
}

// --- Delivery detail renderers ---

function buildDeliveryDetailsHtml(delivery) {
	if (!delivery) return '';

	if (delivery.type === 'domicile') {
		return `<p style="margin:0;font-size:14px;color:#1a1a1a;">${escapeHtml(delivery.label)}</p>`;
	}

	if (delivery.type === 'point_relais') {
		const relay = delivery.relay;
		const addr = relay?.adresse
			? `${relay.adresse.ligne}, ${relay.adresse.codePostal} ${relay.adresse.ville}`
			: null;
		return [
			`<p style="margin:0;font-size:14px;font-weight:600;color:#1a1a1a;">${escapeHtml(relay?.nom || delivery.label)}</p>`,
			addr ? `<p style="margin:4px 0 0;font-size:13px;color:#546e7a;">${escapeHtml(addr)}</p>` : ''
		].join('');
	}

	if (delivery.type === 'lieu_vente' && Array.isArray(delivery.assignments)) {
		const stopMap = new Map();
		for (const assignment of delivery.assignments) {
			if (assignment.selectedLieu && !stopMap.has(assignment.idLieu)) {
				stopMap.set(assignment.idLieu, assignment.selectedLieu);
			}
		}
		const stops = [...stopMap.values()];
		return stops.map((lieu, index) => {
			const addr = lieu.adresse
				? `${lieu.adresse.ligne}, ${lieu.adresse.codePostal} ${lieu.adresse.ville}`
				: null;
			const isLast = index === stops.length - 1;
			return [
				`<p style="margin:${index === 0 ? '0' : '10px'} 0 4px;font-size:14px;font-weight:600;color:#1a1a1a;">${escapeHtml(lieu.nom)}</p>`,
				lieu.horaires ? `<p style="margin:2px 0;font-size:13px;color:#546e7a;">${escapeHtml(lieu.horaires)}</p>` : '',
				addr ? `<p style="margin:2px 0;font-size:13px;color:#546e7a;">${escapeHtml(addr)}</p>` : '',
				!isLast ? '<hr style="border:none;border-top:1px solid #e0dcd4;margin:8px 0;">' : ''
			].join('');
		}).join('');
	}

	return `<p style="margin:0;font-size:14px;color:#1a1a1a;">${escapeHtml(delivery.label || '')}</p>`;
}

function buildDeliveryDetailsText(delivery) {
	if (!delivery) return '';

	if (delivery.type === 'domicile') return delivery.label || '';

	if (delivery.type === 'point_relais') {
		const relay = delivery.relay;
		const addr = relay?.adresse
			? `${relay.adresse.ligne}, ${relay.adresse.codePostal} ${relay.adresse.ville}`
			: '';
		return [relay?.nom || delivery.label, addr].filter(Boolean).join('\n');
	}

	if (delivery.type === 'lieu_vente' && Array.isArray(delivery.assignments)) {
		const stopMap = new Map();
		for (const assignment of delivery.assignments) {
			if (assignment.selectedLieu && !stopMap.has(assignment.idLieu)) {
				stopMap.set(assignment.idLieu, assignment.selectedLieu);
			}
		}
		return [...stopMap.values()].map((lieu) => {
			const addr = lieu.adresse
				? `${lieu.adresse.ligne}, ${lieu.adresse.codePostal} ${lieu.adresse.ville}`
				: '';
			return [lieu.nom, lieu.horaires, addr].filter(Boolean).join(' – ');
		}).join('\n');
	}

	return delivery.label || '';
}

// --- Email senders ---

export async function sendAccountVerificationEmail({ user, url }) {
	const body = [
		p(`Bonjour <strong>${escapeHtml(user.name || '')}</strong>,`),
		p('Cliquez sur le bouton ci-dessous pour v&eacute;rifier votre adresse email et activer votre compte.'),
		ctaButton(url, 'Vérifier mon compte'),
		p('Si vous n&#039;avez pas cr&eacute;&eacute; de compte sur LOCAL&#039;ZH, ignorez cet email.', 'color:#546e7a;font-size:13px;text-align:center;margin-top:8px;')
	].join('');

	await sendMail({
		to: user.email,
		subject: "Vérifiez votre compte LOCAL'ZH",
		text: [
			`Bonjour ${user.name || ''},`,
			'',
			'Cliquez sur le lien suivant pour vérifier votre compte :',
			url,
			'',
			"Si vous n'avez pas créé de compte, ignorez cet email."
		].join('\n'),
		html: buildEmailHtml({
			title: 'Vérification de votre compte',
			preheader: "Confirmez votre adresse email pour activer votre compte LOCAL'ZH.",
			body
		})
	});
}

export async function sendEmailChangeVerificationEmail({ user, newEmail, url }) {
	const body = [
		p(`Bonjour <strong>${escapeHtml(user.name || '')}</strong>,`),
		p(`Vous avez demand&eacute; &agrave; remplacer votre adresse email actuelle par : <strong>${escapeHtml(newEmail)}</strong>`),
		p('Cliquez sur le bouton ci-dessous pour confirmer ce changement :'),
		ctaButton(url, 'Confirmer ma nouvelle adresse'),
		p('Si vous n&#039;&ecirc;tes pas &agrave; l&#039;origine de cette demande, ignorez cet email.', 'color:#546e7a;font-size:13px;text-align:center;margin-top:8px;')
	].join('');

	await sendMail({
		to: newEmail,
		subject: "Confirmez votre nouvelle adresse email LOCAL'ZH",
		text: [
			`Bonjour ${user.name || ''},`,
			'',
			`Vous avez demandé à remplacer votre adresse actuelle par : ${newEmail}`,
			'',
			'Cliquez sur le lien suivant pour confirmer ce changement :',
			url,
			'',
			"Si vous n'êtes pas à l'origine de cette demande, ignorez cet email."
		].join('\n'),
		html: buildEmailHtml({
			title: "Confirmation de changement d'email",
			preheader: `Confirmez votre nouvelle adresse email : ${newEmail}`,
			body
		})
	});
}

export async function sendPasswordResetEmail({ user, url }) {
	const body = [
		p(`Bonjour <strong>${escapeHtml(user.name || '')}</strong>,`),
		p('Vous avez demand&eacute; &agrave; r&eacute;initialiser votre mot de passe. Cliquez sur le bouton ci-dessous pour continuer.'),
		ctaButton(url, 'Réinitialiser mon mot de passe'),
		infoBox('<p style="margin:0;font-size:13px;color:#546e7a;">Ce lien est valable <strong>1 heure</strong>. Pass&eacute; ce d&eacute;lai, vous devrez refaire la demande.</p>'),
		p('Si vous n&#039;avez pas fait cette demande, ignorez cet email. Votre compte reste s&eacute;curis&eacute;.', 'color:#546e7a;font-size:13px;text-align:center;margin-top:8px;')
	].join('');

	await sendMail({
		to: user.email,
		subject: "Réinitialisation de votre mot de passe LOCAL'ZH",
		text: [
			`Bonjour ${user.name || ''},`,
			'',
			'Cliquez sur le lien suivant pour réinitialiser votre mot de passe :',
			url,
			'',
			'Ce lien expire dans 1 heure.',
			"Si vous n'avez pas fait cette demande, ignorez cet email."
		].join('\n'),
		html: buildEmailHtml({
			title: 'Réinitialisation de mot de passe',
			preheader: "Réinitialisez votre mot de passe LOCAL'ZH.",
			body
		})
	});
}

export async function sendOrderConfirmationEmail({ user, order, items, delivery, loyalty, appliedVoucher }) {
	const orderUrl = getOrderUrl(order.idCommande);
	const displayedOrderNumber = order.numeroCommandeUtilisateur || order.idCommande;
	const deliveryModeLabel = DELIVERY_MODE_LABELS[order.modeLivraison] || order.modeLivraison;
	const paymentModeLabel = PAYMENT_MODE_LABELS[order.modePaiement] || order.modePaiement;
	const dateStr = new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });

	const itemsRows = items.map((item) => `
		<tr>
			<td style="padding:10px 12px;font-size:14px;color:#1a1a1a;border-top:1px solid #e8e0d0;">${escapeHtml(item.nom)}</td>
			<td style="padding:10px 12px;font-size:14px;color:#1a1a1a;text-align:center;border-top:1px solid #e8e0d0;white-space:nowrap;">${escapeHtml(String(item.quantite))}</td>
			<td style="padding:10px 12px;font-size:14px;color:#1a1a1a;text-align:right;border-top:1px solid #e8e0d0;white-space:nowrap;">${escapeHtml(formatPrice(item.prixTTC))}</td>
		</tr>`).join('');

	const itemsTable = `
		<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
			<tr style="background-color:#f5f0e6;">
				<td style="padding:10px 12px;font-size:12px;font-weight:600;color:#546e7a;text-transform:uppercase;">Produit</td>
				<td style="padding:10px 12px;font-size:12px;font-weight:600;color:#546e7a;text-align:center;text-transform:uppercase;">Qt&eacute;</td>
				<td style="padding:10px 12px;font-size:12px;font-weight:600;color:#546e7a;text-align:right;text-transform:uppercase;">Montant</td>
			</tr>
			${itemsRows}
		</table>`;

	const fraisCell = Number(order.fraisLivraison) === 0
		? '<span style="color:#2D8635;font-weight:600;">Gratuit</span>'
		: escapeHtml(formatPrice(order.fraisLivraison));

	const voucherRow = appliedVoucher ? `
		<tr>
			<td style="padding:6px 0;font-size:14px;color:#2D8635;">Bon d&#039;achat (${escapeHtml(appliedVoucher.codeBon)})</td>
			<td style="padding:6px 0;font-size:14px;color:#2D8635;text-align:right;white-space:nowrap;">&minus;${escapeHtml(formatPrice(appliedVoucher.valeurEuros))}</td>
		</tr>` : '';

	const totalsTable = `
		<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">
			<tr>
				<td style="padding:6px 0;font-size:14px;color:#546e7a;">Sous-total produits</td>
				<td style="padding:6px 0;font-size:14px;color:#1a1a1a;text-align:right;white-space:nowrap;">${escapeHtml(formatPrice(order.sousTotalProduits))}</td>
			</tr>
			<tr>
				<td style="padding:6px 0;font-size:14px;color:#546e7a;">Frais de livraison</td>
				<td style="padding:6px 0;font-size:14px;text-align:right;white-space:nowrap;">${fraisCell}</td>
			</tr>
			${voucherRow}
			<tr>
				<td style="padding:12px 0 6px;font-size:16px;font-weight:700;color:#0B2B0E;border-top:2px solid #e8e0d0;">Total TTC</td>
				<td style="padding:12px 0 6px;font-size:16px;font-weight:700;color:#0B2B0E;text-align:right;border-top:2px solid #e8e0d0;white-space:nowrap;">${escapeHtml(formatPrice(order.prixTotal))}</td>
			</tr>
		</table>`;

	const loyaltyBlock = loyalty?.gainedPoints > 0 ? `
		${hr()}
		<div style="background-color:#e8f5e9;border-radius:8px;padding:14px 18px;border-left:4px solid #2D8635;">
			<p style="margin:0;font-size:14px;color:#0B2B0E;">
				Vous avez gagn&eacute; <strong>${escapeHtml(String(loyalty.gainedPoints))} point(s)</strong> de fid&eacute;lit&eacute;.
				Solde total&nbsp;: <strong>${escapeHtml(String(loyalty.pointsFidelite))} point(s)</strong>.
			</p>
		</div>` : '';

	const body = [
		p(`Bonjour <strong>${escapeHtml(user.name || 'cher(e) client(e)')}</strong>,`),
		p('Votre commande a bien &eacute;t&eacute; confirm&eacute;e. Merci pour votre achat sur LOCAL&#039;ZH&nbsp;!'),
		infoBox(`
			<table width="100%" cellpadding="0" cellspacing="0">
				<tr>
					<td style="font-size:14px;color:#546e7a;">Num&eacute;ro de commande</td>
					<td style="font-size:14px;font-weight:600;color:#0B2B0E;text-align:right;">#${escapeHtml(String(displayedOrderNumber))}</td>
				</tr>
				<tr>
					<td style="font-size:14px;color:#546e7a;padding-top:6px;">Date</td>
					<td style="font-size:14px;color:#1a1a1a;text-align:right;padding-top:6px;">${escapeHtml(dateStr)}</td>
				</tr>
				<tr>
					<td style="font-size:14px;color:#546e7a;padding-top:6px;">Mode de paiement</td>
					<td style="font-size:14px;color:#1a1a1a;text-align:right;padding-top:6px;">${escapeHtml(paymentModeLabel)}</td>
				</tr>
			</table>`),
		sectionHeading('Articles commandés'),
		itemsTable,
		totalsTable,
		hr(),
		sectionHeading('Livraison'),
		infoBox(`
			<p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#546e7a;text-transform:uppercase;letter-spacing:0.5px;">${escapeHtml(deliveryModeLabel)}</p>
			${buildDeliveryDetailsHtml(delivery)}`),
		loyaltyBlock,
		hr(),
		ctaButton(orderUrl, 'Voir ma commande'),
		p('Merci de faire confiance &agrave; LOCAL&#039;ZH pour vos achats locaux.', 'text-align:center;color:#546e7a;font-size:13px;')
	].join('\n');

	const fraisText = Number(order.fraisLivraison) === 0 ? 'Gratuit' : formatPrice(order.fraisLivraison);
	const text = [
		`Bonjour ${user.name || 'cher(e) client(e)'},`,
		'',
		`Votre commande #${displayedOrderNumber} a bien été confirmée !`,
		`Date : ${dateStr}`,
		`Paiement : ${paymentModeLabel}`,
		'',
		'--- Articles commandés ---',
		...items.map((item) => `${item.nom} x${item.quantite} : ${formatPrice(item.prixTTC)}`),
		'',
		`Sous-total : ${formatPrice(order.sousTotalProduits)}`,
		`Frais de livraison : ${fraisText}`,
		...(appliedVoucher ? [`Bon d'achat (${appliedVoucher.codeBon}) : -${formatPrice(appliedVoucher.valeurEuros)}`] : []),
		`Total TTC : ${formatPrice(order.prixTotal)}`,
		'',
		`--- Livraison : ${deliveryModeLabel} ---`,
		buildDeliveryDetailsText(delivery),
		'',
		...(loyalty?.gainedPoints > 0 ? [
			`Points fidélité gagnés : ${loyalty.gainedPoints}`,
			`Solde total : ${loyalty.pointsFidelite} point(s)`,
			''
		] : []),
		`Voir ma commande : ${orderUrl}`,
		'',
		"Merci de faire confiance à LOCAL'ZH !"
	].join('\n');

	await sendMail({
		to: user.email,
		subject: `Confirmation de votre commande #${displayedOrderNumber} – LOCAL'ZH`,
		text,
		html: buildEmailHtml({
			title: `Confirmation de commande #${displayedOrderNumber}`,
			preheader: `Votre commande de ${formatPrice(order.prixTotal)} est confirmée.`,
			body
		})
	});
}

export async function sendIncidentCreatedEmail({ creator, recipients, ticket }) {
	if (!recipients.length) return;

	const url = getIncidentUrl(ticket.id);

	const body = [
		p(`Un nouveau ticket a &eacute;t&eacute; cr&eacute;&eacute; par <strong>${escapeHtml(formatUserName(creator))}</strong>.`),
		infoBox(`
			<table width="100%" cellpadding="0" cellspacing="0">
				<tr>
					<td style="padding:4px 0;font-size:14px;color:#546e7a;">Titre</td>
					<td style="padding:4px 0;font-size:14px;color:#1a1a1a;text-align:right;">${escapeHtml(ticket.title)}</td>
				</tr>
				<tr>
					<td style="padding:4px 0;font-size:14px;color:#546e7a;">Module</td>
					<td style="padding:4px 0;font-size:14px;color:#1a1a1a;text-align:right;">${escapeHtml(ticket.moduleConcerne)}</td>
				</tr>
				<tr>
					<td style="padding:4px 0;font-size:14px;color:#546e7a;">S&eacute;v&eacute;rit&eacute;</td>
					<td style="padding:4px 0;font-size:14px;font-weight:600;color:#D35400;text-align:right;">${escapeHtml(ticket.severity)}</td>
				</tr>
			</table>`),
		ticket.description ? `<div style="background-color:#fff8f0;border-left:4px solid #D35400;padding:12px 16px;margin:16px 0;border-radius:0 6px 6px 0;"><p style="margin:0;font-size:14px;color:#1a1a1a;line-height:1.5;">${escapeHtml(ticket.description)}</p></div>` : '',
		ctaButton(url, 'Consulter le ticket')
	].join('');

	await sendMail({
		to: recipients,
		subject: `[LOCAL'ZH] Nouveau ticket ${ticket.severity}`,
		text: [
			`Un nouveau ticket a été créé par ${formatUserName(creator)}.`,
			'',
			`Titre : ${ticket.title}`,
			`Module : ${ticket.moduleConcerne}`,
			`Sévérité : ${ticket.severity}`,
			'',
			ticket.description,
			'',
			`Consulter le ticket : ${url}`
		].join('\n'),
		html: buildEmailHtml({
			title: `Nouveau ticket – ${ticket.severity}`,
			preheader: `Ticket "${ticket.title}" créé par ${formatUserName(creator)}.`,
			body
		})
	});
}

export async function sendIncidentReplyEmail({ recipient, responder, ticket }) {
	if (!recipient?.email) return;

	const url = getIncidentUrl(ticket.id);

	const body = [
		p(`<strong>${escapeHtml(formatUserName(responder))}</strong> a r&eacute;pondu &agrave; votre ticket.`),
		infoBox(`
			<table width="100%" cellpadding="0" cellspacing="0">
				<tr>
					<td style="font-size:14px;color:#546e7a;">Titre</td>
					<td style="font-size:14px;color:#1a1a1a;text-align:right;">${escapeHtml(ticket.title)}</td>
				</tr>
				<tr>
					<td style="font-size:14px;color:#546e7a;padding-top:6px;">Statut</td>
					<td style="font-size:14px;color:#1a1a1a;text-align:right;padding-top:6px;">${escapeHtml(ticket.status)}</td>
				</tr>
			</table>`),
		ctaButton(url, "Consulter l'échange")
	].join('');

	await sendMail({
		to: recipient.email,
		subject: "[LOCAL'ZH] Réponse à votre ticket",
		text: [
			`${formatUserName(responder)} a répondu à votre ticket.`,
			'',
			`Titre : ${ticket.title}`,
			`Statut : ${ticket.status}`,
			'',
			`Consulter l'échange : ${url}`
		].join('\n'),
		html: buildEmailHtml({
			title: 'Nouvelle réponse à votre ticket',
			preheader: `${formatUserName(responder)} a répondu à "${ticket.title}".`,
			body
		})
	});
}

export async function sendIncidentStatusEmail({ actor, recipient, ticket, previousStatus }) {
	if (!recipient?.email) return;

	const url = getIncidentUrl(ticket.id);

	const body = [
		p(`Le statut de votre ticket a &eacute;t&eacute; mis &agrave; jour par <strong>${escapeHtml(formatUserName(actor))}</strong>.`),
		infoBox(`
			<table width="100%" cellpadding="0" cellspacing="0">
				<tr>
					<td style="font-size:14px;color:#546e7a;">Titre</td>
					<td style="font-size:14px;color:#1a1a1a;text-align:right;">${escapeHtml(ticket.title)}</td>
				</tr>
				<tr>
					<td style="font-size:14px;color:#546e7a;padding-top:6px;">Ancien statut</td>
					<td style="font-size:14px;color:#546e7a;text-align:right;padding-top:6px;">${escapeHtml(previousStatus)}</td>
				</tr>
				<tr>
					<td style="font-size:14px;color:#546e7a;padding-top:6px;">Nouveau statut</td>
					<td style="font-size:14px;font-weight:600;color:#2D8635;text-align:right;padding-top:6px;">${escapeHtml(ticket.status)}</td>
				</tr>
			</table>`),
		ctaButton(url, 'Consulter le ticket')
	].join('');

	await sendMail({
		to: recipient.email,
		subject: "[LOCAL'ZH] Statut de ticket mis à jour",
		text: [
			`Le statut de votre ticket a été mis à jour par ${formatUserName(actor)}.`,
			'',
			`Titre : ${ticket.title}`,
			`Ancien statut : ${previousStatus}`,
			`Nouveau statut : ${ticket.status}`,
			'',
			`Consulter le ticket : ${url}`
		].join('\n'),
		html: buildEmailHtml({
			title: 'Statut de ticket mis à jour',
			preheader: `Votre ticket "${ticket.title}" est maintenant : ${ticket.status}.`,
			body
		})
	});
}
