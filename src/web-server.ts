import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { Database } from './db/database.js';
import dotenv from 'dotenv';
import { draftOutreachEmail } from './tools/email.js';
import { google } from 'googleapis';
import crypto from 'crypto';
import { GmailProvider, EmailAccount } from './lib/gmail-provider';
import { getActiveEmailAccount, getActiveProvider } from './lib/provider-registry';
import { encryptToken } from './lib/token-crypto';
import { getNextContactToContact } from './tools/next_contact.js';
import multer from 'multer';
import * as XLSX from 'xlsx';

dotenv.config();

const app = express();
const port = parseInt(process.env.PORT || '8080', 10);
const upload = multer({ storage: multer.memoryStorage() });
const errorLog: Array<{ time: string; path: string; message: string }> = [];

function recordError(err: unknown, req: Request) {
    const message = err instanceof Error ? err.message : String(err);
    errorLog.unshift({ time: new Date().toISOString(), path: req.path, message });
    if (errorLog.length > 100) errorLog.pop();
}

// Constants for test email generation
const TEST_EMAIL_TEMPLATE = 'earthx';
const TEST_EMAIL_TONE = 'professional';

// Database instance
const defaultDbPath = process.env.DATABASE_PATH
    || (process.env.WEBSITE_SITE_NAME ? '/home/data/outreach.db' : './data/outreach.db');
const db = new Database(defaultDbPath);

const GMAIL_SCOPES = [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/contacts'
];

function getGoogleOAuthClient() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri) {
        throw new Error('Missing Google OAuth configuration. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI.');
    }
    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function getStateSecret(): string {
    return process.env.TOKEN_ENCRYPTION_KEY || process.env.GOOGLE_CLIENT_SECRET || 'gmail-oauth-state-fallback';
}

function createOAuthState(): string {
    const payload = JSON.stringify({ n: crypto.randomUUID(), t: Date.now() });
    const encoded = Buffer.from(payload, 'utf8').toString('base64url');
    const sig = crypto.createHmac('sha256', getStateSecret()).update(encoded).digest('base64url');
    return `${encoded}.${sig}`;
}

function verifyOAuthState(state: string): boolean {
    if (!state || !state.includes('.')) return false;
    const [encoded, sig] = state.split('.', 2);
    const expected = crypto.createHmac('sha256', getStateSecret()).update(encoded).digest('base64url');
    if (sig !== expected) return false;

    try {
        const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
        if (!payload?.t) return false;
        const ageMs = Date.now() - Number(payload.t);
        return ageMs >= 0 && ageMs <= 15 * 60 * 1000;
    } catch {
        return false;
    }
}

async function upsertEmailAccount(email: string, tokens: any, scopes: string): Promise<EmailAccount> {
    const existing = await db.get<EmailAccount>(
        'SELECT * FROM email_accounts WHERE provider = ? AND email = ?',
        ['gmail', email]
    );

    const accessToken = encryptToken(tokens.access_token || null);
    const refreshToken = tokens.refresh_token ? encryptToken(tokens.refresh_token) : (existing?.refresh_token || null);
    const expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null;

    await db.run('UPDATE email_accounts SET is_active = 0 WHERE provider = ?', ['gmail']);

    if (existing?.id) {
        await db.run(
            `UPDATE email_accounts
             SET access_token = ?, refresh_token = ?, token_expires_at = ?, scopes = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [accessToken, refreshToken, expiresAt, scopes, existing.id]
        );
        return { ...existing, access_token: accessToken, refresh_token: refreshToken, token_expires_at: expiresAt, scopes, is_active: 1 };
    }

    const result = await db.run(
        `INSERT INTO email_accounts (provider, email, access_token, refresh_token, token_expires_at, scopes, is_active)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        ['gmail', email, accessToken, refreshToken, expiresAt, scopes]
    );
    return {
        id: result.lastID!,
        provider: 'gmail',
        email,
        access_token: accessToken,
        refresh_token: refreshToken,
        token_expires_at: expiresAt,
        scopes,
        is_active: 1
    };
}

// Middleware
app.use(cors());
app.use(express.json());

// Static file hosting (works from both src and dist builds)
const staticRoot = process.env.STATIC_DIR || path.resolve(process.cwd(), 'public');
app.use(express.static(staticRoot));

// API Routes

// Health check endpoint for Azure deployment verification
app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        service: 'HQ Outreach MCP Server'
    });
});

// Basic error log endpoint for monitoring
app.get('/api/monitoring/errors', (req: Request, res: Response) => {
    res.json(errorLog.slice(0, 50));
});

// Integration status for email providers
app.get('/api/integrations/email', async (req: Request, res: Response) => {
    try {
        const account = await getActiveEmailAccount(db);
        const syncState = account
            ? await db.get(
                'SELECT history_id, watch_expiration, last_sync_at FROM email_sync_state WHERE account_id = ?',
                [account.id]
              )
            : null;

        if (!account) {
            return res.json({ account: null, sync: null });
        }

        res.json({
            account: {
                id: account.id,
                provider: account.provider,
                email: account.email,
                token_expires_at: account.token_expires_at,
                scopes: account.scopes,
                is_active: account.is_active
            },
            sync: syncState
        });
    } catch (error) {
        recordError(error, req);
        res.status(500).json({ error: 'Failed to load integration status' });
    }
});

// Gmail OAuth start
app.get('/auth/gmail/start', (req: Request, res: Response) => {
    try {
        const oauth = getGoogleOAuthClient();
        const state = createOAuthState();
        const url = oauth.generateAuthUrl({
            access_type: 'offline',
            prompt: 'consent',
            scope: GMAIL_SCOPES,
            state
        });
        res.redirect(url);
    } catch (error) {
        recordError(error, req);
        res.status(500).send('Failed to start Gmail OAuth');
    }
});

// Gmail OAuth callback
app.get('/auth/gmail/callback', async (req: Request, res: Response) => {
    try {
        const code = String(req.query.code || '');
        const state = String(req.query.state || '');
        if (!code) return res.status(400).send('Missing code');
        if (!verifyOAuthState(state)) return res.status(400).send('Invalid state');

        const oauth = getGoogleOAuthClient();
        const { tokens } = await oauth.getToken(code);
        oauth.setCredentials(tokens);

        const gmail = google.gmail({ version: 'v1', auth: oauth });
        const profile = await gmail.users.getProfile({ userId: 'me' });
        const email = profile.data.emailAddress || '';
        if (!email) return res.status(400).send('Unable to resolve Gmail account');

        const scopes = tokens.scope || GMAIL_SCOPES.join(' ');
        const account = await upsertEmailAccount(email, tokens, scopes);

        try {
            const provider = new GmailProvider(db, account);
            await provider.watchMailbox();
        } catch (watchError) {
            console.warn('Gmail watch failed:', watchError);
        }

        res.redirect('/?gmail=connected');
    } catch (error) {
        recordError(error, req);
        res.status(500).send('Gmail OAuth failed');
    }
});

// Gmail disconnect
app.post('/auth/gmail/disconnect', async (req: Request, res: Response) => {
    try {
        const account = await getActiveEmailAccount(db);
        if (account) {
            await db.run(
                'UPDATE email_accounts SET is_active = 0, access_token = NULL, refresh_token = NULL WHERE id = ?',
                [account.id]
            );
            await db.run('DELETE FROM email_sync_state WHERE account_id = ?', [account.id]);
        }
        res.json({ success: true });
    } catch (error) {
        recordError(error, req);
        res.status(500).json({ error: 'Failed to disconnect Gmail' });
    }
});

// Gmail watch renewal
app.post('/api/gmail/watch/renew', async (req: Request, res: Response) => {
    try {
        const active = await getActiveProvider(db);
        if (!active || active.account.provider !== 'gmail') {
            return res.status(400).json({ error: 'No active Gmail account' });
        }
        const result = await active.provider.watchMailbox();
        res.json({ success: true, watch: result });
    } catch (error) {
        recordError(error, req);
        res.status(500).json({ error: 'Failed to renew Gmail watch' });
    }
});

// Gmail manual sync
app.post('/api/gmail/sync', async (req: Request, res: Response) => {
    try {
        const active = await getActiveProvider(db);
        if (!active || active.account.provider !== 'gmail') {
            return res.status(400).json({ error: 'No active Gmail account' });
        }
        const result = await active.provider.syncReplies();
        res.json({ success: true, result });
    } catch (error) {
        recordError(error, req);
        res.status(500).json({ error: 'Failed to sync Gmail replies' });
    }
});

// Gmail Pub/Sub webhook
app.post('/api/gmail/webhook', async (req: Request, res: Response) => {
    try {
        const messageData = req.body?.message?.data;
        if (!messageData) return res.status(400).json({ error: 'Missing Pub/Sub payload' });

        const decoded = Buffer.from(messageData, 'base64').toString('utf8');
        const payload = JSON.parse(decoded);
        const historyId = payload.historyId;
        const active = await getActiveProvider(db);
        if (!active || active.account.provider !== 'gmail') {
            return res.status(200).json({ ok: true });
        }
        const result = await active.provider.syncReplies(historyId);
        res.json({ ok: true, result });
    } catch (error) {
        recordError(error, req);
        res.status(500).json({ error: 'Failed to handle Gmail webhook' });
    }
});

// Google Calendar event create
app.post('/api/calendar/events', async (req: Request, res: Response) => {
    try {
        const active = await getActiveProvider(db);
        if (!active || active.account.provider !== 'gmail') {
            return res.status(400).json({ error: 'No active Gmail account' });
        }
        const { contact_id, company_id, subject, start_at, end_at } = req.body;
        if (!subject || !start_at || !end_at) {
            return res.status(400).json({ error: 'Missing subject/start_at/end_at' });
        }

        const provider = active.provider as GmailProvider;
        const calendar = google.calendar({ version: 'v3', auth: provider.getAuthClient() });
        const event = await calendar.events.insert({
            calendarId: 'primary',
            requestBody: {
                summary: subject,
                start: { dateTime: start_at },
                end: { dateTime: end_at }
            }
        });

        await db.run(
            `INSERT INTO events (company_id, contact_id, provider, provider_event_id, subject, start_at, end_at, status)
             VALUES (?, ?, 'gmail', ?, ?, ?, ?, ?)`,
            [company_id || null, contact_id || null, event.data.id || null, subject, start_at, end_at, 'CREATED']
        );

        res.json({ success: true, eventId: event.data.id });
    } catch (error) {
        recordError(error, req);
        res.status(500).json({ error: 'Failed to create calendar event' });
    }
});

// Sync contacts to Google People API
app.post('/api/gmail/contacts/sync', async (req: Request, res: Response) => {
    try {
        const active = await getActiveProvider(db);
        if (!active || active.account.provider !== 'gmail') {
            return res.status(400).json({ error: 'No active Gmail account' });
        }
        const limit = Number(req.body?.limit || 0);
        const contacts = await db.all<any>(
            `SELECT c.id, c.first_name, c.last_name, c.title, c.email, c.provider_contact_id,
                    co.name as company_name
             FROM contacts c
             LEFT JOIN companies co ON c.company_id = co.id
             WHERE c.email IS NOT NULL
             ORDER BY c.id ASC`
        );

        const provider = active.provider as GmailProvider;
        const people = google.people({ version: 'v1', auth: provider.getAuthClient() });
        let processed = 0;

        for (const contact of contacts) {
            if (limit && processed >= limit) break;
            const body = {
                names: [{ givenName: contact.first_name || '', familyName: contact.last_name || '' }],
                emailAddresses: [{ value: contact.email }],
                organizations: contact.company_name ? [{ name: contact.company_name, title: contact.title || '' }] : []
            };

            if (contact.provider_contact_id) {
                await people.people.updateContact({
                    resourceName: contact.provider_contact_id,
                    updatePersonFields: 'names,emailAddresses,organizations',
                    requestBody: body as any
                });
            } else {
                const created = await people.people.createContact({
                    requestBody: body as any
                });
                await db.run(
                    'UPDATE contacts SET provider_contact_id = ? WHERE id = ?',
                    [created.data.resourceName || null, contact.id]
                );
            }
            processed += 1;
        }

        res.json({ success: true, processed });
    } catch (error) {
        recordError(error, req);
        res.status(500).json({ error: 'Failed to sync contacts' });
    }
});

// Send email via active provider
app.post('/api/email/send', async (req: Request, res: Response) => {
    try {
        const { contact_id, subject, body } = req.body;
        if (!contact_id || !subject || !body) {
            return res.status(400).json({ error: 'Missing contact_id, subject, or body' });
        }

        const contact = await db.get<any>(
            'SELECT first_name, last_name, email FROM contacts WHERE id = ?',
            [contact_id]
        );
        if (!contact?.email) {
            return res.status(400).json({ error: 'Contact missing email address' });
        }

        const active = await getActiveProvider(db);
        if (!active) {
            return res.status(400).json({ error: 'No active email provider' });
        }

        const contactName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
        const result = await active.provider.sendEmail(contact.email, subject, body, contactName);

        const insert = await db.run(
            `INSERT INTO messages
             (contact_id, subject, body, status, provider, provider_message_id, provider_thread_id, provider_account_id, sent_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
            [
                contact_id,
                subject,
                body,
                'SENT',
                active.account.provider,
                result.messageId || null,
                result.threadId || null,
                active.account.id
            ]
        );

        res.json({ success: true, message_id: insert.lastID, provider_result: result });
    } catch (error) {
        recordError(error, req);
        res.status(500).json({ error: 'Failed to send email' });
    }
});

// Create draft via active provider
app.post('/api/email/draft', async (req: Request, res: Response) => {
    try {
        const { contact_id, subject, body } = req.body;
        if (!contact_id || !subject || !body) {
            return res.status(400).json({ error: 'Missing contact_id, subject, or body' });
        }

        const contact = await db.get<any>(
            'SELECT first_name, last_name, email FROM contacts WHERE id = ?',
            [contact_id]
        );
        if (!contact?.email) {
            return res.status(400).json({ error: 'Contact missing email address' });
        }

        const active = await getActiveProvider(db);
        if (!active) {
            return res.status(400).json({ error: 'No active email provider' });
        }

        const contactName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
        const result = await active.provider.createDraft(contact.email, subject, body, contactName);

        const insert = await db.run(
            `INSERT INTO messages
             (contact_id, subject, body, status, provider, provider_message_id, provider_thread_id, provider_account_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                contact_id,
                subject,
                body,
                'DRAFTED',
                active.account.provider,
                result.messageId || null,
                result.threadId || null,
                active.account.id
            ]
        );

        res.json({ success: true, message_id: insert.lastID, provider_result: result });
    } catch (error) {
        recordError(error, req);
        res.status(500).json({ error: 'Failed to create draft' });
    }
});

// Get all contacts with company information
app.get('/api/contacts', async (req: Request, res: Response) => {
    try {
        const contacts = await db.all(`
            SELECT 
                c.id,
                c.first_name,
                c.last_name,
                c.email,
                c.title,
                c.person_linkedin_url as linkedin_url,
                c.active as status,
                c.notes,
                co.name as company_name,
                co.industry,
                co.website,
                co.employees as company_size,
                co.crunchbase_description,
                co.crunchbase_industries,
                co.crunchbase_headquarters_location,
                co.crunchbase_stage,
                co.crunchbase_number_of_employees,
                co.crunchbase_total_funding_amount,
                (
                    SELECT m.status
                    FROM messages m
                    WHERE m.contact_id = c.id
                    ORDER BY COALESCE(m.sent_at, m.created_at) DESC
                    LIMIT 1
                ) as last_message_status
            FROM contacts c
            LEFT JOIN companies co ON c.company_id = co.id
            ORDER BY c.id DESC
        `);
        res.json(contacts);
    } catch (error) {
        recordError(error, req);
        console.error('Error fetching contacts:', error);
        res.status(500).json({ error: 'Failed to fetch contacts' });
    }
});

// Get messages/outreach history
app.get('/api/messages', async (req: Request, res: Response) => {
    try {
        const messages = await db.all(`
            SELECT 
                m.id,
                m.contact_id,
                m.subject,
                m.body,
                m.status,
                m.sent_at,
                m.created_at,
                m.provider,
                m.provider_message_id,
                m.provider_thread_id,
                c.first_name,
                c.last_name,
                c.email,
                co.name as company_name
            FROM messages m
            LEFT JOIN contacts c ON m.contact_id = c.id
            LEFT JOIN companies co ON c.company_id = co.id
            ORDER BY m.created_at DESC
        `);
        res.json(messages);
    } catch (error) {
        recordError(error, req);
        console.error('Error fetching messages:', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// Get companies overview with outreach status
app.get('/api/companies', async (req: Request, res: Response) => {
    try {
        const companies = await db.all(`
            SELECT 
                co.id,
                co.name,
                co.industry,
                co.website,
                co.employees as size,
                co.total_funding as funding_total,
                co.crunchbase_description,
                co.crunchbase_industries,
                co.crunchbase_stage,
                co.crunchbase_number_of_employees,
                co.crunchbase_headquarters_location,
                co.crunchbase_total_funding_amount,
                co.notes,
                COUNT(DISTINCT c.id) as contact_count,
                COUNT(DISTINCT m.id) as message_count,
                MAX(m.sent_at) as last_contact_date,
                MAX(r.received_at) as last_reply_date
            FROM companies co
            LEFT JOIN contacts c ON c.company_id = co.id
            LEFT JOIN messages m ON m.contact_id = c.id
            LEFT JOIN replies r ON r.message_id = m.id
            GROUP BY co.id
            ORDER BY co.name
        `);
        res.json(companies);
    } catch (error) {
        recordError(error, req);
        console.error('Error fetching companies:', error);
        res.status(500).json({ error: 'Failed to fetch companies' });
    }
});

// Update company notes
app.put('/api/companies/:companyId/notes', async (req: Request, res: Response) => {
    try {
        const { companyId } = req.params;
        const { notes } = req.body;
        await db.run('UPDATE companies SET notes = ? WHERE id = ?', [notes || null, companyId]);
        res.json({ success: true });
    } catch (error) {
        recordError(error, req);
        res.status(500).json({ error: 'Failed to update company notes' });
    }
});

// Update contact notes
app.put('/api/contacts/:contactId/notes', async (req: Request, res: Response) => {
    try {
        const { contactId } = req.params;
        const { notes } = req.body;
        await db.run('UPDATE contacts SET notes = ? WHERE id = ?', [notes || null, contactId]);
        res.json({ success: true });
    } catch (error) {
        recordError(error, req);
        res.status(500).json({ error: 'Failed to update contact notes' });
    }
});

// Enrich companies from Crunchbase data by exact name match
app.post('/api/companies/enrich', async (req: Request, res: Response) => {
    try {
        const rows = await db.all<any>(`
            SELECT co.id as company_id, co.name, cb.*
            FROM companies co
            JOIN crunchbase_companies cb ON cb.organization_name = co.name
        `);
        let updated = 0;
        for (const row of rows) {
            await db.run(
                `UPDATE companies SET
                    crunchbase_id = COALESCE(?, crunchbase_id),
                    crunchbase_description = COALESCE(?, crunchbase_description),
                    crunchbase_industries = COALESCE(?, crunchbase_industries),
                    crunchbase_headquarters_location = COALESCE(?, crunchbase_headquarters_location),
                    crunchbase_stage = COALESCE(?, crunchbase_stage),
                    crunchbase_founded_date = COALESCE(?, crunchbase_founded_date),
                    crunchbase_number_of_employees = COALESCE(?, crunchbase_number_of_employees),
                    crunchbase_estimated_revenue_range = COALESCE(?, crunchbase_estimated_revenue_range),
                    crunchbase_total_funding_amount = COALESCE(?, crunchbase_total_funding_amount),
                    updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [
                    row.id,
                    row.description,
                    row.industries,
                    row.headquarters_location,
                    row.stage,
                    row.founded_date,
                    row.number_of_employees,
                    row.estimated_revenue_range,
                    row.total_funding_amount,
                    row.company_id
                ]
            );
            updated++;
        }
        res.json({ updated });
    } catch (error) {
        recordError(error, req);
        res.status(500).json({ error: 'Failed to enrich companies' });
    }
});

// Get statistics for dashboard
app.get('/api/stats', async (req: Request, res: Response) => {
    try {
        const totalContactsRow = await db.get<{count: number}>('SELECT COUNT(*) as count FROM contacts');
        const totalCompaniesRow = await db.get<{count: number}>('SELECT COUNT(*) as count FROM companies');
        const messagesSentRow = await db.get<{count: number}>('SELECT COUNT(*) as count FROM messages WHERE status = "SENT"');
        const messagesScheduledRow = await db.get<{count: number}>('SELECT COUNT(*) as count FROM messages WHERE status = "SCHEDULED"');
        const repliesReceivedRow = await db.get<{count: number}>('SELECT COUNT(*) as count FROM replies');
        const companiesReachedRow = await db.get<{count: number}>(
            'SELECT COUNT(DISTINCT c.company_id) as count FROM contacts c INNER JOIN messages m ON m.contact_id = c.id WHERE m.status = "SENT"'
        );
        const companiesNotReachedRow = await db.get<{count: number}>(
            'SELECT COUNT(DISTINCT co.id) as count FROM companies co LEFT JOIN contacts c ON c.company_id = co.id LEFT JOIN messages m ON m.contact_id = c.id WHERE m.id IS NULL'
        );

        const stats = {
            totalContacts: totalContactsRow?.count || 0,
            totalCompanies: totalCompaniesRow?.count || 0,
            messagesSent: messagesSentRow?.count || 0,
            messagesScheduled: messagesScheduledRow?.count || 0,
            repliesReceived: repliesReceivedRow?.count || 0,
            companiesReached: companiesReachedRow?.count || 0,
            companiesNotReached: companiesNotReachedRow?.count || 0
        };
        res.json(stats);
    } catch (error) {
        recordError(error, req);
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

// Get replies
app.get('/api/replies', async (req: Request, res: Response) => {
    try {
        const replies = await db.all(`
            SELECT 
                r.id,
                r.message_id,
                r.reply_text as body,
                r.classification as intent,
                r.received_at,
                m.subject,
                c.first_name,
                c.last_name,
                c.email,
                co.name as company_name
            FROM replies r
            LEFT JOIN messages m ON r.message_id = m.id
            LEFT JOIN contacts c ON m.contact_id = c.id
            LEFT JOIN companies co ON c.company_id = co.id
            ORDER BY r.received_at DESC
        `);
        res.json(replies);
    } catch (error) {
        recordError(error, req);
        console.error('Error fetching replies:', error);
        res.status(500).json({ error: 'Failed to fetch replies' });
    }
});

// Get campaign report
app.get('/api/campaigns/:campaignId/report', async (req: Request, res: Response) => {
    try {
        const campaignId = req.params.campaignId;
        const report = {
            campaign: await db.get('SELECT * FROM campaigns WHERE id = ?', [campaignId]),
            messageCount: await db.get('SELECT COUNT(*) as count FROM messages WHERE campaign_id = ?', [campaignId]),
            replyCount: await db.get('SELECT COUNT(*) as count FROM replies WHERE campaign_id = ?', [campaignId]),
            interestedCount: await db.get('SELECT COUNT(*) as count FROM replies WHERE campaign_id = ? AND classification = "INTERESTED"', [campaignId])
        };
        res.json(report);
    } catch (error) {
        recordError(error, req);
        console.error('Error fetching campaign report:', error);
        res.status(500).json({ error: 'Failed to fetch campaign report' });
    }
});

// Get contact details with full history
app.get('/api/contacts/:contactId', async (req: Request, res: Response) => {
    try {
        const contactId = req.params.contactId;
        const contact = await db.get(`
            SELECT 
                c.*,
                co.name as company_name,
                co.industry,
                co.website,
                co.employees as company_size,
                co.total_funding as funding_total
            FROM contacts c
            LEFT JOIN companies co ON c.company_id = co.id
            WHERE c.id = ?
        `, [contactId]);
        
        const messages = await db.all(`
            SELECT * FROM messages WHERE contact_id = ? ORDER BY created_at DESC
        `, [contactId]);
        
        const replies = await db.all(`
            SELECT * FROM replies WHERE contact_id = ? ORDER BY received_at DESC
        `, [contactId]);
        
        res.json({ contact, messages, replies });
    } catch (error) {
        recordError(error, req);
        console.error('Error fetching contact details:', error);
        res.status(500).json({ error: 'Failed to fetch contact details' });
    }
});

// Get next eligible contact for outreach
app.get('/api/next-contact', async (req: Request, res: Response) => {
    try {
        await db.run('INSERT OR IGNORE INTO campaigns (name) VALUES (?)', ['Default Campaign']);
        const campaign = await db.get<{id: number}>('SELECT id FROM campaigns WHERE name = ?', ['Default Campaign']);
        const nextContacts = await getNextContactToContact(db, campaign!.id);
        res.json(nextContacts);
    } catch (error) {
        recordError(error, req);
        res.status(500).json({ error: 'Failed to fetch next contact' });
    }
});

// Draft outreach emails for a contact (3 drafts)
app.post('/api/draft-outreach', async (req: Request, res: Response) => {
    try {
        const { contact_id } = req.body;
        if (!contact_id) return res.status(400).json({ error: 'contact_id is required' });
        await db.run('INSERT OR IGNORE INTO campaigns (name) VALUES (?)', ['Default Campaign']);
        const campaign = await db.get<{id: number}>('SELECT id FROM campaigns WHERE name = ?', ['Default Campaign']);
        const draft = await draftOutreachEmail(db, contact_id, campaign!.id, 'earthx', 'professional');
        res.json(draft);
    } catch (error) {
        recordError(error, req);
        res.status(500).json({ error: 'Failed to draft outreach' });
    }
});

// Analytics summary
app.get('/api/analytics/summary', async (req: Request, res: Response) => {
    try {
        const replyIntent = await db.all(`SELECT classification as intent, COUNT(*) as count FROM replies GROUP BY classification`);
        const draftSummary = await db.get(`SELECT AVG(score) as avg_score, AVG(similarity_score) as avg_similarity, AVG(coverage_score) as avg_coverage, SUM(banned_phrase_hits) as banned_hits FROM drafts WHERE selected = 1`);
        res.json({ replyIntent, draftSummary });
    } catch (error) {
        recordError(error, req);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

// Test Emails API Endpoints

// Generate test emails
app.post('/api/test-emails', async (req: Request, res: Response) => {
    try {
        const { count, company_ids } = req.body;
        const companyIds: number[] = Array.isArray(company_ids) ? company_ids.map((id: any) => parseInt(id, 10)).filter((id: number) => !Number.isNaN(id)) : [];
        
        // Validate input
        if (companyIds.length === 0 && (!count || count < 1 || count > 50)) {
            return res.status(400).json({ error: 'Count must be between 1 and 50, or provide company_ids' });
        }

        // Get or create test campaign
        await db.run('INSERT OR IGNORE INTO campaigns (name) VALUES (?)', ['Test Campaign']);
        const testCampaign = await db.get('SELECT * FROM campaigns WHERE name = ?', ['Test Campaign']);
        
        if (!testCampaign) {
            return res.status(500).json({ error: 'Failed to create or retrieve test campaign' });
        }

        const generatedEmails: any[] = [];
        const skippedCompanies: any[] = [];
        
        let eligibleContacts: any[] = [];
        if (companyIds.length > 0) {
            const placeholders = companyIds.map(() => '?').join(', ');
            eligibleContacts = await db.all<any>(`
                SELECT
                    c.id as contact_id,
                    c.company_id,
                    c.priority_score,
                    comp.name as company_name,
                    c.first_name,
                    c.last_name,
                    c.title
                FROM contacts c
                JOIN companies comp ON c.company_id = comp.id
                LEFT JOIN messages m_contact
                    ON m_contact.contact_id = c.id AND m_contact.campaign_id = ?
                LEFT JOIN messages m_company
                    ON m_company.campaign_id = ?
                   AND m_company.contact_id IN (SELECT id FROM contacts WHERE company_id = c.company_id)
                WHERE c.company_id IN (${placeholders})
                GROUP BY c.id
                HAVING
                    SUM(CASE WHEN m_contact.id IS NOT NULL THEN 1 ELSE 0 END) = 0
                    AND COUNT(DISTINCT CASE WHEN m_company.id IS NOT NULL THEN m_company.contact_id END) < 2
                    AND SUM(CASE WHEN m_company.status IN ('REPLIED', 'INTERESTED', 'BOOKED', 'UNSUBSCRIBED') THEN 1 ELSE 0 END) = 0
                    AND (
                        MAX(CASE WHEN m_company.status = 'SENT' THEN m_company.sent_at END) IS NULL
                        OR MAX(CASE WHEN m_company.status = 'SENT' THEN m_company.sent_at END) <= datetime('now', '-72 hours')
                    )
                ORDER BY c.priority_score DESC, c.id
            `, [testCampaign.id, testCampaign.id, ...companyIds]);
        } else {
            // Get eligible contacts
            eligibleContacts = await getNextContactToContact(db, testCampaign.id);
        }
        
        if (eligibleContacts.length === 0) {
            return res.status(400).json({ error: 'No eligible contacts available for testing' });
        }

        // Generate test emails
        const contactsToUse = companyIds.length > 0
            ? companyIds.map(companyId => eligibleContacts.find(c => c.company_id === companyId)).filter(Boolean)
            : eligibleContacts.slice(0, count);

        for (let i = 0; i < contactsToUse.length; i++) {
            try {
                const contact = contactsToUse[i];
                if (!contact) {
                    continue;
                }
                
                // Generate email using existing function
                const result = await draftOutreachEmail(
                    db,
                    contact.contact_id,
                    testCampaign.id,
                    TEST_EMAIL_TEMPLATE,
                    TEST_EMAIL_TONE
                );

                // Mark the message as a test
                await db.run('UPDATE messages SET is_test = 1 WHERE id = ?', [result.messageId]);

                // Get the full test email details
                const testEmail = await db.get(`
                    SELECT 
                        m.id,
                        m.subject,
                        m.body,
                        m.created_at,
                        c.first_name,
                        c.last_name,
                        c.title,
                        c.email,
                        co.id as company_id,
                        co.name as company_name
                    FROM messages m
                    LEFT JOIN contacts c ON m.contact_id = c.id
                    LEFT JOIN companies co ON c.company_id = co.id
                    WHERE m.id = ?
                `, [result.messageId]);

                // Get the best draft info
                const bestDraft = await db.get(`
                    SELECT score, template_id, angle, used_fields_json
                    FROM drafts
                    WHERE message_id = ? AND selected = 1
                `, [result.messageId]);

                generatedEmails.push({
                    ...testEmail,
                    score: bestDraft?.score,
                    template_id: bestDraft?.template_id,
                    angle: bestDraft?.angle,
                    used_fields_json: bestDraft?.used_fields_json
                });

            } catch (error) {
                console.error(`Error generating test email ${i + 1}:`, error);
                // Continue with next contact
            }
        }

        if (generatedEmails.length === 0) {
            return res.status(400).json({ error: 'No valid drafts met the minimum score of 80.' });
        }

        if (companyIds.length > 0) {
            const generatedCompanyIds = new Set(generatedEmails.map(e => e.company_id));
            for (const companyId of companyIds) {
                const company = await db.get('SELECT id, name FROM companies WHERE id = ?', [companyId]);
                if (company && !generatedCompanyIds.has(company.id)) {
                    skippedCompanies.push(company);
                }
            }
            res.json({ generated: generatedEmails, skipped: skippedCompanies });
        } else {
            res.json(generatedEmails);
        }
    } catch (error) {
        recordError(error, req);
        console.error('Error generating test emails:', error);
        res.status(500).json({ error: 'Failed to generate test emails' });
    }
});

// Get all test emails
app.get('/api/test-emails', async (req: Request, res: Response) => {
    try {
        const testEmails = await db.all(`
            SELECT 
                m.id,
                m.subject,
                m.body,
                m.created_at,
                c.first_name,
                c.last_name,
                c.title,
                c.email,
                co.id as company_id,
                co.name as company_name,
                d.score,
                d.template_id,
                d.angle,
                d.used_fields_json
            FROM messages m
            LEFT JOIN contacts c ON m.contact_id = c.id
            LEFT JOIN companies co ON c.company_id = co.id
            LEFT JOIN drafts d ON d.message_id = m.id AND d.selected = 1
            WHERE m.is_test = 1
            ORDER BY m.created_at DESC
        `);
        res.json(testEmails);
    } catch (error) {
        recordError(error, req);
        console.error('Error fetching test emails:', error);
        res.status(500).json({ error: 'Failed to fetch test emails' });
    }
});

// Delete specific test email
app.delete('/api/test-emails/:messageId', async (req: Request, res: Response) => {
    try {
        const { messageId } = req.params;
        // Delete related drafts first
        await db.run('DELETE FROM drafts WHERE message_id = ? AND message_id IN (SELECT id FROM messages WHERE is_test = 1)', [messageId]);
        // Then delete the message
        await db.run('DELETE FROM messages WHERE id = ? AND is_test = 1', [messageId]);
        res.json({ success: true });
    } catch (error) {
        recordError(error, req);
        console.error('Error deleting test email:', error);
        res.status(500).json({ error: 'Failed to delete test email' });
    }
});

// Delete all test emails
app.delete('/api/test-emails', async (req: Request, res: Response) => {
    try {
        // Delete related drafts first
        await db.run('DELETE FROM drafts WHERE message_id IN (SELECT id FROM messages WHERE is_test = 1)');
        // Then delete all test messages
        const result = await db.run('DELETE FROM messages WHERE is_test = 1');
        res.json({ success: true, deletedCount: result.changes || 0 });
    } catch (error) {
        recordError(error, req);
        console.error('Error deleting all test emails:', error);
        res.status(500).json({ error: 'Failed to delete all test emails' });
    }
});

// Serve the UI
app.get('/', (req: Request, res: Response) => {
    res.sendFile(path.join(staticRoot, 'index.html'));
});

async function renewGmailWatchIfNeeded() {
    const account = await getActiveEmailAccount(db);
    if (!account || account.provider !== 'gmail') return;
    const syncState = await db.get<{ watch_expiration?: string | null }>(
        'SELECT watch_expiration FROM email_sync_state WHERE account_id = ?',
        [account.id]
    );
    if (!syncState?.watch_expiration) return;
    const expiresAt = new Date(syncState.watch_expiration).getTime();
    const hoursLeft = (expiresAt - Date.now()) / (1000 * 60 * 60);
    if (hoursLeft > 6) return;

    const provider = new GmailProvider(db, account);
    await provider.watchMailbox();
}

// Initialize database and start server
async function startServer() {
    try {
        await db.init();
        console.log('Database initialized');
        setInterval(() => {
            renewGmailWatchIfNeeded().catch((error) => {
                console.warn('Gmail watch renewal failed:', error);
            });
        }, 60 * 60 * 1000);
        
        // Bind to 0.0.0.0 to accept connections from Azure health checks
        // Can be overridden with HOST environment variable
        const host = process.env.HOST || '0.0.0.0';
        app.listen(port, host, () => {
            console.log(`HQ Outreach Web Server running on ${host}:${port}`);
            if (host === '0.0.0.0') {
                console.log(`Access the dashboard at: http://localhost:${port}`);
            } else {
                console.log(`Access the dashboard at: http://${host}:${port}`);
            }
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
async function resetCampaignData() {
    await db.run('BEGIN');
    try {
        await db.run('DELETE FROM replies');
        await db.run('DELETE FROM drafts');
        await db.run('DELETE FROM messages');
        await db.run('DELETE FROM actions');
        await db.run('DELETE FROM segment_contacts');
        await db.run('DELETE FROM segments');
        await db.run('DELETE FROM recent_messages');
        await db.run('DELETE FROM contacts');
        await db.run('DELETE FROM companies');
        await db.run('DELETE FROM crunchbase_companies');
        await db.run('DELETE FROM campaigns');
        await db.run('COMMIT');
    } catch (error) {
        await db.run('ROLLBACK');
        throw error;
    }
}

function normalizeNumber(value: any): number | null {
    if (value === null || value === undefined || value === '') return null;
    const clean = String(value).replace(/[$,]/g, '');
    const num = Number(clean);
    return Number.isNaN(num) ? null : num;
}

function getRowValue(row: any, columnName?: string) {
    if (!columnName) return null;
    return row[columnName] ?? null;
}

app.post('/api/import/dashboard', upload.fields([
    { name: 'contact_file', maxCount: 1 },
    { name: 'crunchbase_file', maxCount: 1 }
]), async (req: Request, res: Response) => {
    try {
        const importStartedAt = Date.now();
        const contactFile = (req.files as any)?.contact_file?.[0];
        const crunchbaseFile = (req.files as any)?.crunchbase_file?.[0];
        if (!contactFile || !crunchbaseFile) {
            return res.status(400).json({ error: 'Both contact_file and crunchbase_file are required.' });
        }

        const contactMap = req.body.contact_map ? JSON.parse(req.body.contact_map) : {};
        const crunchbaseMap = req.body.crunchbase_map ? JSON.parse(req.body.crunchbase_map) : {};

        await resetCampaignData();
        await db.run('BEGIN');

        // Parse contact workbook
        const contactWorkbook = XLSX.read(contactFile.buffer, { type: 'buffer' });
        const contactSheetName = req.body.contact_sheet || contactWorkbook.SheetNames[0];
        const contactSheet = contactWorkbook.Sheets[contactSheetName];
        const contactRows: any[] = XLSX.utils.sheet_to_json(contactSheet);

        let contactsImported = 0;
        let companiesImported = 0;
        const companyNameToId = new Map<string, number>();

        console.log(`Dashboard import started. Contacts: ${contactRows.length}.`);
        for (const [index, row] of contactRows.entries()) {
            const companyName = String(getRowValue(row, contactMap.company_name) || '').trim();
            const email = String(getRowValue(row, contactMap.email) || '').trim();
            if (!companyName || !email) continue;

            let companyId = companyNameToId.get(companyName);
            if (!companyId) {
                const companyResult = await db.run(
                    `INSERT INTO companies 
                    (name, name_for_emails, industry, keywords, website, linkedin_url, 
                     city_state_country, employees, stage, lists, last_contacted, 
                     annual_revenue, total_funding, latest_funding, latest_funding_amount) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        companyName,
                        getRowValue(row, contactMap.company_name_for_emails),
                        getRowValue(row, contactMap.industry),
                        getRowValue(row, contactMap.keywords),
                        getRowValue(row, contactMap.website),
                        getRowValue(row, contactMap.company_linkedin_url),
                        getRowValue(row, contactMap.city_state_country),
                        normalizeNumber(getRowValue(row, contactMap.employees)),
                        getRowValue(row, contactMap.stage),
                        getRowValue(row, contactMap.lists),
                        getRowValue(row, contactMap.last_contacted),
                        normalizeNumber(getRowValue(row, contactMap.annual_revenue)),
                        normalizeNumber(getRowValue(row, contactMap.total_funding)),
                        getRowValue(row, contactMap.latest_funding),
                        normalizeNumber(getRowValue(row, contactMap.latest_funding_amount))
                    ]
                );
                companyId = companyResult.lastID!;
                companyNameToId.set(companyName, companyId);
                companiesImported++;
            }

            const contactResult = await db.run(
                `INSERT OR IGNORE INTO contacts 
                (company_id, first_name, last_name, title, email, email_status, person_linkedin_url) 
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    companyId,
                    getRowValue(row, contactMap.first_name),
                    getRowValue(row, contactMap.last_name),
                    getRowValue(row, contactMap.title),
                    email,
                    getRowValue(row, contactMap.email_status),
                    getRowValue(row, contactMap.person_linkedin_url)
                ]
            );
            if (contactResult.changes && contactResult.changes > 0) {
                contactsImported++;
            }

            if ((index + 1) % 200 === 0) {
                console.log(`Dashboard import progress: contacts ${index + 1}/${contactRows.length}`);
            }
        }

        // Parse crunchbase workbook
        const crunchbaseWorkbook = XLSX.read(crunchbaseFile.buffer, { type: 'buffer' });
        const crunchbaseSheetName = req.body.crunchbase_sheet || crunchbaseWorkbook.SheetNames[0];
        const crunchbaseSheet = crunchbaseWorkbook.Sheets[crunchbaseSheetName];
        const crunchbaseRows: any[] = XLSX.utils.sheet_to_json(crunchbaseSheet);

        let crunchbaseImported = 0;
        let crunchbaseCompaniesAdded = 0;

        console.log(`Dashboard import started crunchbase. Rows: ${crunchbaseRows.length}.`);
        for (const [index, row] of crunchbaseRows.entries()) {
            const orgName = String(getRowValue(row, crunchbaseMap.organization_name) || '').trim();
            if (!orgName) continue;

            const result = await db.run(
                `INSERT INTO crunchbase_companies (
                    organization_name, description, industries, headquarters_location, stage,
                    website, linkedin, founded_date, number_of_employees, estimated_revenue_range, total_funding_amount
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    orgName,
                    getRowValue(row, crunchbaseMap.description),
                    getRowValue(row, crunchbaseMap.industries),
                    getRowValue(row, crunchbaseMap.headquarters_location),
                    getRowValue(row, crunchbaseMap.stage),
                    getRowValue(row, crunchbaseMap.website),
                    getRowValue(row, crunchbaseMap.linkedin),
                    getRowValue(row, crunchbaseMap.founded_date),
                    normalizeNumber(getRowValue(row, crunchbaseMap.number_of_employees)),
                    getRowValue(row, crunchbaseMap.estimated_revenue_range),
                    normalizeNumber(getRowValue(row, crunchbaseMap.total_funding_amount))
                ]
            );
            crunchbaseImported++;

            // Upsert into companies if already present
            const companyRow = await db.get<{id: number}>('SELECT id FROM companies WHERE name = ?', [orgName]);
            if (companyRow) {
                await db.run(
                    `UPDATE companies SET
                        website = COALESCE(?, website),
                        industry = COALESCE(?, industry),
                        crunchbase_id = COALESCE(?, crunchbase_id),
                        crunchbase_description = COALESCE(?, crunchbase_description),
                        crunchbase_industries = COALESCE(?, crunchbase_industries),
                        crunchbase_headquarters_location = COALESCE(?, crunchbase_headquarters_location),
                        crunchbase_stage = COALESCE(?, crunchbase_stage),
                        crunchbase_founded_date = COALESCE(?, crunchbase_founded_date),
                        crunchbase_number_of_employees = COALESCE(?, crunchbase_number_of_employees),
                        crunchbase_estimated_revenue_range = COALESCE(?, crunchbase_estimated_revenue_range),
                        crunchbase_total_funding_amount = COALESCE(?, crunchbase_total_funding_amount),
                        match_method = COALESCE(match_method, 'crunchbase_seed'),
                        match_confidence = COALESCE(match_confidence, 1.0),
                        updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?`,
                    [
                        getRowValue(row, crunchbaseMap.website),
                        getRowValue(row, crunchbaseMap.industries),
                        result.lastID,
                        getRowValue(row, crunchbaseMap.description),
                        getRowValue(row, crunchbaseMap.industries),
                        getRowValue(row, crunchbaseMap.headquarters_location),
                        getRowValue(row, crunchbaseMap.stage),
                        getRowValue(row, crunchbaseMap.founded_date),
                        normalizeNumber(getRowValue(row, crunchbaseMap.number_of_employees)),
                        getRowValue(row, crunchbaseMap.estimated_revenue_range),
                        normalizeNumber(getRowValue(row, crunchbaseMap.total_funding_amount)),
                        companyRow.id
                    ]
                );
            } else {
                await db.run(
                    `INSERT INTO companies (
                        name, name_for_emails, industry, website,
                        crunchbase_id, crunchbase_description, crunchbase_industries,
                        crunchbase_headquarters_location, crunchbase_stage, crunchbase_founded_date,
                        crunchbase_number_of_employees, crunchbase_estimated_revenue_range, crunchbase_total_funding_amount,
                        match_method, match_confidence
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        orgName,
                        orgName,
                        getRowValue(row, crunchbaseMap.industries),
                        getRowValue(row, crunchbaseMap.website),
                        result.lastID,
                        getRowValue(row, crunchbaseMap.description),
                        getRowValue(row, crunchbaseMap.industries),
                        getRowValue(row, crunchbaseMap.headquarters_location),
                        getRowValue(row, crunchbaseMap.stage),
                        getRowValue(row, crunchbaseMap.founded_date),
                        normalizeNumber(getRowValue(row, crunchbaseMap.number_of_employees)),
                        getRowValue(row, crunchbaseMap.estimated_revenue_range),
                        normalizeNumber(getRowValue(row, crunchbaseMap.total_funding_amount)),
                        'crunchbase_seed',
                        1.0
                    ]
                );
                crunchbaseCompaniesAdded++;
            }

            if ((index + 1) % 100 === 0) {
                console.log(`Dashboard import progress: crunchbase ${index + 1}/${crunchbaseRows.length}`);
            }
        }

        await db.run('COMMIT');
        console.log(`Dashboard import complete in ${Date.now() - importStartedAt}ms.`);
        res.json({
            contactsImported,
            companiesImported,
            crunchbaseImported,
            crunchbaseCompaniesAdded
        });
    } catch (error) {
        try {
            await db.run('ROLLBACK');
        } catch (rollbackError) {
            console.warn('Dashboard import rollback failed:', rollbackError);
        }
        const message = error instanceof Error ? error.message : String(error);
        recordError(error, req);
        console.error('Dashboard import failed:', message);
        res.status(500).json({ error: 'Dashboard import failed', details: message });
    }
});
