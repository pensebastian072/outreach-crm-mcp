import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Database } from './db/database.js';
import { AuthManager } from './lib/auth.js';
import { importContactsFromExcel, dedupeContacts } from './tools/import.js';
import { importCrunchbaseFromExcel } from './tools/import_crunchbase.js';
import { importEarthxContext } from './tools/import_earthx.js';
import { joinContactsToCompanies } from './tools/join.js';
import { rankContactsWithinCompany } from './tools/rank.js';
import { getNextContactToContact } from './tools/next_contact.js';
import { searchContacts, createSegment, listSegment } from './tools/search.js';
import { draftOutreachEmail, draftFollowupEmail, createOutlookDraft, summarizeCampaignDrafts } from './tools/email.js';
import { fetchRecentReplies, classifyReply, draftCalendlyHandoffReply, draftReply } from './tools/replies.js';
import { upsertTrackerRow } from './tools/tracker.js';
import { campaignReport } from './tools/report.js';
import { generateHormoziEmail, validateHormoziEmail, formatHormoziEmailForSending } from './lib/hormozi-framework.js';
import { ApolloClient } from './lib/apollo-integration.js';
import { InstantlyClient } from './lib/instantly-integration.js';
import dotenv from 'dotenv';

dotenv.config();

class HQOutreachServer {
    private server: Server;
    private db: Database;
    private auth: AuthManager;

    constructor() {
        this.db = new Database(process.env.DATABASE_PATH || './data/outreach.db');
        this.auth = new AuthManager(
            process.env.TENANT_ID!,
            process.env.CLIENT_ID!
        );

        this.server = new Server({
            name: 'hq-outreach-mcp',
            version: '1.0.0',
        });

        this.setupHandlers();
    }

    private setupHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: 'import_contacts_from_excel',
                        description: 'Import contacts from Excel file',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                file_path: { type: 'string' },
                                sheet_name: { type: 'string' }
                            },
                            required: ['file_path']
                        }
                    },
                    {
                        name: 'dedupe_contacts',
                        description: 'Remove duplicate contacts',
                        inputSchema: {
                            type: 'object',
                            properties: {},
                        }
                    },
                    {
                        name: 'search_contacts',
                        description: 'Search contacts with filters',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                query: { type: 'string' },
                                filters: { type: 'object' }
                            },
                            required: ['query']
                        }
                    },
                    {
                        name: 'create_segment',
                        description: 'Create a contact segment',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                name: { type: 'string' },
                                filters: { type: 'object' }
                            },
                            required: ['name', 'filters']
                        }
                    },
                    {
                        name: 'list_segment',
                        description: 'List contacts in a segment',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                segment_id: { type: 'number' }
                            },
                            required: ['segment_id']
                        }
                    },
                    {
                        name: 'draft_outreach_email',
                        description: 'Draft an outreach email',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                contact_id: { type: 'number' },
                                campaign_id: { type: 'number' },
                                template: { type: 'string', enum: ['earthx'] },
                                tone: { type: 'string' }
                            },
                            required: ['contact_id', 'campaign_id']
                        }
                    },
                    {
                        name: 'draft_followup_email',
                        description: 'Draft a followup email',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                contact_id: { type: 'number' },
                                campaign_id: { type: 'number' },
                                step: { type: 'number' }
                            },
                            required: ['contact_id', 'campaign_id', 'step']
                        }
                    },
                    {
                        name: 'create_outlook_draft',
                        description: 'Create Outlook draft',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                contact_id: { type: 'number' },
                                subject: { type: 'string' },
                                body: { type: 'string' }
                            },
                            required: ['contact_id', 'subject', 'body']
                        }
                    },
                    {
                        name: 'send_outlook_email',
                        description: 'Send Outlook email',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                draft_id: { type: 'string' },
                                contact_id: { type: 'number' },
                                subject: { type: 'string' },
                                body: { type: 'string' }
                            }
                        }
                    },
                    {
                        name: 'fetch_recent_replies',
                        description: 'Fetch recent replies',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                campaign_id: { type: 'number' },
                                since: { type: 'string' }
                            },
                            required: ['campaign_id', 'since']
                        }
                    },
                    {
                        name: 'classify_reply',
                        description: 'Classify a reply',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                reply_text: { type: 'string' }
                            },
                            required: ['reply_text']
                        }
                    },
                    {
                        name: 'draft_calendly_handoff_reply',
                        description: 'Draft Calendly handoff reply',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                contact_id: { type: 'number' },
                                original_message_id: { type: 'number' }
                            },
                            required: ['contact_id', 'original_message_id']
                        }
                    },
                    {
                        name: 'import_crunchbase_from_excel',
                        description: 'Import Crunchbase companies from Excel (also upserts companies list)',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                file_path: { type: 'string' },
                                sheet_name: { type: 'string' }
                            },
                            required: ['file_path']
                        }
                    },
                    {
                        name: 'import_earthx_context',
                        description: 'Import EarthX context from DOCX',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                docx_path: { type: 'string' }
                            },
                            required: ['docx_path']
                        }
                    },
                    {
                        name: 'join_contacts_to_companies',
                        description: 'Join contacts to companies using Crunchbase data',
                        inputSchema: {
                            type: 'object',
                            properties: {}
                        }
                    },
                    {
                        name: 'rank_contacts_within_company',
                        description: 'Rank contacts within companies by priority',
                        inputSchema: {
                            type: 'object',
                            properties: {}
                        }
                    },
                    {
                        name: 'get_next_contact_to_contact',
                        description: 'Get next contacts to outreach respecting cadence',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                campaign_id: { type: 'number' }
                            },
                            required: ['campaign_id']
                        }
                    },
                    {
                        name: 'draft_reply',
                        description: 'Draft a reply based on classification',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                contact_id: { type: 'number' },
                                reply_text: { type: 'string' },
                                intent: { type: 'string' },
                                stage: { type: 'string' }
                            },
                            required: ['contact_id', 'reply_text', 'intent']
                        }
                    },
                    {
                        name: 'upsert_tracker_row',
                        description: 'Upsert row in shared tracker',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                contact_id: { type: 'number' },
                                campaign_id: { type: 'number' },
                                stage: { type: 'string' },
                                owner: { type: 'string' },
                                notes: { type: 'string' }
                            },
                            required: ['contact_id', 'campaign_id', 'stage']
                        }
                    },
                    {
                        name: 'campaign_report',
                        description: 'Generate campaign report',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                campaign_id: { type: 'number' }
                            },
                            required: ['campaign_id']
                        }
                    }
                    ,
                    {

                        name: 'campaign_draft_summary',
                        description: 'Summarize selected drafts for a campaign',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                campaign_id: { type: 'number' }
                            },
                            required: ['campaign_id']
                        }
                    },
                    {
                        name: 'draft_hormozi_email',
                        description: 'Draft a Hormozi Value-First email using the new framework',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                contact_id: { type: 'number' },
                                campaign_id: { type: 'number' },
                                angle: { type: 'string', enum: ['COMPANY_FIRST', 'ROLE_FIRST', 'EVENT_FIRST'] }
                            },
                            required: ['contact_id', 'campaign_id']
                        }
                    },
                    {
                        name: 'send_to_apollo',
                        description: 'Send email through Apollo.io professional delivery platform',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                message_id: { type: 'number' },
                                schedule_for_optimal_time: { type: 'boolean' }
                            },
                            required: ['message_id']
                        }
                    }
                ]
            };
        });

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name } = request.params;
            const args = request.params.arguments as any;

            try {
                switch (name) {
                    case 'import_contacts_from_excel':
                        const importResult = await importContactsFromExcel(this.db, args.file_path, args.sheet_name);
                        return { content: [{ type: 'text', text: importResult }] };

                    case 'dedupe_contacts':
                        const dedupeResult = await dedupeContacts(this.db);
                        return { content: [{ type: 'text', text: dedupeResult }] };

                    case 'search_contacts':
                        const searchResults = await searchContacts(this.db, args.query, args.filters);
                        return { content: [{ type: 'text', text: JSON.stringify(searchResults, null, 2) }] };

                    case 'create_segment':
                        const segmentId = await createSegment(this.db, args.name, args.filters);
                        return { content: [{ type: 'text', text: `Created segment with ID: ${segmentId}` }] };

                    case 'list_segment':
                        const segmentContacts = await listSegment(this.db, args.segment_id);
                        return { content: [{ type: 'text', text: JSON.stringify(segmentContacts, null, 2) }] };

                    case 'draft_outreach_email':
                        const draft = await draftOutreachEmail(this.db, args.contact_id, args.campaign_id, args.template, args.tone);
                        return { content: [{ type: 'text', text: JSON.stringify(draft, null, 2) }] };

                    case 'draft_followup_email':
                        const followup = await draftFollowupEmail(this.db, args.contact_id, args.campaign_id, args.step);
                        return { content: [{ type: 'text', text: JSON.stringify(followup, null, 2) }] };

                    case 'create_outlook_draft':
                        const draftId = await createOutlookDraft(this.db, this.auth, args.contact_id, args.subject, args.body);
                        return { content: [{ type: 'text', text: `Created draft with ID: ${draftId}` }] };

                    case 'send_outlook_email':
                        // Mock implementation
                        return { content: [{ type: 'text', text: 'Email sent successfully (mock)' }] };

                    case 'fetch_recent_replies':
                        const replies = await fetchRecentReplies(this.db, this.auth, args.campaign_id, args.since);
                        return { content: [{ type: 'text', text: JSON.stringify(replies, null, 2) }] };

                    case 'classify_reply':
                        const classification = classifyReply(args.reply_text);
                        return { content: [{ type: 'text', text: classification }] };

                    case 'draft_calendly_handoff_reply':
                        const calendlyLink = process.env.THOMAS_CALENDLY_LINK!;
                        const handoff = await draftCalendlyHandoffReply(this.db, args.contact_id, args.original_message_id, calendlyLink);
                        return { content: [{ type: 'text', text: JSON.stringify(handoff, null, 2) }] };

                    case 'import_crunchbase_from_excel':
                        const crunchbaseResult = await importCrunchbaseFromExcel(this.db, args.file_path, args.sheet_name);
                        return { content: [{ type: 'text', text: crunchbaseResult }] };

                    case 'import_earthx_context':
                        const earthxFacts = await importEarthxContext(this.db, args.docx_path);
                        return { content: [{ type: 'text', text: JSON.stringify(earthxFacts, null, 2) }] };

                    case 'join_contacts_to_companies':
                        const joinResult = await joinContactsToCompanies(this.db);
                        return { content: [{ type: 'text', text: joinResult }] };

                    case 'rank_contacts_within_company':
                        const rankResult = await rankContactsWithinCompany(this.db);
                        return { content: [{ type: 'text', text: rankResult }] };

                    case 'get_next_contact_to_contact':
                        const nextContacts = await getNextContactToContact(this.db, args.campaign_id);
                        return { content: [{ type: 'text', text: JSON.stringify(nextContacts, null, 2) }] };

                    case 'draft_reply':
                        const replyDraft = await draftReply(this.db, args.contact_id, args.reply_text, args.intent, args.stage);
                        return { content: [{ type: 'text', text: JSON.stringify(replyDraft, null, 2) }] };

                    case 'upsert_tracker_row':
                        await upsertTrackerRow(args.contact_id, args.campaign_id, args.stage, args.owner, args.notes);
                        return { content: [{ type: 'text', text: 'Tracker updated' }] };

                    case 'campaign_report':
                        const report = await campaignReport(this.db, args.campaign_id);
                        return { content: [{ type: 'text', text: JSON.stringify(report, null, 2) }] };

                    case 'campaign_draft_summary':
                        const summary = await summarizeCampaignDrafts(this.db, args.campaign_id);
                        return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] };

                    case 'draft_hormozi_email':
                        const contact = await this.db.get(`
                            SELECT 
                                c.id,
                                c.first_name,
                                c.last_name,
                                c.title,
                                c.email,
                                co.name as company_name,
                                co.industry
                            FROM contacts c
                            LEFT JOIN companies co ON c.company_id = co.id
                            WHERE c.id = ?
                        `, [args.contact_id]);
                        if (!contact) {
                            return { content: [{ type: 'text', text: 'Contact not found' }], isError: true };
                        }
                        
                        // Get EarthX context from database
                        const earthxContext = await this.db.get('SELECT * FROM earthx_context LIMIT 1');
                        
                        const hormozi = await generateHormoziEmail(
                            this.db,
                            {
                                id: contact.id,
                                firstName: contact.first_name,
                                lastName: contact.last_name,
                                email: contact.email,
                                title: contact.title,
                                companyName: contact.company_name,
                                industry: contact.industry
                            },
                            {
                                eventDate: earthxContext?.event_date || 'April 22-26, 2026',
                                eventLocation: earthxContext?.event_location || 'Dallas Convention Center',
                                eventCity: earthxContext?.event_city || 'Dallas',
                                eventYear: earthxContext?.event_year || 2026,
                                mission: earthxContext?.mission || 'Advancing Earth Solutions',
                                expectedAttendees: earthxContext?.expected_attendees || 50000
                            },
                            args.angle || 'COMPANY_FIRST'
                        );
                        
                        const validation = validateHormoziEmail(hormozi);
                        if (!validation.valid) {
                            return { content: [{ type: 'text', text: `Validation failed: ${validation.errors.join('; ')}` }], isError: true };
                        }
                        
                        return { content: [{ type: 'text', text: JSON.stringify(hormozi, null, 2) }] };

                    case 'send_to_apollo':
                        const apollo = new ApolloClient();
                        // This is a placeholder - in production, fetch message from DB and send
                        return { content: [{ type: 'text', text: 'Email queued for Apollo delivery (requires message_id lookup from DB)' }] };

                    default:
                        throw new Error(`Unknown tool: ${name}`);
                }
            } catch (error) {
                return { content: [{ type: 'text', text: `Error: ${(error as Error).message}` }], isError: true };
            }
        });
    }

    async start() {
        await this.db.init();
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('HQ Outreach MCP server started');
    }
}

const server = new HQOutreachServer();
server.start().catch(console.error);
