import { Database } from './db/database';
import { importContactsFromExcel } from './tools/import';
import { importCrunchbaseFromExcel } from './tools/import_crunchbase';
import { importEarthxContext } from './tools/import_earthx';
import { joinContactsToCompanies } from './tools/join';
import { rankContactsWithinCompany } from './tools/rank';
import { getNextContactToContact } from './tools/next_contact';
import { draftOutreachEmail, createOutlookDraft } from './tools/email';

async function smokeTest() {
    const db = new Database('./data/test.db');
    await db.init();

    console.log('1. Importing contacts...');
    const contactsPath = './contact list y com companies final mcp server.csv';
    const importResult = await importContactsFromExcel(db, contactsPath);
    console.log('Contacts imported:', importResult);

    console.log('2. Importing Crunchbase...');
    const crunchbasePath = './crunchbase 425 list.xlsx';
    const crunchbaseResult = await importCrunchbaseFromExcel(db, crunchbasePath);
    console.log('Crunchbase imported:', crunchbaseResult);

    console.log('3. Importing EarthX context...');
    try {
        const earthxPath = './earthx_context.docx';
        const earthxFacts = await importEarthxContext(db, earthxPath, true);
        console.log('EarthX facts:', earthxFacts);
    } catch (error) {
        console.log('EarthX import failed (expected for test data):', (error as Error).message);
        // Insert some mock EarthX context
        await db.run(
            `INSERT INTO earthx_context (key, value) VALUES (?, ?)`,
            ['mission', 'EarthX focuses on carbon capture, sustainable agriculture, and clean water technologies. We partner with innovative companies in the cleantech space.']
        );
        console.log('Inserted mock EarthX context for testing');
    }

    console.log('4. Joining contacts to companies...');
    const joinResult = await joinContactsToCompanies(db);
    console.log('Join result:', joinResult);

    console.log('5. Ranking contacts...');
    const rankResult = await rankContactsWithinCompany(db);
    console.log('Rank result:', rankResult);

    console.log('6. Creating campaign...');
    const result = await db.run('INSERT INTO campaigns (name, description) VALUES (?, ?)', ['EarthX Outreach', 'Smoke test campaign']);
    const campaignId = result.lastID!;

    console.log('7. Getting next contacts...');
    const nextContacts = await getNextContactToContact(db, campaignId);
    console.log('Next contacts:', nextContacts);

    console.log('8. Drafting emails for the last 5 companies...');
    const contactsToDraft = nextContacts.slice(-5);
    for (const contact of contactsToDraft) {
        console.log(`Drafting for ${contact.first_name} ${contact.last_name} at ${contact.company_name}...`);
        const draft = await draftOutreachEmail(db, contact.contact_id, campaignId, 'earthx', 'professional');
        console.log('Draft created with ID:', draft.messageId, 'Score:', draft.drafts.find(d => d.version === 'A' || d.version === 'B' || d.version === 'C')?.score || 'N/A');
        const usedFields = draft.drafts[0]?.used_fields_json
            ? JSON.parse(draft.drafts[0]?.used_fields_json)
            : [];
        console.log('Used fields:', usedFields);
        console.log('Coverage score:', draft.drafts[0]?.coverage_score || 0);
        console.log('Similarity score:', draft.drafts[0]?.similarity_score || 0);
        console.log('Template:', draft.drafts[0]?.template_id || 'unknown');
        console.log('');

        // Create Outlook draft (mock, since no auth)
        try {
            const outlookId = await createOutlookDraft(db, null as any, contact.contact_id, draft.subject, draft.body);
            console.log('Outlook draft created:', outlookId);
        } catch (e) {
            console.log('Outlook draft skipped (no auth):', (e as Error).message);
        }
    }

    console.log('Smoke test completed!');
    await db.close();
}

smokeTest().catch(console.error);
