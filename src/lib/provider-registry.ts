import { Database } from '../db/database';
import { MailProvider } from './mail-provider';
import { GmailProvider, EmailAccount } from './gmail-provider';
import { OutlookProvider } from './outlook-provider';

export interface ActiveProvider {
    provider: MailProvider;
    account: EmailAccount;
}

export async function getActiveEmailAccount(db: Database): Promise<EmailAccount | null> {
    const account = await db.get<EmailAccount>(
        `SELECT id, provider, email, access_token, refresh_token, token_expires_at, scopes, is_active
         FROM email_accounts
         WHERE is_active = 1
         ORDER BY updated_at DESC
         LIMIT 1`
    );
    return account || null;
}

export async function getActiveProvider(db: Database): Promise<ActiveProvider | null> {
    const account = await getActiveEmailAccount(db);
    if (!account) return null;

    if (account.provider === 'gmail') {
        return { provider: new GmailProvider(db, account), account };
    }
    if (account.provider === 'outlook') {
        return { provider: new OutlookProvider(), account };
    }
    return null;
}
