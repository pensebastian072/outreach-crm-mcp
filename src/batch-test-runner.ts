#!/usr/bin/env node

import { Database } from './db/database';
import { draftOutreachEmail } from './tools/email';
import { getNextContactToContact } from './tools/next_contact';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface CLIOptions {
    limit: number;
    campaign: string;
    minScore: number;
    outputDir: string;
    dryRun: boolean;
}

interface ContactResult {
    contactId: number;
    contactName: string;
    contactEmail: string;
    contactTitle: string;
    companyName: string;
    drafts: Array<{
        version: string;
        subject: string;
        body: string;
        score: number;
        template_id: string;
        angle: string;
        coverage_score: number;
        similarity_score: number;
        banned_phrase_hits: number;
        used_fields_json: string;
    }>;
    bestDraft: {
        subject: string;
        body: string;
        score: number;
        template_id: string;
        angle: string;
    };
    averageScore: number;
    status: 'APPROVED' | 'NEEDS_REVIEW';
    usedFields: string[];
    error?: string;
}

interface Summary {
    totalProcessed: number;
    averageScore: number;
    approved: number;
    needsReview: number;
    byRole: Record<string, number>;
    qualityDistribution: {
        high: number;    // >= 8
        good: number;    // 7-7.9
        needsImprovement: number; // < 7
    };
    templateUsage: Record<string, number>;
    topIssues: {
        bannedPhrases: number;
        dataAccuracy: number;
        lowCoverage: number;
    };
}

/**
 * Parse command-line arguments
 */
function parseArgs(): CLIOptions {
    const args = process.argv.slice(2);
    const options: CLIOptions = {
        limit: 50,
        campaign: `Batch Test - ${new Date().toISOString().split('T')[0]}`,
        minScore: 7,
        outputDir: 'test-results',
        dryRun: false
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--limit':
                options.limit = parseInt(args[++i], 10);
                break;
            case '--campaign':
                options.campaign = args[++i];
                break;
            case '--min-score':
                options.minScore = parseFloat(args[++i]);
                break;
            case '--output-dir':
                options.outputDir = args[++i];
                break;
            case '--dry-run':
                options.dryRun = true;
                break;
            case '--help':
                printHelp();
                process.exit(0);
        }
    }

    return options;
}

/**
 * Print help message
 */
function printHelp(): void {
    console.log(`
Batch Test Runner - Generate and evaluate outreach emails

Usage: npm run batch-test [options]

Options:
  --limit <number>       Number of contacts to process (default: 50)
  --campaign <name>      Custom campaign name (default: "Batch Test - [date]")
  --min-score <number>   Minimum approval score (default: 7)
  --output-dir <path>    Custom output directory (default: test-results)
  --dry-run              Generate emails but don't save to database
  --help                 Show this help message

Examples:
  npm run batch-test
  npm run batch-test -- --limit 25
  npm run batch-test -- --limit 75 --min-score 7.5 --campaign "Production Test 1"
  npm run batch-test -- --dry-run --limit 10
`);
}

/**
 * Create output directory with timestamp
 */
function createOutputDir(baseDir: string): string {
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0].replace('T', '_');
    const outputDir = path.join(baseDir, `batch_${timestamp}`);
    
    if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
    }
    
    fs.mkdirSync(outputDir, { recursive: true });
    return outputDir;
}

/**
 * Get or create campaign
 */
async function getOrCreateCampaign(db: Database, campaignName: string, dryRun: boolean): Promise<number> {
    if (dryRun) {
        return -1; // Dummy campaign ID for dry run
    }

    const existing = await db.get<{ id: number }>(
        'SELECT id FROM campaigns WHERE name = ?',
        [campaignName]
    );

    if (existing) {
        return existing.id;
    }

    const result = await db.run(
        'INSERT INTO campaigns (name, description) VALUES (?, ?)',
        [campaignName, 'Automated batch test run']
    );

    if (!result.lastID) {
        throw new Error('Failed to create campaign: no ID returned');
    }

    return result.lastID;
}

/**
 * Normalize role for categorization
 */
function normalizeRole(title: string): string {
    const normalized = title.toLowerCase();
    if (normalized.includes('ceo') || normalized.includes('chief executive')) return 'CEO';
    if (normalized.includes('cto') || normalized.includes('chief technology')) return 'CTO';
    if (normalized.includes('founder')) return 'Founder';
    if (normalized.includes('vp') || normalized.includes('vice president')) return 'VP';
    if (normalized.includes('director')) return 'Director';
    if (normalized.includes('manager')) return 'Manager';
    return 'Other';
}

/**
 * Enrich contact with email address
 */
async function enrichContactWithEmail(db: Database, contact: any): Promise<any> {
    const fullContact = await db.get<any>(
        'SELECT email FROM contacts WHERE id = ?',
        [contact.contact_id]
    );
    
    return {
        ...contact,
        email: fullContact?.email || ''
    };
}

/**
 * Process a single contact
 */
async function processContact(
    db: Database,
    contact: any,
    campaignId: number,
    minScore: number,
    dryRun: boolean,
    errors: string[]
): Promise<ContactResult | null> {
    try {
        // Validate email
        if (!contact.email || !contact.email.includes('@')) {
            errors.push(`Contact ${contact.first_name} ${contact.last_name} has invalid email: ${contact.email}`);
            return null;
        }

        // Generate drafts
        const result = await draftOutreachEmail(db, contact.contact_id, campaignId, 'earthx', 'professional');

        // Extract used fields
        let usedFields: string[] = [];
        if (result.drafts && result.drafts.length > 0) {
            try {
                const fieldsJson = result.drafts[0].used_fields_json;
                usedFields = JSON.parse(fieldsJson || '[]');
            } catch (e) {
                usedFields = [];
            }
        }

        // Calculate average score
        const scores = result.drafts.map(d => d.score);
        const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

        // Find best draft
        const bestDraftData = result.drafts.reduce((best, current) => 
            current.score > best.score ? current : best
        );

        return {
            contactId: contact.contact_id,
            contactName: `${contact.first_name} ${contact.last_name}`,
            contactEmail: contact.email,
            contactTitle: contact.title,
            companyName: contact.company_name,
            drafts: result.drafts,
            bestDraft: {
                subject: bestDraftData.subject,
                body: bestDraftData.body,
                score: bestDraftData.score,
                template_id: bestDraftData.template_id,
                angle: bestDraftData.angle
            },
            averageScore: Number(avgScore.toFixed(2)),
            status: avgScore >= minScore ? 'APPROVED' : 'NEEDS_REVIEW',
            usedFields: usedFields
        };
    } catch (error) {
        const errorMsg = `Error processing contact ${contact.first_name} ${contact.last_name} (${contact.email}): ${error}`;
        errors.push(errorMsg);
        console.error(`   ❌ ${errorMsg}`);
        return null;
    }
}

/**
 * Escape CSV field
 */
function escapeCsvField(value: string | number): string {
    if (typeof value === 'number') {
        return String(value);
    }
    
    // Quote and escape if field contains comma, quote, or newline
    if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
        return `"${value.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
    }
    
    return value;
}

/**
 * Generate CSV export
 */
function generateCSV(results: ContactResult[], outputPath: string): void {
    const header = [
        'Contact Name',
        'Email',
        'Title',
        'Company',
        'Best Subject',
        'Best Body',
        'Average Score',
        'Template ID',
        'Angle',
        'Status',
        'Used Crunchbase Fields'
    ].join(',');

    const rows = results.map(r => [
        escapeCsvField(r.contactName),
        escapeCsvField(r.contactEmail),
        escapeCsvField(r.contactTitle),
        escapeCsvField(r.companyName),
        escapeCsvField(r.bestDraft.subject),
        escapeCsvField(r.bestDraft.body),
        r.averageScore,
        escapeCsvField(r.bestDraft.template_id),
        escapeCsvField(r.bestDraft.angle),
        r.status,
        escapeCsvField(r.usedFields.join(', '))
    ].join(','));

    const csv = [header, ...rows].join('\n');
    fs.writeFileSync(outputPath, csv, 'utf-8');
}

/**
 * Generate detailed JSON export
 */
function generateJSON(results: ContactResult[], outputPath: string): void {
    const data = {
        generated_at: new Date().toISOString(),
        total_contacts: results.length,
        results: results
    };

    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Generate summary report
 */
function generateSummary(results: ContactResult[], outputPath: string, summary: Summary): void {
    const report = `
Batch Test Run Summary
======================
Total Contacts Processed: ${summary.totalProcessed}
Average Score: ${summary.averageScore.toFixed(2)}
Approved (≥7): ${summary.approved} (${((summary.approved / summary.totalProcessed) * 100).toFixed(0)}%)
Needs Review (<7): ${summary.needsReview} (${((summary.needsReview / summary.totalProcessed) * 100).toFixed(0)}%)

By Role:
${Object.entries(summary.byRole)
    .sort((a, b) => b[1] - a[1])
    .map(([role, count]) => `- ${role}: ${count}`)
    .join('\n')}

Quality Distribution:
- High (≥8): ${summary.qualityDistribution.high} (${((summary.qualityDistribution.high / summary.totalProcessed) * 100).toFixed(0)}%)
- Good (7-7.9): ${summary.qualityDistribution.good} (${((summary.qualityDistribution.good / summary.totalProcessed) * 100).toFixed(0)}%)
- Needs Improvement (<7): ${summary.qualityDistribution.needsImprovement} (${((summary.qualityDistribution.needsImprovement / summary.totalProcessed) * 100).toFixed(0)}%)

Template Usage:
${Object.entries(summary.templateUsage)
    .sort((a, b) => b[1] - a[1])
    .map(([template, count]) => `- ${template}: ${count}`)
    .join('\n')}

Top Issues:
- Banned phrases detected: ${summary.topIssues.bannedPhrases}
- Data accuracy issues: ${summary.topIssues.dataAccuracy}
- Low coverage scores: ${summary.topIssues.lowCoverage}
`;

    fs.writeFileSync(outputPath, report.trim(), 'utf-8');
}

/**
 * Calculate summary statistics
 */
function calculateSummary(results: ContactResult[]): Summary {
    const summary: Summary = {
        totalProcessed: results.length,
        averageScore: 0,
        approved: 0,
        needsReview: 0,
        byRole: {},
        qualityDistribution: {
            high: 0,
            good: 0,
            needsImprovement: 0
        },
        templateUsage: {},
        topIssues: {
            bannedPhrases: 0,
            dataAccuracy: 0,
            lowCoverage: 0
        }
    };

    let totalScore = 0;

    for (const result of results) {
        totalScore += result.averageScore;

        // Count by status
        if (result.status === 'APPROVED') {
            summary.approved++;
        } else {
            summary.needsReview++;
        }

        // Count by role
        const role = normalizeRole(result.contactTitle);
        summary.byRole[role] = (summary.byRole[role] || 0) + 1;

        // Quality distribution
        if (result.averageScore >= 8) {
            summary.qualityDistribution.high++;
        } else if (result.averageScore >= 7) {
            summary.qualityDistribution.good++;
        } else {
            summary.qualityDistribution.needsImprovement++;
        }

        // Template usage
        const template = result.bestDraft.template_id;
        summary.templateUsage[template] = (summary.templateUsage[template] || 0) + 1;

        // Count issues
        for (const draft of result.drafts) {
            if (draft.banned_phrase_hits > 0) {
                summary.topIssues.bannedPhrases++;
            }
            if (draft.coverage_score < 0.5) {
                summary.topIssues.lowCoverage++;
            }
        }
    }

    summary.averageScore = totalScore / results.length;

    return summary;
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
    console.log('🚀 Starting Batch Test Run\n');

    // Parse CLI arguments
    const options = parseArgs();
    console.log(`📊 Target: ${options.limit} companies`);
    console.log(`📁 Campaign: "${options.campaign}"`);
    if (options.dryRun) {
        console.log('🔍 DRY RUN MODE - No database writes\n');
    } else {
        console.log('');
    }

    // Create output directory
    const outputDir = createOutputDir(options.outputDir);
    const timestamp = path.basename(outputDir).replace('batch_', '');

    // Initialize database
    const dbPath = process.env.DATABASE_PATH || './data/outreach.db';
    const db = new Database(dbPath);
    await db.init();

    // Create or get campaign
    let campaignId: number;
    try {
        campaignId = await getOrCreateCampaign(db, options.campaign, options.dryRun);
        if (!options.dryRun) {
            console.log(`✅ Campaign created/found: ID ${campaignId}\n`);
        }
    } catch (error) {
        console.error('❌ Failed to create campaign:', error);
        process.exit(1);
    }

    // Get eligible contacts
    console.log('🔍 Finding eligible contacts...\n');
    let candidates: any[];
    try {
        candidates = await getNextContactToContact(db, campaignId);
    } catch (error) {
        console.error('❌ Failed to get contacts:', error);
        process.exit(1);
    }

    if (candidates.length === 0) {
        console.log('⚠️  No eligible contacts found.');
        process.exit(0);
    }

    // Limit to requested number
    const contactsToProcess = candidates.slice(0, options.limit);
    console.log(`📋 Found ${candidates.length} eligible contacts, processing ${contactsToProcess.length}\n`);

    console.log('Processing contacts:');
    const results: ContactResult[] = [];
    const errors: string[] = [];

    // Process each contact
    for (let i = 0; i < contactsToProcess.length; i++) {
        const contact = contactsToProcess[i];
        const progress = `[${i + 1}/${contactsToProcess.length}]`;

        console.log(`${progress} Processing ${contact.first_name} ${contact.last_name} (${contact.title}, ${contact.company_name})...`);

        // Enrich contact with email address
        const enrichedContact = await enrichContactWithEmail(db, contact);
        
        const result = await processContact(db, enrichedContact, campaignId, options.minScore, options.dryRun, errors);

        if (result) {
            results.push(result);
            const statusEmoji = result.status === 'APPROVED' ? '✅' : '⚠️';
            console.log(`${progress} ✓ ${result.contactName} (${result.contactTitle}, ${result.companyName}) - Score: ${result.averageScore} ${statusEmoji}`);
        }
    }

    console.log('\n✅ Batch test completed!\n');

    // Calculate summary
    const summary = calculateSummary(results);

    // Generate outputs
    console.log('📝 Generating reports...');
    const csvPath = path.join(outputDir, `batch_${timestamp}.csv`);
    const jsonPath = path.join(outputDir, `batch_${timestamp}_detailed.json`);
    const summaryPath = path.join(outputDir, `batch_${timestamp}_summary.txt`);

    generateCSV(results, csvPath);
    console.log(`   ✓ CSV export: ${csvPath}`);

    generateJSON(results, jsonPath);
    console.log(`   ✓ JSON export: ${jsonPath}`);

    generateSummary(results, summaryPath, summary);
    console.log(`   ✓ Summary report: ${summaryPath}`);

    // Write error log if there are errors
    if (errors.length > 0) {
        const errorPath = path.join(outputDir, `batch_${timestamp}_errors.log`);
        fs.writeFileSync(errorPath, errors.join('\n'), 'utf-8');
        console.log(`   ✓ Error log: ${errorPath}`);
    }

    // Print summary to console
    console.log('\n📊 Summary Statistics:');
    console.log(`   Total Processed: ${summary.totalProcessed}`);
    console.log(`   Average Score: ${summary.averageScore.toFixed(2)}`);
    console.log(`   Approved (≥${options.minScore}): ${summary.approved} (${((summary.approved / summary.totalProcessed) * 100).toFixed(0)}%)`);
    console.log(`   Needs Review (<${options.minScore}): ${summary.needsReview} (${((summary.needsReview / summary.totalProcessed) * 100).toFixed(0)}%)`);

    console.log('\n📁 Results exported to:', outputDir);

    // Suggest next steps
    console.log('\n💡 Next Steps:');
    if (summary.needsReview > 0) {
        console.log(`   - Review ${summary.needsReview} emails that need improvement`);
        console.log(`   - Check ${summaryPath} for detailed statistics`);
    }
    if (summary.topIssues.bannedPhrases > 0) {
        console.log(`   - ${summary.topIssues.bannedPhrases} drafts contain banned phrases`);
    }
    if (summary.topIssues.lowCoverage > 0) {
        console.log(`   - ${summary.topIssues.lowCoverage} drafts have low data coverage`);
    }
    if (summary.approved === summary.totalProcessed) {
        console.log('   ✅ All emails approved! Ready for manual review and sending.');
    }

    // Clean up
    db.close();
}

// Run the script
if (require.main === module) {
    main().catch((error) => {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    });
}
