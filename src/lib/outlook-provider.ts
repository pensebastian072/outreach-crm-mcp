import { AuthManager } from './auth';
import { OutlookClient } from './graph-client';
import { MailProvider, SendResult, DraftResult, WatchResult, SyncResult } from './mail-provider';

export class OutlookProvider implements MailProvider {
    private client: OutlookClient;

    constructor() {
        const tenantId = process.env.MS_TENANT_ID;
        const clientId = process.env.MS_CLIENT_ID;
        const senderEmail = process.env.MS_SENDER_EMAIL;
        if (!tenantId || !clientId || !senderEmail) {
            throw new Error('Missing Microsoft Graph configuration for Outlook provider.');
        }
        const auth = new AuthManager(tenantId, clientId);
        this.client = new OutlookClient(auth, senderEmail);
    }

    async sendEmail(to: string, subject: string, body: string, contactName?: string): Promise<SendResult> {
        await this.client.sendEmail(to, subject, body, contactName);
        return {};
    }

    async createDraft(to: string, subject: string, body: string, contactName?: string): Promise<DraftResult> {
        const draftId = await this.client.createDraft(to, subject, body, contactName);
        return { draftId };
    }

    async sendDraft(draftId: string): Promise<void> {
        await this.client.sendDraft(draftId);
    }

    async getMessage(messageId: string): Promise<any> {
        return this.client.getDraft(messageId);
    }

    async watchMailbox(): Promise<WatchResult> {
        throw new Error('Outlook watch not implemented.');
    }

    async syncReplies(): Promise<SyncResult> {
        throw new Error('Outlook reply sync not implemented.');
    }
}
