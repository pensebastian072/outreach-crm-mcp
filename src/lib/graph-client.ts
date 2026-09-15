import { Client } from '@microsoft/microsoft-graph-client';
import { AuthManager } from './auth';

export interface OutlookDraft {
  subject: string;
  body: {
    contentType: 'HTML' | 'Text';
    content: string;
  };
  toRecipients: Array<{
    emailAddress: {
      address: string;
      name?: string;
    };
  }>;
}

export interface OutlookMessage {
  id: string;
  subject: string;
  bodyPreview: string;
  sentDateTime?: string;
}

/**
 * OutlookClient wraps Microsoft Graph API operations for email drafting and sending.
 */
export class OutlookClient {
  private authManager: AuthManager;
  private senderEmail: string;

  constructor(authManager: AuthManager, senderEmail: string) {
    this.authManager = authManager;
    this.senderEmail = senderEmail;
  }

  /**
   * Creates a Graph Client instance with authentication.
   */
  private async getClient(): Promise<Client> {
    return await this.authManager.authenticate();
  }

  /**
   * Creates a draft email in Outlook.
   */
  async createDraft(
    to: string,
    subject: string,
    body: string,
    contactName?: string
  ): Promise<string> {
    const client = await this.getClient();

    const draft: OutlookDraft = {
      subject,
      body: {
        contentType: 'Text',
        content: body,
      },
      toRecipients: [
        {
          emailAddress: {
            address: to,
            name: contactName,
          },
        },
      ],
    };

    try {
      const result = await client
        .api('/me/messages')
        .post(draft);

      console.log(`✅ Draft created: ${result.id}`);
      return result.id;
    } catch (error) {
      console.error('❌ Failed to create draft:', error);
      throw new Error(`Failed to create Outlook draft: ${error}`);
    }
  }

  /**
   * Sends an email directly (without creating a draft first).
   */
  async sendEmail(
    to: string,
    subject: string,
    body: string,
    contactName?: string
  ): Promise<void> {
    const client = await this.getClient();

    const message = {
      message: {
        subject,
        body: {
          contentType: 'Text',
          content: body,
        },
        toRecipients: [
          {
            emailAddress: {
              address: to,
              name: contactName,
            },
          },
        ],
      },
    };

    try {
      await client
        .api('/me/sendMail')
        .post(message);

      console.log(`✅ Email sent to ${to}`);
    } catch (error) {
      console.error(`❌ Failed to send email to ${to}:`, error);
      throw new Error(`Failed to send email: ${error}`);
    }
  }

  /**
   * Sends an existing draft message.
   */
  async sendDraft(draftId: string): Promise<void> {
    const client = await this.getClient();

    try {
      await client
        .api(`/me/messages/${draftId}/send`)
        .post({});

      console.log(`✅ Draft ${draftId} sent`);
    } catch (error) {
      console.error(`❌ Failed to send draft ${draftId}:`, error);
      throw new Error(`Failed to send draft: ${error}`);
    }
  }

  /**
   * Retrieves a draft message by ID.
   */
  async getDraft(draftId: string): Promise<OutlookMessage> {
    const client = await this.getClient();

    try {
      const message = await client
        .api(`/me/messages/${draftId}`)
        .get();

      return message;
    } catch (error) {
      console.error(`❌ Failed to retrieve draft ${draftId}:`, error);
      throw new Error(`Failed to retrieve draft: ${error}`);
    }
  }

  /**
   * Deletes a draft message.
   */
  async deleteDraft(draftId: string): Promise<void> {
    const client = await this.getClient();

    try {
      await client
        .api(`/me/messages/${draftId}`)
        .delete();

      console.log(`✅ Draft ${draftId} deleted`);
    } catch (error) {
      console.error(`❌ Failed to delete draft ${draftId}:`, error);
      throw new Error(`Failed to delete draft: ${error}`);
    }
  }
}
