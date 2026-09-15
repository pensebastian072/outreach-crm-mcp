import { Database } from '../db/database';

export interface ContactSearchResult {
    id: number;
    first_name: string;
    last_name: string;
    title: string;
    email: string;
    company_name: string;
    industry: string;
}

export async function searchContacts(db: Database, query: string, filters: Record<string, any> = {}): Promise<ContactSearchResult[]> {
    let sql = `
        SELECT c.id, c.first_name, c.last_name, c.title, c.email, 
               co.name as company_name, co.industry
        FROM contacts c
        LEFT JOIN companies co ON c.company_id = co.id
        WHERE 1=1
    `;
    const params: any[] = [];

    if (query) {
        sql += ` AND (c.first_name LIKE ? OR c.last_name LIKE ? OR c.email LIKE ? OR co.name LIKE ?)`;
        const likeQuery = `%${query}%`;
        params.push(likeQuery, likeQuery, likeQuery, likeQuery);
    }

    // Add filters
    if (filters.industry) {
        sql += ` AND co.industry = ?`;
        params.push(filters.industry);
    }
    if (filters.title) {
        sql += ` AND c.title LIKE ?`;
        params.push(`%${filters.title}%`);
    }
    if (filters.company) {
        sql += ` AND co.name LIKE ?`;
        params.push(`%${filters.company}%`);
    }

    return await db.all<ContactSearchResult>(sql, params);
}

export async function createSegment(db: Database, name: string, filters: Record<string, any>): Promise<number> {
    const result = await db.run(
        'INSERT INTO segments (name, filters) VALUES (?, ?)',
        [name, JSON.stringify(filters)]
    );

    const segmentId = result.lastID!;

    // Populate segment with contacts
    const contacts = await searchContacts(db, '', filters);
    for (const contact of contacts) {
        await db.run(
            'INSERT OR IGNORE INTO segment_contacts (segment_id, contact_id) VALUES (?, ?)',
            [segmentId, contact.id]
        );
    }

    return segmentId;
}

export async function listSegment(db: Database, segmentId: number): Promise<ContactSearchResult[]> {
    const sql = `
        SELECT c.id, c.first_name, c.last_name, c.title, c.email, 
               co.name as company_name, co.industry
        FROM contacts c
        LEFT JOIN companies co ON c.company_id = co.id
        INNER JOIN segment_contacts sc ON c.id = sc.contact_id
        WHERE sc.segment_id = ?
    `;
    return await db.all<ContactSearchResult>(sql, [segmentId]);
}