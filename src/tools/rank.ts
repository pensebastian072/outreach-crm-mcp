import { Database } from '../db/database';

const TITLE_SCORES: { [key: string]: number } = {
    'ceo': 100,
    'founder': 100,
    'co-founder': 100,
    'president': 100,
    'managing partner': 100,
    'coo': 92,
    'cfo': 92,
    'cto': 92,
    'evp': 86,
    'svp': 86,
    'gm': 86,
    'head of growth': 86,
    'head of partnerships': 86,
    'vp': 78,
    'director': 70,
    'head of': 70,
    'manager': 60,
    'analyst': 40,
    'associate': 40,
    'coordinator': 40
};

export async function rankContactsWithinCompany(db: Database): Promise<string> {
    const contacts = await db.all<any>('SELECT id, title, primary_email_last_verified_at FROM contacts WHERE company_id IS NOT NULL');

    for (const contact of contacts) {
        let score = 0;

        const title = contact.title?.toLowerCase() || '';
        for (const [key, baseScore] of Object.entries(TITLE_SCORES)) {
            if (title.includes(key)) {
                score = Math.max(score, baseScore);
            }
        }

        // Bonuses
        if (title.includes('partnerships') || title.includes('bizdev') || title.includes('business development') || title.includes('strategy') || title.includes('growth')) {
            score += 10;
        }

        if (contact.primary_email_last_verified_at) {
            // Assume recent if present
            score += 5;
        }

        await db.run('UPDATE contacts SET priority_score = ? WHERE id = ?', [score, contact.id]);
    }

    // Sort within company
    const companies = await db.all<{id: number}>('SELECT DISTINCT company_id FROM contacts WHERE company_id IS NOT NULL');
    for (const company of companies) {
        await db.run(
            'UPDATE contacts SET priority_score = priority_score + (SELECT COUNT(*) FROM contacts c2 WHERE c2.company_id = contacts.company_id AND c2.priority_score > contacts.priority_score) * 0.01 WHERE company_id = ?',
            [company.id]
        );
    }

    return 'Ranked all contacts';
}