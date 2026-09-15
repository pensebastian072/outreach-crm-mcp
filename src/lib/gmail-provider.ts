import { google, gmail_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { Database } from '../db/database';
import { MailProvider, SendResult, DraftResult, WatchResult, SyncResult } from './mail-provider';
import { decryptToken, encryptToken } from './token-crypto';

export interface EmailAccount {
    id: number;
    provider: string;
    email: string;
    access_token?: string | null;
    refresh_token?: string | null;
    token_expires_at?: string | null;
    scopes?: string | null;
    is_active?: number;
}

function createOAuthClient(): OAuth2Client {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
        throw new Error('Missing Google OAuth configuration. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI.');
    }

    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function base64UrlEncode(value: Buffer | string): string {
    const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
    return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function buildRawEmail(to: string, from: string, subject: string, body: string, contactName?: string): string {
    const toHeader = contactName ? `${contactName} <${to}>` : to;
    const lines = [
        `To: ${toHeader}`,
        `From: ${from}`,
        `Subject: ${subject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset="UTF-8"',
        '',
        body
    ];
    return base64UrlEncode(lines.join('\r\n'));
}

function extractHeader(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string | null {
    if (!headers) return null;
    const header = headers.find(h => h.name?.toLowerCase() === name.toLowerCase());
    return header?.value || null;
}

function parseEmailAddress(value: string | null): string | null {
    if (!value) return null;
    const angle = value.match(/<([^>]+)>/);
    if (angle && angle[1]) return angle[1].trim();
    const plain = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return plain ? plain[0].trim() : null;
}

export class GmailProvider implements MailProvider {
    private db: Database;
    private account: EmailAccount;
    private oauth: OAuth2Client;

    constructor(db: Database, account: EmailAccount) {
        this.db = db;
        this.account = account;
        this.oauth = createOAuthClient();
        this.oauth.setCredentials({
            access_token: decryptToken(account.access_token || undefined) || undefined,
            refresh_token: decryptToken(account.refresh_token || undefined) || undefined,
            expiry_date: account.token_expires_at ? new Date(account.token_expires_at).getTime() : undefined
        });
    }

    getAuthClient(): OAuth2Client {
        return this.oauth;
    }

    private async refreshIfNeeded(): Promise<void> {
        const expiry = this.oauth.credentials.expiry_date;
        if (expiry && Date.now() < expiry - 60000) return;
        if (!this.oauth.credentials.refresh_token) return;

        const { credentials } = await this.oauth.refreshAccessToken();
        if (!credentials) return;
        this.oauth.setCredentials({
            ...this.oauth.credentials,
            access_token: credentials.access_token || this.oauth.credentials.access_token,
            refresh_token: credentials.refresh_token || this.oauth.credentials.refresh_token,
            expiry_date: credentials.expiry_date || this.oauth.credentials.expiry_date
        });

        await this.db.run(
            `UPDATE email_accounts
             SET access_token = ?, refresh_token = ?, token_expires_at = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [
                encryptToken(this.oauth.credentials.access_token || null),
                encryptToken(this.oauth.credentials.refresh_token || null),
                this.oauth.credentials.expiry_date ? new Date(this.oauth.credentials.expiry_date).toISOString() : null,
                this.account.id
            ]
        );
    }

    private getGmail(): gmail_v1.Gmail {
        return google.gmail({ version: 'v1', auth: this.oauth });
    }

    async sendEmail(to: string, subject: string, body: string, contactName?: string): Promise<SendResult> {
        await this.refreshIfNeeded();
        const gmail = this.getGmail();
        const raw = buildRawEmail(to, this.account.email, subject, body, contactName);
        const result = await gmail.users.messages.send({
            userId: 'me',
            requestBody: { raw }
        });
        return { messageId: result.data.id || undefined, threadId: result.data.threadId || undefined };
    }

    async createDraft(to: string, subject: string, body: string, contactName?: string): Promise<DraftResult> {
        await this.refreshIfNeeded();
        const gmail = this.getGmail();
        const raw = buildRawEmail(to, this.account.email, subject, body, contactName);
        const result = await gmail.users.drafts.create({
            userId: 'me',
            requestBody: { message: { raw } }
        });
        return {
            draftId: result.data.id || '',
            messageId: result.data.message?.id || undefined,
            threadId: result.data.message?.threadId || undefined
        };
    }

    async sendDraft(draftId: string): Promise<void> {
        await this.refreshIfNeeded();
        const gmail = this.getGmail();
        await gmail.users.drafts.send({
            userId: 'me',
            requestBody: { id: draftId }
        });
    }

    async getMessage(messageId: string): Promise<any> {
        await this.refreshIfNeeded();
        const gmail = this.getGmail();
        const result = await gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: 'metadata',
            metadataHeaders: ['From', 'Subject', 'Message-ID', 'In-Reply-To']
        });
        return result.data;
    }

    async watchMailbox(): Promise<WatchResult> {
        await this.refreshIfNeeded();
        const topicName = process.env.GOOGLE_PUBSUB_TOPIC;
        if (!topicName) {
            throw new Error('Missing GOOGLE_PUBSUB_TOPIC environment variable.');
        }

        const gmail = this.getGmail();
        const result = await gmail.users.watch({
            userId: 'me',
            requestBody: {
                labelIds: ['INBOX'],
                topicName
            }
        });

        const historyId = result.data.historyId || undefined;
        const expiration = result.data.expiration ? Number(result.data.expiration) : undefined;

        const existing = await this.db.get<{ id: number }>(
            'SELECT id FROM email_sync_state WHERE account_id = ?',
            [this.account.id]
        );
        if (existing?.id) {
            await this.db.run(
                `UPDATE email_sync_state
                 SET history_id = ?, watch_expiration = ?, last_sync_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                 WHERE account_id = ?`,
                [
                    historyId || null,
                    expiration ? new Date(expiration).toISOString() : null,
                    this.account.id
                ]
            );
        } else {
            await this.db.run(
                `INSERT INTO email_sync_state (account_id, provider, history_id, watch_expiration, last_sync_at)
                 VALUES (?, 'gmail', ?, ?, CURRENT_TIMESTAMP)`,
                [
                    this.account.id,
                    historyId || null,
                    expiration ? new Date(expiration).toISOString() : null
                ]
            );
        }

        return { historyId, expiration };
    }

    async syncReplies(historyId?: string): Promise<SyncResult> {
        await this.refreshIfNeeded();
        const gmail = this.getGmail();
        const syncState = await this.db.get<{ history_id?: string }>(
            'SELECT history_id FROM email_sync_state WHERE account_id = ?',
            [this.account.id]
        );
        const startHistoryId = historyId || syncState?.history_id;
        if (!startHistoryId) {
            return { processed: 0 };
        }

        let processed = 0;
        try {
            const history = await gmail.users.history.list({
                userId: 'me',
                startHistoryId,
                historyTypes: ['messageAdded']
            });

            const historyItems = history.data.history || [];
            for (const item of historyItems) {
                const added = item.messagesAdded || [];
                for (const msg of added) {
                    if (!msg.message?.id) continue;
                    const message = await gmail.users.messages.get({
                        userId: 'me',
                        id: msg.message.id,
                        format: 'metadata',
                        metadataHeaders: ['From', 'Subject']
                    });
                    const headers = message.data.payload?.headers;
                    const fromHeader = extractHeader(headers, 'From');
                    const subject = extractHeader(headers, 'Subject') || '';
                    const fromEmail = parseEmailAddress(fromHeader);
                    if (!fromEmail) continue;

                    const contact = await this.db.get<{ id: number }>(
                        'SELECT id FROM contacts WHERE lower(email) = lower(?)',
                        [fromEmail]
                    );
                    if (!contact) continue;

                    const latestMessage = await this.db.get<{ id: number }>(
                        'SELECT id FROM messages WHERE contact_id = ? ORDER BY COALESCE(sent_at, created_at) DESC LIMIT 1',
                        [contact.id]
                    );

                    if (latestMessage?.id) {
                        await this.db.run(
                            'UPDATE messages SET status = ?, provider = ?, provider_message_id = ?, provider_thread_id = ?, provider_account_id = ? WHERE id = ?',
                            ['REPLIED', 'gmail', message.data.id || null, message.data.threadId || null, this.account.id, latestMessage.id]
                        );

                        await this.db.run(
                            'INSERT INTO replies (message_id, contact_id, classification, reply_text, received_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
                            [
                                latestMessage.id,
                                contact.id,
                                'REPLIED',
                                message.data.snippet || null
                            ]
                        );
                        processed += 1;
                    }
                }
            }

            const newHistoryId = history.data.historyId || history.data.history?.slice(-1)[0]?.id;
            if (newHistoryId) {
                await this.db.run(
                    'UPDATE email_sync_state SET history_id = ?, last_sync_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE account_id = ?',
                    [newHistoryId, this.account.id]
                );
            }
            return { processed, historyId: newHistoryId || startHistoryId };
        } catch (error: any) {
            if (error?.code === 404) {
                const profile = await gmail.users.getProfile({ userId: 'me' });
                const newHistoryId = profile.data.historyId;
                if (newHistoryId) {
                    await this.db.run(
                        'UPDATE email_sync_state SET history_id = ?, last_sync_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE account_id = ?',
                        [newHistoryId, this.account.id]
                    );
                }
                return { processed: 0, historyId: newHistoryId || undefined };
            }
            throw error;
        }
    }
}
