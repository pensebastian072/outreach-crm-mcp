import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

export class Database {
    private db: sqlite3.Database;

    constructor(dbPath: string) {
        // Ensure directory exists
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        this.db = new sqlite3.Database(dbPath);
        this.db.serialize(() => {
            this.db.run('PRAGMA journal_mode=WAL;');
            this.db.run('PRAGMA synchronous=NORMAL;');
            this.db.run('PRAGMA busy_timeout=5000;');
            this.db.run('PRAGMA temp_store=MEMORY;');
            this.db.run('PRAGMA foreign_keys=ON;');
        });
    }

    async init(): Promise<void> {
        const schemaPath = path.join(__dirname, '../../schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf-8');

        await new Promise<void>((resolve, reject) => {
            this.db.exec(schema, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        await this.ensureSchema();
    }

    private async ensureSchema(): Promise<void> {
        await this.ensureColumns('companies', {
            name_for_emails: 'TEXT',
            industry: 'TEXT',
            keywords: 'TEXT',
            website: 'TEXT',
            linkedin_url: 'TEXT',
            city_state_country: 'TEXT',
            employees: 'INTEGER',
            stage: 'TEXT',
            lists: 'TEXT',
            last_contacted: 'TEXT',
            annual_revenue: 'REAL',
            total_funding: 'REAL',
            latest_funding: 'TEXT',
            latest_funding_amount: 'REAL',
            crunchbase_id: 'INTEGER',
            crunchbase_description: 'TEXT',
            crunchbase_industries: 'TEXT',
            crunchbase_headquarters_location: 'TEXT',
            crunchbase_stage: 'TEXT',
            crunchbase_founded_date: 'TEXT',
            crunchbase_number_of_employees: 'INTEGER',
            crunchbase_estimated_revenue_range: 'TEXT',
            crunchbase_total_funding_amount: 'REAL',
            match_method: 'TEXT',
            match_confidence: 'REAL',
            notes: 'TEXT'
        });

        await this.ensureColumns('contacts', {
            email_status: 'TEXT',
            person_linkedin_url: 'TEXT',
            provider_contact_id: 'TEXT',
            primary_email_last_verified_at: 'TEXT',
            priority_score: 'INTEGER',
            active: 'INTEGER DEFAULT 0',
            next_action_due_at: 'DATETIME',
            notes: 'TEXT'
        });

        await this.ensureColumns('messages', {
            subject: 'TEXT',
            body: 'TEXT',
            status: 'TEXT',
            outlook_message_id: 'TEXT',
            provider: 'TEXT',
            provider_message_id: 'TEXT',
            provider_thread_id: 'TEXT',
            provider_account_id: 'INTEGER',
            sent_at: 'DATETIME',
            is_test: 'INTEGER DEFAULT 0',
            created_at: 'DATETIME'
        });

        await this.ensureColumns('replies', {
            reply_text: 'TEXT',
            classification: 'TEXT',
            received_at: 'DATETIME'
        });
    }

    private async ensureColumns(table: string, columns: Record<string, string>): Promise<void> {
        const existing = await this.all<{ name: string }>(`PRAGMA table_info(${table})`);
        const existingNames = new Set(existing.map((col) => col.name));
        for (const [name, definition] of Object.entries(columns)) {
            if (!existingNames.has(name)) {
                await this.run(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
            }
        }
    }

    async run(sql: string, params: any[] = []): Promise<sqlite3.RunResult> {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve(this);
            });
        });
    }

    async get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row as T);
            });
        });
    }

    async all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows as T[]);
            });
        });
    }

    close(): void {
        this.db.close();
    }
}
