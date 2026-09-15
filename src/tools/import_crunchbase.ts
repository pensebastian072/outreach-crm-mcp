import * as XLSX from 'xlsx';
import { Database } from '../db/database';

interface CrunchbaseCompany {
    'Organization Name': string;
    'Description': string;
    'Industries': string;
    'Headquarters Location': string;
    'Stage': string;
    'Website': string;
    'LinkedIn': string;
    'Founded Date': string;
    'Number of Employees': string;
    'Estimated Revenue Range': string;
    'Total Funding Amount (in USD)': string;
}

export async function importCrunchbaseFromExcel(db: Database, filePath: string, sheetName?: string): Promise<string> {
    const workbook = XLSX.readFile(filePath);
    const sheet = sheetName ? workbook.Sheets[sheetName] : workbook.Sheets[workbook.SheetNames[0]];
    const data: CrunchbaseCompany[] = XLSX.utils.sheet_to_json(sheet);

    let imported = 0;
    let skipped = 0;
    let companiesUpserted = 0;

    for (const row of data) {
        if (!row['Organization Name'] || row['Organization Name'].trim() === '') continue;

        try {
            await db.run(
                `INSERT INTO crunchbase_companies (
                    organization_name, description, industries, headquarters_location, stage,
                    website, linkedin, founded_date, number_of_employees, estimated_revenue_range, total_funding_amount
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    row['Organization Name'],
                    row.Description || null,
                    row.Industries || null,
                    row['Headquarters Location'] || null,
                    row.Stage || null,
                    row.Website || null,
                    row.LinkedIn || null,
                    row['Founded Date'] || null,
                    row['Number of Employees'] ? parseInt(row['Number of Employees']) : null,
                    row['Estimated Revenue Range'] || null,
                    row['Total Funding Amount (in USD)'] ? parseFloat(row['Total Funding Amount (in USD)'].replace(/[$,]/g, '')) : null
                ]
            );
            imported++;

            const cbRow = await db.get<{id: number}>(
                'SELECT id FROM crunchbase_companies WHERE organization_name = ? ORDER BY id DESC LIMIT 1',
                [row['Organization Name']]
            );
            const crunchbaseId = cbRow?.id || null;

            // Also upsert into companies so the company list reflects Crunchbase source of truth
            const existingCompany = await db.get<{id: number}>(
                'SELECT id FROM companies WHERE name = ?',
                [row['Organization Name']]
            );

            if (existingCompany) {
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
                        row.Website || null,
                        row.Industries || null,
                        crunchbaseId,
                        row.Description || null,
                        row.Industries || null,
                        row['Headquarters Location'] || null,
                        row.Stage || null,
                        row['Founded Date'] || null,
                        row['Number of Employees'] ? parseInt(row['Number of Employees']) : null,
                        row['Estimated Revenue Range'] || null,
                        row['Total Funding Amount (in USD)']
                            ? parseFloat(row['Total Funding Amount (in USD)'].replace(/[$,]/g, ''))
                            : null,
                        existingCompany.id
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
                        row['Organization Name'],
                        row['Organization Name'],
                        row.Industries || null,
                        row.Website || null,
                        crunchbaseId,
                        row.Description || null,
                        row.Industries || null,
                        row['Headquarters Location'] || null,
                        row.Stage || null,
                        row['Founded Date'] || null,
                        row['Number of Employees'] ? parseInt(row['Number of Employees']) : null,
                        row['Estimated Revenue Range'] || null,
                        row['Total Funding Amount (in USD)']
                            ? parseFloat(row['Total Funding Amount (in USD)'].replace(/[$,]/g, ''))
                            : null,
                        'crunchbase_seed',
                        1.0
                    ]
                );
            }

            companiesUpserted++;
        } catch (error) {
            console.error('Error importing crunchbase row:', error);
            skipped++;
        }
    }

    return `Imported ${imported} crunchbase companies, upserted ${companiesUpserted} into companies, skipped ${skipped}`;
}
