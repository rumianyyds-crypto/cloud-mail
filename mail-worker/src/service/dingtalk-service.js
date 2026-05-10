import settingService from './setting-service';
import jwtUtils from '../utils/jwt-utils';
import domainUtils from "../utils/domain-uitls";
import emailUtils from '../utils/email-utils';

const encoder = new TextEncoder();

async function generateDingtalkSign(timestamp, secret) {
	const stringToSign = `${timestamp}\n${secret}`;
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(stringToSign));
	return encodeURIComponent(btoa(String.fromCharCode(...new Uint8Array(signature))));
}

const dingtalkService = {

	async sendEmailToBot(c, email) {

		const { dingtalkWebhook, dingtalkSecret, customDomain, tgMsgTo, tgMsgFrom, tgMsgText } = await settingService.query(c);

		if (!dingtalkWebhook) return;

		const jwtToken = await jwtUtils.generateToken(c, { emailId: email.emailId })
		const webAppUrl = customDomain ? `${domainUtils.toOssDomain(customDomain)}/api/telegram/getEmail/${jwtToken}` : 'https://www.cloudflare.com/404'

		let senderLine = '';
		if (tgMsgFrom === 'show') {
			senderLine = `📧 ${email.sendEmail}`;
		} else if (tgMsgFrom === 'only-name') {
			senderLine = `👤 ${email.name || emailUtils.getName(email.sendEmail)}`;
		}

		let receiverLine = '';
		if (tgMsgTo === 'show') {
			receiverLine = `📥 ${email.toEmail}`;
		}

		const markdownText = [
			`## 📬 新邮件`,
			``,
			`**📌 主题**`,
			`${email.subject || '无主题'}`,
			``,
			senderLine ? `**👤 发件人**` : '',
			senderLine,
			receiverLine ? `**📥 收件人**` : '',
			receiverLine,
			``
		].filter(Boolean).join('\n');

		let bodyText = '';
		if (tgMsgText === 'show') {
			const rawText = (emailUtils.formatText(email.text) || emailUtils.htmlToText(email.content));
			const preview = rawText.length > 300 ? rawText.substring(0, 300) + '...' : rawText;
			bodyText = `\n---\n\n**📝 内容预览**\n\n${preview}`;
		}

		const fullText = bodyText ? `${markdownText}\n${bodyText}` : markdownText;

		try {
			let webhookUrl = dingtalkWebhook;
			if (dingtalkSecret) {
				const timestamp = Date.now();
				const sign = await generateDingtalkSign(timestamp, dingtalkSecret);
				const separator = webhookUrl.includes('?') ? '&' : '?';
				webhookUrl = `${webhookUrl}${separator}timestamp=${timestamp}&sign=${sign}`;
			}

			console.log('准备发送钉钉请求:', webhookUrl);
			const res = await fetch(webhookUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					msgtype: 'markdown',
					markdown: {
						title: email.subject || '新邮件',
						text: `${fullText}\n\n[🌐 点击查看邮件详情](${webAppUrl})`
					}
				})
			});
			const responseText = await res.text();
			console.log(`钉钉响应状态: ${res.status}, 响应内容: ${responseText}`);
			if (!res.ok) {
				console.error(`转发钉钉失败 status: ${res.status} response: ${responseText}`);
			}
		} catch (e) {
			console.error(`转发钉钉失败:`, e.message);
		}
	}

}

export default dingtalkService;
