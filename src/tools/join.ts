import { Database } from '../db/database';

function normalizeName(name: string): string {
    return name.toLowerCase()
        .trim()
        .replace(/[^\w\s]/g, '') // remove punctuation
        .replace(/\b(inc|llc|ltd|corp|co|company|group|holdings|systems|technologies|labs)\b/g, '') // remove suffixes
        .replace(/\s+/g, ' ') // collapse spaces
        .trim();
}

function getDomain(url: string): string | null {
    if (!url) return null;
    try {
        const urlObj = new URL(url.startsWith('http') ? url : 'https://' + url);
        return urlObj.hostname.replace('www.', '');
    } catch {
        return null;
    }
}

export async function joinContactsToCompanies(db: Database): Promise<string> {
    // Get all companies that don't have crunchbase data yet
    const companies = await db.all<any>(`
        SELECT id, name, name_for_emails, website
        FROM companies
        WHERE crunchbase_id IS NULL
    `);

    const crunchbase = await db.all<any>('SELECT id, organization_name, website, description, industries, headquarters_location, stage, founded_date, number_of_employees, estimated_revenue_range, total_funding_amount FROM crunchbase_companies');

    let joined = 0;
    let unmatched = 0;

    for (const company of companies) {
        const companyName = company.name_for_emails || company.name;
        if (!companyName) continue;

        const normalizedCompany = normalizeName(companyName);
        const companyDomain = getDomain(company.website);

        let bestMatch: any = null;
        let bestConfidence = 0;
        let matchMethod = 'unmatched';

        for (const cb of crunchbase) {
            const normalizedCb = normalizeName(cb.organization_name);
            const cbDomain = getDomain(cb.website);

            // Exact name match
            if (normalizedCompany === normalizedCb) {
                bestMatch = cb;
                bestConfidence = 1.0;
                matchMethod = 'exact_name';
                break;
            }

            // Domain match
            if (companyDomain && cbDomain && companyDomain === cbDomain) {
                if (bestConfidence < 0.9) {
                    bestMatch = cb;
                    bestConfidence = 0.9;
                    matchMethod = 'domain_match';
                }
            }

            // Fuzzy name match (simple substring)
            if (normalizedCompany.includes(normalizedCb) || normalizedCb.includes(normalizedCompany)) {
                if (bestConfidence < 0.7) {
                    bestMatch = cb;
                    bestConfidence = 0.7;
                    matchMethod = 'fuzzy_name';
                }
            }
        }

        if (bestMatch) {
            // Update company with crunchbase data
            await db.run(
                `UPDATE companies SET
                    crunchbase_id = ?,
                    crunchbase_description = ?,
                    crunchbase_industries = ?,
                    crunchbase_headquarters_location = ?,
                    crunchbase_stage = ?,
                    crunchbase_founded_date = ?,
                    crunchbase_number_of_employees = ?,
                    crunchbase_estimated_revenue_range = ?,
                    crunchbase_total_funding_amount = ?,
                    match_method = ?,
                    match_confidence = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?`,
                [bestMatch.id, bestMatch.description, bestMatch.industries, bestMatch.headquarters_location,
                 bestMatch.stage, bestMatch.founded_date, bestMatch.number_of_employees,
                 bestMatch.estimated_revenue_range, bestMatch.total_funding_amount,
                 matchMethod, bestConfidence, company.id]
            );
            joined++;
        } else {
            unmatched++;
        }
    }

    return `Joined ${joined} companies with Crunchbase data, ${unmatched} unmatched`;
}