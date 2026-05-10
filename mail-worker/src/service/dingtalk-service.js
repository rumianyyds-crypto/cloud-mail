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

		let senderText = '';
		if (tgMsgFrom === 'only-name') {
			senderText = `**发件人**：${email.name}`;
		} else if (tgMsgFrom === 'show') {
			senderText = `**发件人**：${email.name} <${email.sendEmail}>`;
		}

		let receiverText = '';
		if (tgMsgTo === 'show') {
			receiverText = `**收件人**：${email.toEmail}`;
		}

		let bodyText = '';
		if (tgMsgText === 'show') {
			const rawText = (emailUtils.formatText(email.text) || emailUtils.htmlToText(email.content));
			bodyText = rawText.length > 500 ? rawText.substring(0, 500) + '...' : rawText;
			bodyText = `\n\n---\n\n${bodyText}`;
		}

		const textParts = [
			`### ${email.subject || '无主题'}`,
			senderText,
			receiverText,
			bodyText
		].filter(Boolean);

		const markdownText = textParts.join('\n\n');

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
					msgtype: 'actionCard',
					actionCard: {
						title: email.subject || '新邮件',
						text: markdownText,
						btnOrientation: '0',
						singleTitle: '查看邮件详情',
						singleURL: webAppUrl
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
