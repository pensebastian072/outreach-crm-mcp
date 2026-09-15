import { EarthXData } from './email-utils';

export interface EarthXContext {
  organization_name: string;
  org_description: string;
  org_founded_year: string;
  event_name: string;
  event_city: string;
  event_venue: string;
  event_date_range: string;
  event_anniversary_years?: string;
  event_industry_leader_claim?: string;
  core_themes: string[];
  attendee_types?: string[];
  partner_profile: {
    company_size_employees: string;
    funding_stage: string;
    technology_status: string;
    team: string;
    alignment: string;
    disqualifiers: string[];
  };
  outreach_offers: string[];
  default_cta: string;
  role_benefit_map: Record<string, string>;
  compliance_rules: string[];
  tone: string;
  contact_email: string;
  outreach_sender_name?: string;
  outreach_sender_org?: string;
  outreach_sender_email?: string;
}

function normalizeValue(value: string): string {
  return value
    .replace(/\[|\]/g, '')
    .replace(/\(fill\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractKV(section: string, key: string): string {
  const regex = new RegExp(key + ':\\s*([^\\n]+)', 'i');
  const match = section.match(regex);
  return match ? normalizeValue(match[1]) : '';
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractMarkdownValue(text: string, key: string): string {
  const regex = new RegExp(`\\*\\*\\s*${escapeRegex(key)}\\s*:\\*\\*\\s*([^\\n]+)`, 'i');
  const match = text.match(regex);
  return match ? normalizeValue(match[1].replace(/\[[^\]]+\]\[[^\]]+\]/g, '').trim()) : '';
}

function extractMarkdownBullets(text: string, key: string): string[] {
  const sectionRegex = new RegExp(`\\*\\*\\s*${escapeRegex(key)}\\s*:\\*\\*[\\t ]*\\n([\\s\\S]*?)(?:\\n\\n\\*\\*|\\n### |\\n## |$)`, 'i');
  const match = text.match(sectionRegex);
  if (!match) return [];
  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('* '))
    .map((line) => line.slice(2).trim().replace(/\[[^\]]+\]\[[^\]]+\]/g, '').trim())
    .filter(Boolean);
}

function parseCity(value: string): string {
  if (!value) return '';
  const first = value.split(',')[0];
  return normalizeValue(first);
}

function normalizeTheme(value: string): string {
  const clean = normalizeValue(value || '');
  if (!clean) return '';
  return clean
    .replace(/\bU\.S\./g, 'US')
    .replace(/\bU\.S\b/g, 'US')
    .replace(/\bUS\./g, 'US')
    .replace(/\bU\.S\.-/g, 'US-')
    .split(/\s[-–]\s/)[0]
    .trim();
}

function parseStructuredContext(text: string): EarthXContext {
  const organization_name = extractMarkdownValue(text, 'event_name') || 'Davos to Dallas Xperience';
  const org_description = extractMarkdownValue(text, 'event_positioning (1 sentence)') || '';
  const event_name = extractMarkdownValue(text, 'event_name') || organization_name;
  const event_city = parseCity(extractMarkdownValue(text, 'event_city_state'));
  const rawVenue = extractMarkdownValue(text, 'event_venue');
  const event_venue = rawVenue.replace(/\s*\([^)]*\)\s*$/, '').trim();
  const event_date_range = extractMarkdownValue(text, 'event_date_range');
  const mission = extractMarkdownValue(text, 'event_mission (verbatim idea, paraphrase allowed)');

  const dayThemes = [
    extractMarkdownValue(text, 'program_day_1_theme'),
    extractMarkdownValue(text, 'program_day_2_theme'),
    extractMarkdownValue(text, 'program_day_3_theme')
  ].map(normalizeTheme).filter(Boolean);
  const programHighlights = extractMarkdownBullets(text, 'program_highlights (bullets)').map(normalizeTheme).filter(Boolean);
  const approvedDifferentiators = extractMarkdownBullets(text, 'approved_differentiators (bullets)').map(normalizeTheme).filter(Boolean);
  const audience = extractMarkdownBullets(text, 'audience (bullets)');
  const core_themes = [...programHighlights, ...approvedDifferentiators, ...dayThemes].filter((value, index, arr) => arr.indexOf(value) === index);

  const outreach_offers = extractMarkdownBullets(text, 'approved_one-liner value props (choose 1 max per email)');
  const compliance_rules = extractMarkdownBullets(text, 'banned_phrases unless explicitly supported elsewhere');
  const contact_method = extractMarkdownValue(text, 'contact_method');

  return {
    organization_name,
    org_description: mission || org_description,
    org_founded_year: '',
    event_name,
    event_city,
    event_venue,
    event_date_range,
    event_anniversary_years: '',
    event_industry_leader_claim: '',
    core_themes,
    attendee_types: audience,
    partner_profile: {
      company_size_employees: '',
      funding_stage: '',
      technology_status: '',
      team: '',
      alignment: '',
      disqualifiers: []
    },
    outreach_offers,
    default_cta: outreach_offers[0] || '',
    role_benefit_map: {},
    compliance_rules,
    tone: 'Direct, grounded, practical',
    contact_email: contact_method || '',
    outreach_sender_name: '',
    outreach_sender_org: '',
    outreach_sender_email: ''
  };
}

function parseLegacyContext(text: string): EarthXContext {
  const sections = text.split('________________________________________');
  const factsSection = sections[0] || '';

  const organization_name = extractKV(factsSection, 'Organization name');
  const org_description = extractKV(factsSection, 'Org description');
  const org_founded_year = extractKV(factsSection, 'Org founded year');
  const event_name = extractKV(factsSection, 'event_name');
  const event_city = extractKV(factsSection, 'event_city');
  const event_venue = extractKV(factsSection, 'event_venue');
  const event_date_range = extractKV(factsSection, 'event_date_range');
  const event_anniversary_years = extractKV(factsSection, 'event_anniversary_years');
  const event_industry_leader_claim = extractKV(factsSection, 'event_industry_leader_claim');

  const themesSection = text.split('2) CORE THEMES')[1]?.split('________________________________________')[0] || '';
  const themeRegex = /\d+\.\s*([\w &]+)[\s\S]*?(?=\d+\.|$)/g;
  const core_themes: string[] = [];
  let themeMatch;
  while ((themeMatch = themeRegex.exec(themesSection)) !== null) {
    core_themes.push(themeMatch[1].trim());
  }

  const profileSection = text.split('3) TARGET PARTNER PROFILE')[1]?.split('________________________________________')[0] || '';
  const company_size_employees = extractKV(profileSection, 'company_size_employees');
  const funding_stage = extractKV(profileSection, 'funding_stage');
  const technology_status = extractKV(profileSection, 'technology_status');
  const team = extractKV(profileSection, 'team');
  const alignment = extractKV(profileSection, 'alignment');
  const disqualifiers: string[] = [];
  const disqualRegex = /Disqualifiers[\s\S]*?•([^\n]+)/g;
  let disqualMatch;
  while ((disqualMatch = disqualRegex.exec(profileSection)) !== null) {
    disqualifiers.push(disqualMatch[1].trim());
  }

  const outreachSection = text.split('4) APPROVED OUTREACH OFFER')[1]?.split('________________________________________')[0] || '';
  const outreach_offers: string[] = [];
  const offerRegex = /•\s*(ask_type_[ABC]):\s*“([^”]+)”/g;
  let offerMatch;
  while ((offerMatch = offerRegex.exec(outreachSection)) !== null) {
    outreach_offers.push(offerMatch[2].trim());
  }
  const default_cta = outreachSection.match(/Default CTA \(your style\):\s*“([^”]+)”/)?.[1] || '';

  const roleSection = text.split('5) ROLE-BASED BENEFIT MESSAGING')[1]?.split('________________________________________')[0] || '';
  const role_benefit_map: Record<string, string> = {};
  const roleRegex = /•\s*([^:]+):\s*“([^”]+)”/g;
  let roleMatch;
  while ((roleMatch = roleRegex.exec(roleSection)) !== null) {
    role_benefit_map[roleMatch[1].trim()] = roleMatch[2].trim();
  }

  const complianceSection = text.split('6) COMPLIANCE + TONE RULES')[1]?.split('________________________________________')[0] || '';
  const compliance_rules: string[] = [];
  const complianceRegex = /•\s*“([^”]+)”/g;
  let complianceMatch;
  while ((complianceMatch = complianceRegex.exec(complianceSection)) !== null) {
    compliance_rules.push(complianceMatch[1].trim());
  }
  const tone = complianceSection.match(/Tone: ([^\.]+)/)?.[1].trim() || '';

  const contactSection = text.split('7) CONTACT')[1]?.split('________________________________________')[0] || '';
  const contact_email = contactSection.includes('partnerships@yourdomain.com')
    ? 'partnerships@yourdomain.com'
    : extractKV(contactSection, 'contact_email');
  const outreach_sender_name = contactSection.match(/outreach_sender_name: ([^\n]+)/)?.[1].trim();
  const outreach_sender_org = contactSection.match(/outreach_sender_org: ([^\n]+)/)?.[1].trim();
  const outreach_sender_email = contactSection.match(/outreach_sender_email: ([^\n]+)/)?.[1].trim();

  return {
    organization_name,
    org_description,
    org_founded_year,
    event_name,
    event_city,
    event_venue,
    event_date_range,
    event_anniversary_years,
    event_industry_leader_claim,
    core_themes,
    attendee_types: [],
    partner_profile: {
      company_size_employees,
      funding_stage,
      technology_status,
      team,
      alignment,
      disqualifiers
    },
    outreach_offers,
    default_cta,
    role_benefit_map,
    compliance_rules,
    tone,
    contact_email,
    outreach_sender_name,
    outreach_sender_org,
    outreach_sender_email
  };
}

export function parseEarthXContextDoc(text: string): EarthXContext {
  if (/\*\*\s*event_name\s*:\*\*/i.test(text)) {
    return parseStructuredContext(text);
  }
  return parseLegacyContext(text);
}

export function toEarthXData(context: EarthXContext): EarthXData {
  return {
    event_name: context.event_name || context.organization_name,
    earthx_date_range: context.event_date_range,
    earthx_city: context.event_city,
    earthx_venue: context.event_venue,
    earthx_mission: context.org_description,
    earthx_highlights: context.core_themes,
    earthx_attendee_types: context.attendee_types || [],
    earthx_sponsor_notes: [],
    earthx_core_themes: context.core_themes,
    earthx_default_cta: context.default_cta,
    earthx_role_benefit_map: context.role_benefit_map,
    earthx_compliance_rules: context.compliance_rules,
    earthx_anniversary_years: context.event_anniversary_years,
    earthx_industry_leader_claim: context.event_industry_leader_claim,
    earthx_outreach_sender_name: context.outreach_sender_name,
    earthx_outreach_sender_org: context.outreach_sender_org,
    earthx_outreach_sender_email: context.outreach_sender_email,
    event_date_range: context.event_date_range,
    event_city: context.event_city,
    event_venue: context.event_venue,
    event_anniversary_years: context.event_anniversary_years,
    core_themes: context.core_themes,
    outreach_sender_name: context.outreach_sender_name,
    outreach_sender_org: context.outreach_sender_org
  };
}
