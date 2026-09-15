-- SQLite schema for HQ Outreach MCP

-- Companies table
CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    name_for_emails TEXT,
    industry TEXT,
    keywords TEXT,
    website TEXT,
    linkedin_url TEXT,
    city_state_country TEXT,
    employees INTEGER,
    stage TEXT,
    lists TEXT,
    last_contacted TEXT,
    annual_revenue REAL,
    total_funding REAL,
    latest_funding TEXT,
    latest_funding_amount REAL,
    -- Crunchbase fields
    crunchbase_id INTEGER,
    crunchbase_description TEXT,
    crunchbase_industries TEXT,
    crunchbase_headquarters_location TEXT,
    crunchbase_stage TEXT,
    crunchbase_founded_date TEXT,
    crunchbase_number_of_employees INTEGER,
    crunchbase_estimated_revenue_range TEXT,
    crunchbase_total_funding_amount REAL,
    match_method TEXT, -- exact_name | fuzzy_name | domain_match | unmatched
    match_confidence REAL, -- 0-1
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Contacts table
CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER,
    first_name TEXT,
    last_name TEXT,
    title TEXT,
    email TEXT UNIQUE NOT NULL,
    email_status TEXT,
    person_linkedin_url TEXT,
    provider_contact_id TEXT,
    primary_email_last_verified_at TEXT,
    priority_score INTEGER,
    active INTEGER DEFAULT 0, -- 1 if currently active contact for company
    next_action_due_at DATETIME,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id)
);

-- Campaigns table
CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER NOT NULL,
    campaign_id INTEGER,
    subject TEXT,
    body TEXT,
    status TEXT CHECK(status IN ('DRAFTED', 'SENT', 'SCHEDULED', 'REPLIED', 'INTERESTED', 'BOOKED', 'UNSUBSCRIBED', 'FAILED')),
    outlook_message_id TEXT,
    provider TEXT,
    provider_message_id TEXT,
    provider_thread_id TEXT,
    provider_account_id INTEGER,
    sent_at DATETIME,
    is_test INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contact_id) REFERENCES contacts(id),
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
);

-- Index on is_test for performance
CREATE INDEX IF NOT EXISTS idx_messages_is_test ON messages(is_test);

-- Replies table
CREATE TABLE IF NOT EXISTS replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL,
    contact_id INTEGER,
    campaign_id INTEGER,
    reply_text TEXT,
    classification TEXT,
    received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (message_id) REFERENCES messages(id),
    FOREIGN KEY (contact_id) REFERENCES contacts(id),
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
);

CREATE INDEX IF NOT EXISTS idx_replies_contact_id ON replies(contact_id);
CREATE INDEX IF NOT EXISTS idx_replies_campaign_id ON replies(campaign_id);

-- Actions table
CREATE TABLE IF NOT EXISTS actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER NOT NULL,
    action_type TEXT,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contact_id) REFERENCES contacts(id)
);

-- Segments table
CREATE TABLE IF NOT EXISTS segments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    filters TEXT, -- JSON string of filters
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Segment contacts junction
CREATE TABLE IF NOT EXISTS segment_contacts (
    segment_id INTEGER,
    contact_id INTEGER,
    PRIMARY KEY (segment_id, contact_id),
    FOREIGN KEY (segment_id) REFERENCES segments(id),
    FOREIGN KEY (contact_id) REFERENCES contacts(id)
);

-- Crunchbase companies table (for unmatched)
CREATE TABLE IF NOT EXISTS crunchbase_companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_name TEXT NOT NULL,
    description TEXT,
    industries TEXT,
    headquarters_location TEXT,
    stage TEXT,
    website TEXT,
    linkedin TEXT,
    founded_date TEXT,
    number_of_employees INTEGER,
    estimated_revenue_range TEXT,
    total_funding_amount REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- EarthX context table
CREATE TABLE IF NOT EXISTS earthx_context (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Drafts table for A/B/C versions and scores
CREATE TABLE IF NOT EXISTS drafts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL,
    version TEXT CHECK(version IN ('A', 'B', 'C')),
    subject TEXT,
    body TEXT,
    score INTEGER, -- 0-100
    selected INTEGER DEFAULT 0, -- 1 if chosen as final
    template_id TEXT, -- template used (role-based)
    title_category TEXT, -- CEO_FOUNDER, CTO_PRODUCT, etc.
    angle TEXT, -- ROLE_FIRST, COMPANY_FIRST, EVENT_FIRST
    used_fields_json TEXT, -- JSON array of field names used
    coverage_score INTEGER, -- 0-15 based on field usage
    similarity_score REAL, -- 0-1 similarity to recent emails
    banned_phrase_hits INTEGER DEFAULT 0, -- count of banned phrases found
    hash TEXT, -- unique hash for duplicate detection
    selected_highlight TEXT, -- EarthX highlight selected for this draft
    selected_attendee_type TEXT, -- attendee type selected for this draft
    subject_hash TEXT, -- hash for duplicate detection
    body_hash TEXT, -- hash for duplicate detection
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (message_id) REFERENCES messages(id)
);

-- Recent messages for similarity checking
CREATE TABLE IF NOT EXISTS recent_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    contact_id INTEGER NOT NULL,
    subject TEXT,
    body TEXT,
    subject_hash TEXT,
    body_hash TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
    FOREIGN KEY (contact_id) REFERENCES contacts(id)
);

-- Email accounts table (provider auth)
CREATE TABLE IF NOT EXISTS email_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    email TEXT NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at DATETIME,
    scopes TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Email sync state
CREATE TABLE IF NOT EXISTS email_sync_state (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    provider TEXT NOT NULL,
    history_id TEXT,
    watch_expiration DATETIME,
    last_sync_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES email_accounts(id)
);

-- Calendar events
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER,
    contact_id INTEGER,
    provider TEXT,
    provider_event_id TEXT,
    subject TEXT,
    start_at DATETIME,
    end_at DATETIME,
    status TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
