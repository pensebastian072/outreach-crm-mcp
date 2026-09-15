import { Database } from '../db/database';

export async function campaignReport(db: Database, campaignId: number): Promise<any> {
    const stats = await db.all(`
        SELECT status, COUNT(*) as count
        FROM messages
        WHERE campaign_id = ?
        GROUP BY status
    `, [campaignId]);
    const draftRows = await db.all<any>(
        `SELECT d.score, d.similarity_score, d.coverage_score, d.banned_phrase_hits
         FROM drafts d
         JOIN messages m ON d.message_id = m.id
         WHERE m.campaign_id = ? AND d.selected = 1`,
        [campaignId]
    );

    const totalContacts = await db.get<{count: number}>('SELECT COUNT(*) as count FROM contacts WHERE company_id IS NOT NULL');
    const contacted = await db.get<{count: number}>('SELECT COUNT(DISTINCT contact_id) as count FROM messages WHERE campaign_id = ? AND status IN (?, ?, ?, ?, ?)', [campaignId, 'SENT', 'REPLIED', 'INTERESTED', 'BOOKED', 'UNSUBSCRIBED']);

    let draftSummary = {
        total_selected: 0,
        avg_score: 0,
        avg_similarity: 0,
        avg_coverage: 0,
        banned_hits: 0
    };
    if (draftRows && draftRows.length > 0) {
        const totals = draftRows.reduce(
            (acc: any, r: any) => {
                acc.score += r.score || 0;
                acc.similarity += r.similarity_score || 0;
                acc.coverage += r.coverage_score || 0;
                acc.banned += r.banned_phrase_hits || 0;
                return acc;
            },
            { score: 0, similarity: 0, coverage: 0, banned: 0 }
        );
        const count = draftRows.length;
        draftSummary = {
            total_selected: count,
            avg_score: Number((totals.score / count).toFixed(2)),
            avg_similarity: Number((totals.similarity / count).toFixed(3)),
            avg_coverage: Number((totals.coverage / count).toFixed(2)),
            banned_hits: totals.banned
        };
    }

    return {
        campaignId,
        totalContacts: totalContacts?.count || 0,
        contacted: contacted?.count || 0,
        statusBreakdown: stats,
        draftSummary
    };
}