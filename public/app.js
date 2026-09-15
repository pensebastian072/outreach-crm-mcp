// API Base URL
const API_BASE = window.location.origin + '/api';

// State
let allContacts = [];
let allMessages = [];
let allCompanies = [];
let allReplies = [];
let testCompanies = [];
let selectedCompanyIds = new Set();
let contactMapping = {};
let crunchbaseMapping = {};
let companyColumns = [
    { key: 'name', label: 'Company Name' },
    { key: 'industry', label: 'Industry' },
    { key: 'country', label: 'Country' },
    { key: 'funding', label: 'Funding' },
    { key: 'size', label: 'Size' },
    { key: 'contacts', label: 'Contacts' },
    { key: 'messages', label: 'Messages Sent' },
    { key: 'last_contact', label: 'Last Contact' },
    { key: 'status', label: 'Status' },
    { key: 'quality', label: 'Data Quality' }
];

// Navigation
document.addEventListener('DOMContentLoaded', () => {
    setupNavigation();
    loadDashboard();
    setupImportHandlers();
});

function setupNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const page = btn.dataset.page;
            switchPage(page);
            
            // Update active button
            navButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
}

function switchPage(page) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    
    // Show selected page
    const pageElement = document.getElementById(`${page}-page`);
    if (pageElement) {
        pageElement.classList.add('active');
    }
    
    // Load data for the page
    switch(page) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'crm':
            loadCRMData();
            break;
        case 'tracking':
            loadTrackingData();
            break;
        case 'replies':
            loadReplies();
            break;
        case 'test':
            loadTestPage();
            break;
        case 'integrations':
            loadIntegrations();
            break;
    }
}

// Dashboard
async function loadDashboard() {
    try {
        const response = await fetch(`${API_BASE}/stats`);
        const stats = await response.json();

        const getCount = (value) => {
            if (value === null || value === undefined) return 0;
            if (typeof value === 'object' && value.count !== undefined) return value.count;
            return value;
        };
        
        document.getElementById('stat-contacts').textContent = getCount(stats.totalContacts);
        document.getElementById('stat-companies').textContent = getCount(stats.totalCompanies);
        document.getElementById('stat-messages-sent').textContent = getCount(stats.messagesSent);
        document.getElementById('stat-replies').textContent = getCount(stats.repliesReceived);
        document.getElementById('stat-companies-reached').textContent = getCount(stats.companiesReached);
        document.getElementById('stat-companies-not-reached').textContent = getCount(stats.companiesNotReached);
        await loadAnalyticsSummary();
    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

async function loadAnalyticsSummary() {
    try {
        const response = await fetch(`${API_BASE}/analytics/summary`);
        const data = await response.json();
        const draft = data.draftSummary || {};
        const scoreEl = document.getElementById('stat-avg-score');
        if (scoreEl) scoreEl.textContent = draft.avg_score ? Number(draft.avg_score).toFixed(1) : '0';
        const covEl = document.getElementById('stat-avg-coverage');
        if (covEl) covEl.textContent = draft.avg_coverage ? Number(draft.avg_coverage).toFixed(1) : '0';
        const simEl = document.getElementById('stat-avg-similarity');
        if (simEl) simEl.textContent = draft.avg_similarity ? Number(draft.avg_similarity).toFixed(2) : '0';
        const bannedEl = document.getElementById('stat-banned-hits');
        if (bannedEl) bannedEl.textContent = draft.banned_hits || 0;

        const intentSummary = document.getElementById('reply-intent-summary');
        if (intentSummary) {
            if (data.replyIntent && data.replyIntent.length > 0) {
                intentSummary.textContent = data.replyIntent.map(r => `${r.intent}: ${r.count}`).join(' | ');
            } else {
                intentSummary.textContent = 'No replies yet.';
            }
        }
    } catch (error) {
        console.error('Error loading analytics summary:', error);
    }
}

function setupImportHandlers() {
    const contactInput = document.getElementById('contact-file');
    const crunchbaseInput = document.getElementById('crunchbase-file');
    if (contactInput) {
        contactInput.addEventListener('change', () => handleFileMapping(contactInput, 'contact'));
    }
    if (crunchbaseInput) {
        crunchbaseInput.addEventListener('change', () => handleFileMapping(crunchbaseInput, 'crunchbase'));
    }
}

const CONTACT_FIELDS = [
    { key: 'company_name', label: 'Company Name' },
    { key: 'company_name_for_emails', label: 'Company Name for Emails' },
    { key: 'first_name', label: 'First Name' },
    { key: 'last_name', label: 'Last Name' },
    { key: 'title', label: 'Title' },
    { key: 'email', label: 'Email' },
    { key: 'email_status', label: 'Email Status' },
    { key: 'industry', label: 'Industry' },
    { key: 'keywords', label: 'Keywords' },
    { key: 'website', label: 'Website' },
    { key: 'person_linkedin_url', label: 'Person Linkedin Url' },
    { key: 'company_linkedin_url', label: 'Company Linkedin Url' },
    { key: 'city_state_country', label: 'City/State/Country' },
    { key: 'employees', label: '# Employees' },
    { key: 'stage', label: 'Stage' },
    { key: 'lists', label: 'Lists' },
    { key: 'last_contacted', label: 'Last Contacted' },
    { key: 'annual_revenue', label: 'Annual Revenue' },
    { key: 'total_funding', label: 'Total Funding' },
    { key: 'latest_funding', label: 'Latest Funding' },
    { key: 'latest_funding_amount', label: 'Latest Funding Amount' }
];

const CRUNCHBASE_FIELDS = [
    { key: 'organization_name', label: 'Organization Name' },
    { key: 'description', label: 'Description' },
    { key: 'industries', label: 'Industries' },
    { key: 'headquarters_location', label: 'Headquarters Location' },
    { key: 'stage', label: 'Stage' },
    { key: 'website', label: 'Website' },
    { key: 'linkedin', label: 'LinkedIn' },
    { key: 'founded_date', label: 'Founded Date' },
    { key: 'number_of_employees', label: 'Number of Employees' },
    { key: 'estimated_revenue_range', label: 'Estimated Revenue Range' },
    { key: 'total_funding_amount', label: 'Total Funding Amount (in USD)' }
];

async function handleFileMapping(input, type) {
    const file = input.files[0];
    if (!file || !window.XLSX) return;

    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    const headers = (rows[0] || []).map(h => String(h).trim()).filter(Boolean);

    if (type === 'contact') {
        contactMapping = buildMapping('contact-mapping', CONTACT_FIELDS, headers);
    } else {
        crunchbaseMapping = buildMapping('crunchbase-mapping', CRUNCHBASE_FIELDS, headers);
    }
}

function buildMapping(containerId, fields, headers) {
    const container = document.getElementById(containerId);
    if (!container) return {};
    container.innerHTML = fields.map(field => `
        <div class="mapping-row">
            <label>${field.label}</label>
            <select data-key="${field.key}">
                <option value="">(skip)</option>
                ${headers.map(h => `<option value="${h}">${h}</option>`).join('')}
            </select>
        </div>
    `).join('');

    const mapping = {};
    fields.forEach(field => {
        const select = container.querySelector(`select[data-key="${field.key}"]`);
        if (!select) return;
        const match = headers.find(h => h.toLowerCase() === field.label.toLowerCase());
        if (match) {
            select.value = match;
            mapping[field.key] = match;
        }
        select.addEventListener('change', () => {
            mapping[field.key] = select.value;
        });
    });
    return mapping;
}

async function runDashboardImport() {
    const contactFile = document.getElementById('contact-file').files[0];
    const crunchbaseFile = document.getElementById('crunchbase-file').files[0];
    const statusDiv = document.getElementById('import-status');

    if (!contactFile || !crunchbaseFile) {
        alert('Please upload both the contacts file and the Crunchbase file.');
        return;
    }

    statusDiv.textContent = 'Importing and replacing data...';
    statusDiv.style.color = '#0f766e';

    const formData = new FormData();
    formData.append('contact_file', contactFile);
    formData.append('crunchbase_file', crunchbaseFile);
    formData.append('contact_map', JSON.stringify(contactMapping));
    formData.append('crunchbase_map', JSON.stringify(crunchbaseMapping));

    try {
        const response = await fetch(`${API_BASE}/import/dashboard`, {
            method: 'POST',
            body: formData
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.details || error.error || 'Import failed');
        }
        const result = await response.json();
        statusDiv.textContent = `Import complete.`;
        const summary = document.getElementById('import-summary');
        if (summary) {
            summary.textContent = `Contacts: ${result.contactsImported} | Companies: ${result.companiesImported} | Crunchbase rows: ${result.crunchbaseImported} | Crunchbase-only companies: ${result.crunchbaseCompaniesAdded || 0}`;
        }
        await loadDashboard();
        await loadTrackingData();
        await loadCRMData();
    } catch (error) {
        console.error('Import failed:', error);
        statusDiv.textContent = `Error: ${error.message}`;
        statusDiv.style.color = '#c2410c';
    }
}

// CRM Page
async function loadCRMData() {
    await loadMessages();
    await loadContacts();
    setupContactFilters();
    setupCRMFilters();
}

async function loadMessages() {
    try {
        const response = await fetch(`${API_BASE}/messages`);
        allMessages = await response.json();
        renderMessages(allMessages);
    } catch (error) {
        console.error('Error loading messages:', error);
        document.getElementById('messages-list').innerHTML = '<div class="empty-state"><h3>Failed to load messages</h3></div>';
    }
}

function renderMessages(messages) {
    const container = document.getElementById('messages-list');
    
    if (messages.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No messages sent yet</h3><p>Start reaching out to contacts to see messages here.</p></div>';
        return;
    }
    
    container.innerHTML = messages.map(msg => `
        <div class="message-card">
            <div class="message-header">
                <div class="message-title">${msg.first_name} ${msg.last_name} - ${msg.company_name || 'No Company'}</div>
                <div class="message-date">${formatDate(msg.sent_at || msg.created_at)}</div>
            </div>
            <div class="message-subject"><strong>Subject:</strong> ${msg.subject}</div>
            <div class="message-preview">${truncateText(msg.body, 150)}</div>
            <span class="status-badge status-${msg.status}">${msg.status || 'draft'}</span>
            ${msg.provider ? `<span class="status-badge status-provider">${msg.provider.toUpperCase()}</span>` : ''}
        </div>
    `).join('');
}

async function loadContacts() {
    try {
        const response = await fetch(`${API_BASE}/contacts`);
        allContacts = await response.json();
        renderContacts(allContacts);
    } catch (error) {
        console.error('Error loading contacts:', error);
        document.getElementById('contacts-tbody').innerHTML = '<tr><td colspan="6" class="empty-state">Failed to load contacts</td></tr>';
    }
}

function renderContacts(contacts) {
    const tbody = document.getElementById('contacts-tbody');
    
    if (contacts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No contacts found</td></tr>';
        return;
    }
    
    const getContactStatus = (contact) => {
        if (contact.last_message_status) return contact.last_message_status;
        return contact.active ? 'ACTIVE' : 'NEW';
    };

    tbody.innerHTML = contacts.map(contact => `
        <tr>
            <td>${contact.first_name} ${contact.last_name}</td>
            <td>${contact.title || 'N/A'}</td>
            <td>${contact.company_name || 'N/A'}</td>
            <td><a href="mailto:${contact.email}">${contact.email}</a></td>
            <td><span class="status-badge status-${getContactStatus(contact)}">${getContactStatus(contact)}</span></td>
            <td>
                <button class="btn btn-primary btn-sm" onclick="viewContactDetails(${contact.id})">View</button>
            </td>
        </tr>
    `).join('');
}

function setupCRMFilters() {
    const searchInput = document.getElementById('contact-search');
    const statusFilter = document.getElementById('status-filter');
    
    searchInput.addEventListener('input', filterContacts);
    statusFilter.addEventListener('change', filterContacts);
}

function setupContactFilters() {
    const companyFilter = document.getElementById('contact-company-filter');
    const titleFilter = document.getElementById('contact-title-filter');
    const industryFilter = document.getElementById('contact-industry-filter');
    if (!companyFilter || !titleFilter || !industryFilter) return;

    const companies = Array.from(new Set(allContacts.map(c => c.company_name).filter(Boolean))).sort();
    const titles = Array.from(new Set(allContacts.map(c => c.title).filter(Boolean))).sort();
    const industries = Array.from(new Set(allContacts.map(c => c.crunchbase_industries || c.industry).filter(Boolean))).sort();

    companyFilter.innerHTML = '<option value="">All Companies</option>' + companies.map(c => `<option value="${c}">${c}</option>`).join('');
    titleFilter.innerHTML = '<option value="">All Titles</option>' + titles.map(t => `<option value="${t}">${t}</option>`).join('');
    industryFilter.innerHTML = '<option value="">All Industries</option>' + industries.map(i => `<option value="${i}">${i}</option>`).join('');

    companyFilter.addEventListener('change', filterContacts);
    titleFilter.addEventListener('change', filterContacts);
    industryFilter.addEventListener('change', filterContacts);
}

function filterContacts() {
    const searchTerm = document.getElementById('contact-search').value.toLowerCase();
    const statusFilter = document.getElementById('status-filter').value;
    const companyFilter = document.getElementById('contact-company-filter').value;
    const titleFilter = document.getElementById('contact-title-filter').value;
    const industryFilter = document.getElementById('contact-industry-filter').value;
    
    const filtered = allContacts.filter(contact => {
        const matchesSearch = !searchTerm || 
            contact.first_name?.toLowerCase().includes(searchTerm) ||
            contact.last_name?.toLowerCase().includes(searchTerm) ||
            contact.email?.toLowerCase().includes(searchTerm) ||
            contact.company_name?.toLowerCase().includes(searchTerm);
            
        const contactStatus = contact.last_message_status || (contact.active ? 'ACTIVE' : 'NEW');
        const matchesStatus = !statusFilter || contactStatus === statusFilter;
        const matchesCompany = !companyFilter || contact.company_name === companyFilter;
        const matchesTitle = !titleFilter || contact.title === titleFilter;
        const contactIndustry = contact.crunchbase_industries || contact.industry || '';
        const matchesIndustry = !industryFilter || contactIndustry.includes(industryFilter);
        
        return matchesSearch && matchesStatus && matchesCompany && matchesTitle && matchesIndustry;
    });
    
    renderContacts(filtered);
}

// Company Tracking Page
async function loadTrackingData() {
    try {
        const response = await fetch(`${API_BASE}/companies`);
        allCompanies = await response.json();
        setupCompanyFilters();
        setupCompanyColumns();
        loadCompanyViews();
        renderCompanies(allCompanies);
        setupTrackingFilters();
    } catch (error) {
        console.error('Error loading companies:', error);
        document.getElementById('companies-tbody').innerHTML = '<tr><td colspan="7" class="empty-state">Failed to load companies</td></tr>';
    }
}

function renderCompanies(companies) {
    const tbody = document.getElementById('companies-tbody');
    
    if (companies.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No companies found</td></tr>';
        return;
    }
    
    tbody.innerHTML = companies.map(company => {
        const isReached = company.message_count > 0;
        const statusClass = isReached ? 'reached' : 'not-reached';
        const statusText = isReached ? 'Reached' : 'Not Reached';
        const country = getCountryFromLocation(company.crunchbase_headquarters_location);
        const funding = formatFunding(company.crunchbase_total_funding_amount || company.funding_total);
        const missing = getMissingCrunchbaseFields(company);
        const qualityClass = missing.length === 0 ? 'quality-ok' : '';
        const qualityText = missing.length === 0 ? 'Complete' : `Missing: ${missing.join(', ')}`;
        
        return `
            <tr onclick="showCompanyDetails(${company.id})" data-company-id="${company.id}">
                <td data-col="name"><strong>${company.name}</strong></td>
                <td data-col="industry">${company.industry || 'N/A'}</td>
                <td data-col="country">${country}</td>
                <td data-col="funding">${funding}</td>
                <td data-col="size">${company.size || 'N/A'}</td>
                <td data-col="contacts">${company.contact_count || 0}</td>
                <td data-col="messages">${company.message_count || 0}</td>
                <td data-col="last_contact">${company.last_contact_date ? formatDate(company.last_contact_date) : 'Never'}</td>
                <td data-col="status"><span class="status-badge status-${statusClass}">${statusText}</span></td>
                <td data-col="quality"><span class="quality-badge ${qualityClass}" title="${qualityText}">${qualityText}</span></td>
            </tr>
        `;
    }).join('');

    applyColumnVisibility();
}

function setupTrackingFilters() {
    const searchInput = document.getElementById('company-search');
    const reachedFilter = document.getElementById('reached-filter');
    const industryFilter = document.getElementById('industry-filter');
    const stageFilter = document.getElementById('stage-filter');
    const countryFilter = document.getElementById('country-filter');
    const fundingMin = document.getElementById('funding-min');
    const fundingMax = document.getElementById('funding-max');
    
    searchInput.addEventListener('input', filterCompanies);
    reachedFilter.addEventListener('change', filterCompanies);
    industryFilter.addEventListener('change', filterCompanies);
    stageFilter.addEventListener('change', filterCompanies);
    countryFilter.addEventListener('change', filterCompanies);
    fundingMin.addEventListener('input', filterCompanies);
    fundingMax.addEventListener('input', filterCompanies);
}

function filterCompanies() {
    const searchTerm = document.getElementById('company-search').value.toLowerCase();
    const reachedFilter = document.getElementById('reached-filter').value;
    const industryFilter = document.getElementById('industry-filter').value;
    const stageFilter = document.getElementById('stage-filter').value;
    const countryFilter = document.getElementById('country-filter').value;
    const fundingMin = Number(document.getElementById('funding-min').value || 0);
    const fundingMaxRaw = document.getElementById('funding-max').value;
    const fundingMax = fundingMaxRaw ? Number(fundingMaxRaw) : null;
    
    const filtered = allCompanies.filter(company => {
        const matchesSearch = !searchTerm || 
            company.name?.toLowerCase().includes(searchTerm) ||
            company.industry?.toLowerCase().includes(searchTerm);
            
        const isReached = company.message_count > 0;
        const matchesReached = !reachedFilter || 
            (reachedFilter === 'reached' && isReached) ||
            (reachedFilter === 'not-reached' && !isReached);
        const matchesIndustry = !industryFilter || (company.crunchbase_industries || company.industry || '').includes(industryFilter);
        const matchesStage = !stageFilter || (company.crunchbase_stage || '').includes(stageFilter);
        const country = getCountryFromLocation(company.crunchbase_headquarters_location);
        const matchesCountry = !countryFilter || country === countryFilter;
        const fundingValue = Number(company.crunchbase_total_funding_amount || company.funding_total || 0);
        const matchesFundingMin = !fundingMin || fundingValue >= fundingMin;
        const matchesFundingMax = fundingMax === null || fundingValue <= fundingMax;
        
        return matchesSearch && matchesReached && matchesIndustry && matchesStage && matchesCountry && matchesFundingMin && matchesFundingMax;
    });
    
    renderCompanies(filtered);
}

// Replies Page
async function loadReplies() {
    try {
        const response = await fetch(`${API_BASE}/replies`);
        allReplies = await response.json();
        renderReplies(allReplies);
        setupRepliesFilters();
    } catch (error) {
        console.error('Error loading replies:', error);
        document.getElementById('replies-list').innerHTML = '<div class="empty-state"><h3>Failed to load replies</h3></div>';
    }
}

function renderReplies(replies) {
    const container = document.getElementById('replies-list');
    
    if (replies.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No replies yet</h3><p>Replies from your outreach will appear here.</p></div>';
        return;
    }
    
    container.innerHTML = replies.map(reply => `
        <div class="reply-card ${reply.intent || 'REPLIED'}">
            <div class="reply-header">
                <div class="reply-from">
                    ${reply.first_name} ${reply.last_name} - ${reply.company_name || 'No Company'}
                </div>
                <span class="reply-intent ${reply.intent || 'REPLIED'}">${reply.intent || 'REPLIED'}</span>
            </div>
            <div class="reply-subject"><strong>RE:</strong> ${reply.subject}</div>
            <div class="reply-body">${reply.body}</div>
            <div class="reply-date">Received: ${formatDate(reply.received_at)}</div>
        </div>
    `).join('');
}

function setupRepliesFilters() {
    const intentFilter = document.getElementById('intent-filter');
    intentFilter.addEventListener('change', filterReplies);
}

function filterReplies() {
    const intentFilter = document.getElementById('intent-filter').value;
    
    const filtered = allReplies.filter(reply => {
        return !intentFilter || reply.intent === intentFilter;
    });
    
    renderReplies(filtered);
}

// Utility Functions
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

function getCountryFromLocation(location) {
    if (!location) return 'N/A';
    const parts = location.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length === 0) return 'N/A';
    return parts[parts.length - 1];
}

function formatFunding(value) {
    if (value === null || value === undefined || value === '') return 'N/A';
    const num = Number(value);
    if (Number.isNaN(num)) return String(value);
    if (num >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(1)}K`;
    return `$${num}`;
}

async function viewContactDetails(contactId) {
    try {
        const response = await fetch(`${API_BASE}/contacts/${contactId}`);
        const data = await response.json();
        const contact = data.contact;
        const messages = data.messages || [];

        const contactPanel = document.getElementById('crm-contact-context');
        contactPanel.innerHTML = `
            <div><strong>${contact.first_name} ${contact.last_name}</strong></div>
            <div class="muted">${contact.title || 'No title'} • ${contact.email || 'No email'}</div>
            <div class="muted">Company: ${contact.company_name || 'N/A'}</div>
            <div class="muted">Recent messages: ${messages.length}</div>
        `;
        const notes = document.getElementById('contact-notes');
        if (notes) {
            notes.value = contact.notes || '';
            notes.dataset.contactId = contact.id;
        }

        const companyPanel = document.getElementById('crm-company-context');
        companyPanel.innerHTML = `
            <div><strong>${contact.company_name || 'N/A'}</strong></div>
            <div class="muted">${contact.crunchbase_industries || 'No industries listed'}</div>
            <p>${contact.crunchbase_description || 'No Crunchbase description available.'}</p>
            <div class="muted">HQ: ${contact.crunchbase_headquarters_location || 'N/A'}</div>
        `;
    } catch (error) {
        console.error('Error loading contact details:', error);
    }
}

async function saveContactNotes() {
    const textarea = document.getElementById('contact-notes');
    if (!textarea) return;
    const contactId = textarea.dataset.contactId;
    if (!contactId) return;
    await fetch(`${API_BASE}/contacts/${contactId}/notes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: textarea.value })
    });
}

function showCompanyDetails(companyId) {
    const company = allCompanies.find(c => c.id === companyId);
    if (!company) return;

    document.querySelectorAll('#companies-tbody tr').forEach(row => {
        row.classList.toggle('selected-row', parseInt(row.dataset.companyId, 10) === companyId);
    });

    const panel = document.getElementById('company-detail-panel');
    const missing = getMissingCrunchbaseFields(company);
    panel.innerHTML = `
        <div><strong>${company.name}</strong></div>
        <div class="muted">${company.crunchbase_industries || company.industry || 'No industries listed'}</div>
        <p>${company.crunchbase_description || 'No Crunchbase description available.'}</p>
        <div class="muted">Stage: ${company.crunchbase_stage || 'N/A'}</div>
        <div class="muted">Employees: ${company.crunchbase_number_of_employees || company.size || 'N/A'}</div>
        <div class="muted">Country: ${getCountryFromLocation(company.crunchbase_headquarters_location)}</div>
        <div class="muted">Funding: ${formatFunding(company.crunchbase_total_funding_amount || company.funding_total)}</div>
        <div class="muted">Last Reply: ${company.last_reply_date ? formatDate(company.last_reply_date) : 'Never'}</div>
        <div class="muted">Data Quality: ${missing.length === 0 ? 'Complete' : 'Missing ' + missing.join(', ')}</div>
    `;
    const notes = document.getElementById('company-notes');
    if (notes) {
        notes.value = company.notes || '';
        notes.dataset.companyId = company.id;
    }
}

async function saveCompanyNotes() {
    const textarea = document.getElementById('company-notes');
    if (!textarea) return;
    const companyId = textarea.dataset.companyId;
    if (!companyId) return;
    await fetch(`${API_BASE}/companies/${companyId}/notes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: textarea.value })
    });
}

async function loadNextContact() {
    const panel = document.getElementById('next-contact-panel');
    if (!panel) return;
    panel.textContent = 'Loading...';
    const response = await fetch(`${API_BASE}/next-contact`);
    const data = await response.json();
    if (!data || data.length === 0) {
        panel.textContent = 'No eligible contacts right now.';
        return;
    }
    const next = data[0];
    panel.textContent = `${next.first_name} ${next.last_name} • ${next.title || ''} @ ${next.company_name}`;
    panel.dataset.contactId = next.contact_id;
}

async function draftForSelectedContact() {
    const panel = document.getElementById('next-contact-panel');
    if (!panel) return;
    const contactId = panel.dataset.contactId;
    if (!contactId) {
        alert('Select a contact first (Next Contact).');
        return;
    }
    const response = await fetch(`${API_BASE}/draft-outreach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: Number(contactId) })
    });
    const data = await response.json();
    const preview = document.getElementById('draft-preview');
    if (preview && data.drafts) {
        preview.innerHTML = data.drafts.map(d => `
            <div class="message-card">
                <div class="message-subject">${d.subject}</div>
                <div class="message-preview">${truncateText(d.body, 180)}</div>
                <span class="status-badge status-DRAFTED">${d.score || ''}</span>
            </div>
        `).join('');
    }
}

function getMissingCrunchbaseFields(company) {
    const missing = [];
    if (!company.crunchbase_description) missing.push('description');
    if (!company.crunchbase_industries) missing.push('industries');
    if (!company.crunchbase_headquarters_location) missing.push('HQ');
    if (!company.crunchbase_total_funding_amount && !company.funding_total) missing.push('funding');
    return missing;
}

function setupCompanyFilters() {
    const industrySelect = document.getElementById('industry-filter');
    const stageSelect = document.getElementById('stage-filter');
    const countrySelect = document.getElementById('country-filter');
    if (!industrySelect || !stageSelect) return;
    const industries = Array.from(new Set(allCompanies.flatMap(c => (c.crunchbase_industries || c.industry || '').split(',').map(i => i.trim()).filter(Boolean)))).sort();
    const stages = Array.from(new Set(allCompanies.map(c => c.crunchbase_stage).filter(Boolean))).sort();
    const countries = Array.from(new Set(allCompanies.map(c => getCountryFromLocation(c.crunchbase_headquarters_location)).filter(c => c && c !== 'N/A'))).sort();
    industrySelect.innerHTML = '<option value="">All Industries</option>' + industries.map(i => `<option value="${i}">${i}</option>`).join('');
    stageSelect.innerHTML = '<option value="">All Stages</option>' + stages.map(s => `<option value="${s}">${s}</option>`).join('');
    if (countrySelect) {
        countrySelect.innerHTML = '<option value="">All Countries</option>' + countries.map(c => `<option value="${c}">${c}</option>`).join('');
    }
}

function setupCompanyColumns() {
    const grid = document.getElementById('column-grid');
    if (!grid) return;
    grid.innerHTML = companyColumns.map(col => `
        <label class="column-item">
            <input type="checkbox" data-col="${col.key}" checked>
            ${col.label}
        </label>
    `).join('');
    grid.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', applyColumnVisibility);
    });
}

function applyColumnVisibility() {
    const grid = document.getElementById('column-grid');
    if (!grid) return;
    const visible = {};
    grid.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        visible[cb.dataset.col] = cb.checked;
    });
    document.querySelectorAll('#companies-table [data-col]').forEach(cell => {
        const col = cell.dataset.col;
        cell.style.display = visible[col] ? '' : 'none';
    });
}

function toggleColumnPanel() {
    const panel = document.getElementById('column-panel');
    if (panel) panel.classList.toggle('active');
}

function saveCompanyView() {
    const name = prompt('Name this view:');
    if (!name) return;
    const state = getCompanyViewState();
    const views = getCompanyViews();
    views[name] = state;
    localStorage.setItem('companyViews', JSON.stringify(views));
    loadCompanyViews();
}

function loadCompanyViews() {
    const select = document.getElementById('company-view-select');
    if (!select) return;
    const views = getCompanyViews();
    select.innerHTML = '<option value="">Select view</option>' + Object.keys(views).map(v => `<option value="${v}">${v}</option>`).join('');
    select.onchange = () => {
        const view = views[select.value];
        if (view) applyCompanyView(view);
    };
}

function getCompanyViews() {
    try {
        return JSON.parse(localStorage.getItem('companyViews')) || {};
    } catch {
        return {};
    }
}

function getCompanyViewState() {
    const grid = document.getElementById('column-grid');
    const columns = {};
    if (grid) {
        grid.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            columns[cb.dataset.col] = cb.checked;
        });
    }
    return {
        search: document.getElementById('company-search').value,
        reached: document.getElementById('reached-filter').value,
        industry: document.getElementById('industry-filter').value,
        stage: document.getElementById('stage-filter').value,
        fundingMin: document.getElementById('funding-min').value,
        fundingMax: document.getElementById('funding-max').value,
        columns
    };
}

function applyCompanyView(view) {
    document.getElementById('company-search').value = view.search || '';
    document.getElementById('reached-filter').value = view.reached || '';
    document.getElementById('industry-filter').value = view.industry || '';
    document.getElementById('stage-filter').value = view.stage || '';
    document.getElementById('funding-min').value = view.fundingMin || '';
    document.getElementById('funding-max').value = view.fundingMax || '';
    const grid = document.getElementById('column-grid');
    if (grid && view.columns) {
        grid.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.checked = view.columns[cb.dataset.col] !== false;
        });
    }
    filterCompanies();
    applyColumnVisibility();
}

// Test Emails Page
async function loadTestPage() {
    try {
        await loadTestCompanies();
        const response = await fetch(`${API_BASE}/test-emails`);
        const testEmails = await response.json();
        
        const container = document.getElementById('test-results');
        if (testEmails.length === 0) {
            container.innerHTML = '<div class="empty-state"><h3>No test emails yet</h3><p>Click "Run Test" to generate test emails.</p></div>';
        } else {
            container.innerHTML = testEmails.map(email => renderTestEmail(email)).join('');
        }
        
        document.getElementById('test-status').textContent = '';
    } catch (error) {
        console.error('Error loading test page:', error);
        document.getElementById('test-results').innerHTML = '<div class="empty-state"><h3>Failed to load test emails</h3></div>';
    }
}

async function loadTestCompanies() {
    try {
        const response = await fetch(`${API_BASE}/companies`);
        testCompanies = await response.json();
        renderTestCompanies(testCompanies);
        setupTestCompanyFilters();
    } catch (error) {
        console.error('Error loading test companies:', error);
        document.getElementById('test-companies-tbody').innerHTML = '<tr><td colspan="5" class="empty-state">Failed to load companies</td></tr>';
    }
}

function setupTestCompanyFilters() {
    const searchInput = document.getElementById('test-company-search');
    if (!searchInput.dataset.bound) {
        searchInput.addEventListener('input', filterTestCompanies);
        searchInput.dataset.bound = 'true';
    }
}

function filterTestCompanies() {
    const searchTerm = document.getElementById('test-company-search').value.toLowerCase();
    const filtered = testCompanies.filter(company => {
        return !searchTerm ||
            company.name?.toLowerCase().includes(searchTerm) ||
            company.industry?.toLowerCase().includes(searchTerm) ||
            company.crunchbase_industries?.toLowerCase().includes(searchTerm);
    });
    renderTestCompanies(filtered);
}

function renderTestCompanies(companies) {
    const tbody = document.getElementById('test-companies-tbody');
    if (companies.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No companies found</td></tr>';
        return;
    }

    tbody.innerHTML = companies.map(company => {
        const checked = selectedCompanyIds.has(company.id) ? 'checked' : '';
        return `
            <tr>
                <td><input type="checkbox" ${checked} onchange="toggleCompanySelection(${company.id})"></td>
                <td><strong>${company.name}</strong></td>
                <td>${company.crunchbase_industries || company.industry || 'N/A'}</td>
                <td>${company.crunchbase_number_of_employees || company.size || 'N/A'}</td>
                <td>${company.message_count || 0}</td>
            </tr>
        `;
    }).join('');

    document.getElementById('selected-company-count').textContent = selectedCompanyIds.size;
}

function toggleCompanySelection(companyId) {
    if (selectedCompanyIds.has(companyId)) {
        selectedCompanyIds.delete(companyId);
    } else {
        selectedCompanyIds.add(companyId);
    }
    document.getElementById('selected-company-count').textContent = selectedCompanyIds.size;
}

async function runTestEmails() {
    const countInput = document.getElementById('test-count');
    const count = parseInt(countInput.value);
    const companyIds = Array.from(selectedCompanyIds);
    
    if (companyIds.length === 0 && (!count || count < 1 || count > 50)) {
        alert('Please enter a number between 1 and 50 or select companies');
        return;
    }
    
    const statusDiv = document.getElementById('test-status');
    const resultsDiv = document.getElementById('test-results');
    
    try {
        const label = companyIds.length > 0
            ? `Generating test emails for ${companyIds.length} selected compan${companyIds.length > 1 ? 'ies' : 'y'}...`
            : `Generating ${count} test email${count > 1 ? 's' : ''}...`;
        statusDiv.textContent = label;
        statusDiv.style.color = '#0f766e';
        
        const response = await fetch(`${API_BASE}/test-emails`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ count, company_ids: companyIds })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to generate test emails');
        }
        
        const payload = await response.json();
        const generatedEmails = Array.isArray(payload) ? payload : (payload.generated || []);
        const skippedCompanies = Array.isArray(payload) ? [] : (payload.skipped || []);
        const skippedText = skippedCompanies.length > 0
            ? ` (${skippedCompanies.length} skipped)`
            : '';
        
        statusDiv.textContent = `Successfully generated ${generatedEmails.length} test email${generatedEmails.length !== 1 ? 's' : ''}!${skippedText}`;
        statusDiv.style.color = '#0f766e';
        
        // Reload the test page to show new emails
        await loadTestPage();
        
        // Clear status after 3 seconds
        setTimeout(() => {
            statusDiv.textContent = '';
        }, 3000);
        
    } catch (error) {
        console.error('Error generating test emails:', error);
        statusDiv.textContent = `Error: ${error.message}`;
        statusDiv.style.color = '#e74c3c';
    }
}

function renderTestEmail(email) {
    // Helper function to escape HTML
    const escapeHtml = (text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };
    
    // Helper function to safely render text with line breaks
    const renderTextWithBreaks = (text) => {
        return escapeHtml(text).replace(/\n/g, '<br>');
    };
    
    return `
        <div class="test-email-card">
            <div class="test-email-header">
                <div class="test-email-contact">
                    <strong>${escapeHtml(email.first_name)} ${escapeHtml(email.last_name)}</strong>
                    ${email.title ? `<span class="test-email-title">${escapeHtml(email.title)}</span>` : ''}
                    ${email.company_name ? `<span class="test-email-company">@ ${escapeHtml(email.company_name)}</span>` : ''}
                </div>
                <button class="delete-btn" onclick="deleteTestEmail(${parseInt(email.id)})" title="Delete this test email">
                    🗑️
                </button>
            </div>
            <div class="test-email-subject">
                <strong>Subject:</strong> ${escapeHtml(email.subject)}
            </div>
            <div class="test-email-body">
                ${renderTextWithBreaks(email.body)}
            </div>
            <div class="test-email-footer">
                ${email.score ? `<span class="test-email-score">Score: ${parseInt(email.score)}/100</span>` : ''}
                ${email.template_id ? `<span class="test-email-template">Template: ${escapeHtml(email.template_id)}</span>` : ''}
                ${email.angle ? `<span class="test-email-angle">Angle: ${escapeHtml(email.angle)}</span>` : ''}
                ${email.used_fields_json ? `<span class="test-email-fields">Fields: ${escapeHtml(JSON.parse(email.used_fields_json).join(', '))}</span>` : ''}
            </div>
        </div>
    `;
}

async function deleteTestEmail(messageId) {
    if (!confirm('Are you sure you want to delete this test email?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/test-emails/${messageId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error('Failed to delete test email');
        }
        
        // Reload the test page
        await loadTestPage();
        
    } catch (error) {
        console.error('Error deleting test email:', error);
        alert('Failed to delete test email: ' + error.message);
    }
}

async function deleteAllTestEmails() {
    if (!confirm('Are you sure you want to delete ALL test emails? This cannot be undone.')) {
        return;
    }
    
    const statusDiv = document.getElementById('test-status');
    
    try {
        statusDiv.textContent = 'Deleting all test emails...';
        statusDiv.style.color = '#3498db';
        
        const response = await fetch(`${API_BASE}/test-emails`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error('Failed to delete test emails');
        }
        
        const result = await response.json();
        
        statusDiv.textContent = `Successfully deleted ${result.deletedCount} test email${result.deletedCount !== 1 ? 's' : ''}!`;
        statusDiv.style.color = '#27ae60';
        
        // Reload the test page
        await loadTestPage();
        
        // Clear status after 3 seconds
        setTimeout(() => {
            statusDiv.textContent = '';
        }, 3000);
        
    } catch (error) {
        console.error('Error deleting all test emails:', error);
        statusDiv.textContent = `Error: ${error.message}`;
        statusDiv.style.color = '#e74c3c';
    }
}

// Integrations Page
async function loadIntegrations() {
    const statusEl = document.getElementById('gmail-status');
    const syncEl = document.getElementById('gmail-sync-status');
    if (!statusEl || !syncEl) return;

    statusEl.textContent = 'Loading...';
    syncEl.textContent = '';

    try {
        const response = await fetch(`${API_BASE}/integrations/email`);
        const data = await response.json();
        if (!data.account) {
            statusEl.textContent = 'Not connected.';
            return;
        }
        statusEl.textContent = `Connected as ${data.account.email} (${data.account.provider})`;
        if (data.sync) {
            const lastSync = data.sync.last_sync_at ? new Date(data.sync.last_sync_at).toLocaleString() : 'Never';
            const expires = data.sync.watch_expiration ? new Date(data.sync.watch_expiration).toLocaleString() : 'Unknown';
            syncEl.textContent = `Last sync: ${lastSync} • Watch expires: ${expires}`;
        } else {
            syncEl.textContent = 'No sync state yet.';
        }
    } catch (error) {
        console.error('Failed to load integrations:', error);
        statusEl.textContent = 'Failed to load integration status.';
    }
}

function connectGmail() {
    window.location.href = '/auth/gmail/start';
}

async function disconnectGmail() {
    try {
        await fetch('/auth/gmail/disconnect', { method: 'POST' });
        await loadIntegrations();
    } catch (error) {
        alert('Failed to disconnect Gmail.');
    }
}

async function renewGmailWatch() {
    try {
        await fetch(`${API_BASE}/gmail/watch/renew`, { method: 'POST' });
        await loadIntegrations();
    } catch (error) {
        alert('Failed to renew Gmail watch.');
    }
}

async function syncGmailReplies() {
    try {
        await fetch(`${API_BASE}/gmail/sync`, { method: 'POST' });
        await loadIntegrations();
    } catch (error) {
        alert('Failed to sync Gmail replies.');
    }
}

async function syncGmailContacts() {
    try {
        await fetch(`${API_BASE}/gmail/contacts/sync`, { method: 'POST' });
        await loadIntegrations();
    } catch (error) {
        alert('Failed to sync Gmail contacts.');
    }
}

// Auto-refresh every 30 seconds
setInterval(() => {
    const activePage = document.querySelector('.page.active');
    if (activePage) {
        const pageId = activePage.id.replace('-page', '');
        if (pageId === 'dashboard') {
            loadDashboard();
        }
    }
}, 30000);
