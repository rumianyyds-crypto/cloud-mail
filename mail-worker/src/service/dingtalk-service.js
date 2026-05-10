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

		let senderContent = '';
		if (tgMsgFrom === 'show') {
			senderContent = `${email.name || emailUtils.getName(email.sendEmail)}<br>${email.sendEmail}`;
		} else if (tgMsgFrom === 'only-name') {
			senderContent = `${email.name || emailUtils.getName(email.sendEmail)}`;
		}

		let receiverContent = '';
		if (tgMsgTo === 'show') {
			receiverContent = `${email.toEmail}`;
		}

		let bodyPreview = '';
		if (tgMsgText === 'show') {
			const rawText = (emailUtils.formatText(email.text) || emailUtils.htmlToText(email.content));
			bodyPreview = rawText.length > 200 ? rawText.substring(0, 200) + '...' : rawText;
		}

		const fullText = [
			`### 📬 新邮件`,
			``,
			`**📌 主题**`,
			`**${email.subject || '无主题'}**`,
			``,
			senderContent ? `**👤 发件人**` : '',
			senderContent ? `**${senderContent}**` : '',
			``,
			receiverContent ? `**📥 收件人**` : '',
			receiverContent ? `**${receiverContent}**` : '',
			``,
			`🌐 [点击查看详情](${webAppUrl})`,
			``,
			bodyPreview ? `---` : '',
			bodyPreview ? `**📝 内容预览**` : '',
			bodyPreview
		].filter(Boolean).join('<br>');

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
						text: fullText
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
