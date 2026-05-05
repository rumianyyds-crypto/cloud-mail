import settingService from './setting-service';
import jwtUtils from '../utils/jwt-utils';
import domainUtils from "../utils/domain-uitls";
import emailUtils from '../utils/email-utils';

const dingtalkService = {

	async sendEmailToBot(c, email) {

		const { dingtalkWebhook, customDomain, tgMsgTo, tgMsgFrom, tgMsgText } = await settingService.query(c);

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
			// Truncate long text
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
			const res = await fetch(dingtalkWebhook, {
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
			if (!res.ok) {
				console.error(`转发钉钉失败 status: ${res.status} response: ${await res.text()}`);
			}
		} catch (e) {
			console.error(`转发钉钉失败:`, e.message);
		}
	}

}
export default dingtalkService;

