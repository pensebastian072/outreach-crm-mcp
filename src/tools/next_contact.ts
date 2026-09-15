import { Database } from '../db/database';

export async function getNextContactToContact(db: Database, campaignId: number): Promise<any[]> {
    // Eligible if: company has no replies yet, and last SENT is >72h ago (or never sent),
    // and this contact has not been contacted in this campaign.
    const candidates = await db.all<any>(`
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
        WHERE c.company_id IS NOT NULL
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
    `, [campaignId, campaignId]);

    // Group by company and pick top per company
    const byCompany: { [companyId: number]: any[] } = {};
    for (const cand of candidates) {
        if (!byCompany[cand.company_id]) byCompany[cand.company_id] = [];
        byCompany[cand.company_id].push(cand);
    }

    const nextContacts: any[] = [];
    for (const companyContacts of Object.values(byCompany)) {
        nextContacts.push(companyContacts[0]); // Highest priority
    }

    return nextContacts;
}
