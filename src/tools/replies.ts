import { Database } from '../db/database';
import { AuthManager } from '../lib/auth';
import { Client } from '@microsoft/microsoft-graph-client';

export interface Reply {
    id: string;
    subject: string;
    body: string;
    from: string;
    receivedDateTime: string;
}

export async function fetchRecentReplies(
    db: Database,
    auth: AuthManager,
    campaignId: number,
    since: string
): Promise<Reply[]> {
    const graphClient = await auth.authenticate();

    // Get messages since date
    const messages = await graphClient.api('/me/messages')
        .filter(`receivedDateTime ge ${since}`)
        .select('id,subject,body,from,receivedDateTime')
        .orderby('receivedDateTime desc')
        .get();

    const replies: Reply[] = [];

    for (const msg of messages.value) {
        // Check if this is a reply to one of our messages
        const ourMessage = await db.get<{id: number; contact_id: number; campaign_id: number}>(
            'SELECT m.id, m.contact_id, m.campaign_id FROM messages m WHERE m.subject = ? AND m.campaign_id = ? AND m.status IN (?, ?, ?, ?, ?)',
            [msg.subject.replace('Re: ', ''), campaignId, 'SENT', 'REPLIED', 'INTERESTED', 'BOOKED', 'UNSUBSCRIBED']
        );

        if (ourMessage) {
            const classification = classifyReply(msg.body.content);

            replies.push({
                id: msg.id,
                subject: msg.subject,
                body: msg.body.content,
                from: msg.from.emailAddress.address,
                receivedDateTime: msg.receivedDateTime
            });

            // Insert into replies table
            await db.run(
                'INSERT INTO replies (message_id, contact_id, campaign_id, reply_text, classification, received_at) VALUES (?, ?, ?, ?, ?, ?)',
                [ourMessage.id, ourMessage.contact_id, ourMessage.campaign_id, msg.body.content, classification, msg.receivedDateTime]
            );

            // Update message status
            await db.run('UPDATE messages SET status = ? WHERE id = ?', [classification, ourMessage.id]);
        }
    }

    return replies;
}

export function classifyReply(replyText: string): string {
    const text = replyText.toLowerCase();
    
    if (text.includes('interested') || text.includes('yes') || text.includes('schedule')) {
        return 'INTERESTED';
    } else if (text.includes('booked') || text.includes('meeting scheduled')) {
        return 'BOOKED';
    } else if (text.includes('unsubscribe') || text.includes('remove') || text.includes('stop')) {
        return 'UNSUBSCRIBED';
    } else {
        return 'REPLIED';
    }
}

export async function draftCalendlyHandoffReply(
    db: Database,
    contactId: number,
    originalMessageId: number,
    calendlyLink: string
): Promise<{subject: string, body: string}> {
    const contact = await db.get<{first_name: string, last_name: string}>(
        'SELECT first_name, last_name FROM contacts WHERE id = ?',
        [contactId]
    );

    if (!contact) throw new Error('Contact not found');

    const email = {
        subject: 'Re: Your Interest in EarthX',
        body: `Dear ${contact.first_name} ${contact.last_name},

Thank you for your response. I'm glad you're interested in learning more about EarthX.

To discuss this further, please schedule a call with Thomas using this link: ${calendlyLink}

Looking forward to speaking with you!

Best regards,
[Your Name]
HQ Outreach`
    };

    // Insert as draft
    await db.run(
        'INSERT INTO messages (contact_id, subject, body, status) VALUES (?, ?, ?, ?)',
        [contactId, email.subject, email.body, 'DRAFTED']
    );

    return email;
}

export async function draftReply(
    db: Database,
    contactId: number,
    replyText: string,
    intent: string,
    stage: string
): Promise<{subject: string, body: string}> {
    const contact = await db.get<{first_name: string, last_name: string, company_name: string}>(
        `SELECT c.first_name, c.last_name, co.name as company_name
         FROM contacts c
         LEFT JOIN companies co ON c.company_id = co.id
         WHERE c.id = ?`,
        [contactId]
    );

    if (!contact) throw new Error('Contact not found');

    if (!intent) intent = classifyReply(replyText);

    let subject: string;
    let body: string;

    if (intent === 'INTERESTED') {
        subject = 'Re: EarthX Opportunity - Next Steps';
        body = `Hi ${contact.first_name},

Thanks for your interest in EarthX! We're excited to connect.

Please use this link to schedule a call: ${process.env.THOMAS_CALENDLY_LINK}

Looking forward to discussing how we can collaborate.

Best,
Thomas`;
    } else if (intent === 'NOT_NOW') {
        subject = 'Re: EarthX Follow-up';
        body = `Hi ${contact.first_name},

No worries at all. Would you be open to a follow-up in 30-60 days?

Best,
[Your Name]`;
    } else if (intent === 'NEED_INFO') {
        subject = 'Re: EarthX Details';
        body = `Hi ${contact.first_name},

EarthX is the premier sustainable innovation event, April 19–22, 2026 at Hilton Anatole in Dallas, TX.

It features Sustainable Xperience, Alt Fuel Vehicle Expo, Oceans Xperience, and more.

Who attends: Industry leaders, innovators, and decision-makers.

Why attend: Network with peers, discover cutting-edge solutions, and drive sustainable impact.

Let me know if you have specific questions!

Best,
[Your Name]`;
    } else if (intent === 'WRONG_PERSON') {
        subject = 'Re: EarthX - Right Contact?';
        body = `Hi ${contact.first_name},

Could you point me to the right person at ${contact.company_name} for EarthX discussions?

Thanks,
[Your Name]`;
    } else { // UNSUBSCRIBE
        subject = 'Re: Unsubscribe Confirmed';
        body = `Hi ${contact.first_name},

Understood. I've removed you from our outreach list.

Best,
[Your Name]`;
    }

    return { subject, body };
}
