import { Database } from '../db/database';
import { AuthManager } from '../lib/auth';
import { OutlookClient } from '../lib/graph-client';
import { ContactData, EarthXData, validateDraft } from '../lib/email-utils';
import { loadEarthXDataFromFile, saveEarthXDataToDb, loadEarthXDataFromDb } from '../lib/earthx-context-loader';
import { generateAndScoreDrafts, selectBestDraft, enforceDiversity, saveDraftToRecent } from '../lib/email-scoring';
import { normalizeTitle } from '../lib/title-utils';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Global Outlook client instance (lazy initialized)
let outlookClient: OutlookClient | null = null;

/**
 * Gets or creates the Outlook client with authentication.
 */
function getOutlookClient(): OutlookClient {
    if (outlookClient) return outlookClient;

    const tenantId = process.env.MS_TENANT_ID;
    const clientId = process.env.MS_CLIENT_ID;
    const senderEmail = process.env.MS_SENDER_EMAIL;

    if (!tenantId || !clientId || !senderEmail) {
        throw new Error(
            'Missing Microsoft Graph configuration. Please set MS_TENANT_ID, MS_CLIENT_ID, and MS_SENDER_EMAIL in .env file. ' +
            'See .env.example for template.'
        );
    }

    const authManager = new AuthManager(tenantId, clientId);
    outlookClient = new OutlookClient(authManager, senderEmail);
    
    return outlookClient;
}
