import * as XLSX from 'xlsx';
import { Database } from '../db/database';

interface ExcelContact {
    'Company Name': string;
    'Company Name for Emails': string;
    'First Name': string;
    'Last Name': string;
    'Title': string;
    'Email': string;
    'Email Status': string;
    'Industry': string;
    'Keywords': string;
    'Website': string;
    'Person Linkedin Url': string;
    'Company Linkedin Url': string;
    'City/State/Country': string;
    '# Employees': string;
    'Stage': string;
    'Lists': string;
    'Last Contacted': string;
    'Annual Revenue': string;
    'Total Funding': string;
    'Latest Funding': string;
    'Latest Funding Amount': string;
}

export async function importContactsFromExcel(db: Database, filePath: string, sheetName?: string): Promise<string> {
    const workbook = XLSX.readFile(filePath);
    const sheet = sheetName ? workbook.Sheets[sheetName] : workbook.Sheets[workbook.SheetNames[0]];
    const data: ExcelContact[] = XLSX.utils.sheet_to_json(sheet);

    let imported = 0;
    let skipped = 0;

    for (const row of data) {
        // Skip rows with unnamed columns or missing email
        if (!row.Email || row.Email.trim() === '') continue;

        try {
            // Insert or get company
            let companyId: number;
            const existingCompany = await db.get<{id: number}>(
                'SELECT id FROM companies WHERE name = ?',
                [row['Company Name']]
            );

            if (existingCompany) {
                companyId = existingCompany.id;
            } else {
                const result = await db.run(
                    `INSERT INTO companies 
                    (name, name_for_emails, industry, keywords, website, linkedin_url, 
                     city_state_country, employees, stage, lists, last_contacted, 
                     annual_revenue, total_funding, latest_funding, latest_funding_amount) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        row['Company Name'],
                        row['Company Name for Emails'],
                        row.Industry,
                        row.Keywords,
                        row.Website,
                        row['Company Linkedin Url'],
                        row['City/State/Country'],
                        parseInt(row['# Employees']) || null,
                        row.Stage,
                        row.Lists,
                        row['Last Contacted'],
                        parseFloat(row['Annual Revenue']) || null,
                        parseFloat(row['Total Funding']) || null,
                        row['Latest Funding'],
                        parseFloat(row['Latest Funding Amount']) || null
                    ]
                );
                companyId = result.lastID!;
            }

            // Insert contact
            const existingContact = await db.get<{id: number}>(
                'SELECT id FROM contacts WHERE email = ?',
                [row.Email]
            );

            if (!existingContact) {
                await db.run(
                    `INSERT INTO contacts 
                    (company_id, first_name, last_name, title, email, email_status, person_linkedin_url) 
                    VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        companyId,
                        row['First Name'],
                        row['Last Name'],
                        row.Title,
                        row.Email,
                        row['Email Status'],
                        row['Person Linkedin Url']
                    ]
                );
                imported++;
            } else {
                skipped++;
            }
        } catch (error) {
            console.error(`Error importing row: ${error}`);
            skipped++;
        }
    }

    return `Imported ${imported} contacts, skipped ${skipped} duplicates or invalid entries.`;
}

export async function dedupeContacts(db: Database): Promise<string> {
    // Remove duplicate contacts based on email
    const result = await db.run(`
        DELETE FROM contacts 
        WHERE id NOT IN (
            SELECT MIN(id) 
            FROM contacts 
            GROUP BY email
        )
    `);

    return `Removed ${result.changes} duplicate contacts.`;
}