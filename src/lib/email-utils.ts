import { Database } from '../db/database';
import crypto from 'crypto';

export interface ContactData {
  id: number;
  first_name: string;
  last_name: string;
  title: string;
  email: string;
  company_name: string;
  crunchbase_description?: string;
  crunchbase_industries?: string;
  crunchbase_headquarters_location?: string;
  crunchbase_stage?: string;
  crunchbase_number_of_employees?: number;
  crunchbase_estimated_revenue_range?: string;
  crunchbase_total_funding_amount?: number;
  website?: string;
}

export interface EarthXData {
  event_name?: string;
  earthx_date_range: string;
  earthx_city: string;
  earthx_venue: string;
  earthx_mission: string;
  earthx_highlights: string[];
  earthx_attendee_types: string[];
  earthx_sponsor_notes: string[];
  earthx_core_themes?: string[];
  earthx_default_cta?: string;
  earthx_role_benefit_map?: Record<string, string>;
  earthx_compliance_rules?: string[];
  earthx_anniversary_years?: string;
  earthx_industry_leader_claim?: string;
  earthx_outreach_sender_name?: string;
  earthx_outreach_sender_org?: string;
  earthx_outreach_sender_email?: string;
  // Legacy aliases used in templates
  event_date_range?: string;
  event_city?: string;
  event_venue?: string;
  event_anniversary_years?: string;
  core_themes?: string[];
  outreach_sender_name?: string;
  outreach_sender_org?: string;
}

export function getEventName(earthx: EarthXData): string {
  return (earthx.event_name || 'EarthX').trim() || 'EarthX';
}

function compactTheme(theme: string): string {
  const clean = (theme || '').trim();
  if (!clean) return '';
  const primary = clean.split(/\s[-–]\s/)[0].trim();
  return primary.replace(/[.;:]+$/g, '').trim();
}

function summarizeIndustries(industries?: string): string {
  if (!industries) return '';
  const list = industries.split(',').map(i => i.trim()).filter(Boolean);
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list[0]}, ${list[1]}, and ${list[2]}`;
}

function summarizeCompanyFocus(contact: ContactData): string {
  let description = contact.crunchbase_description?.trim() || '';
  const industries = summarizeIndustries(contact.crunchbase_industries);
  if (description) {
    const company = (contact.company_name || '').trim();
    if (company) {
      const regex = new RegExp(`^${company}\\s*`, 'i');
      description = description.replace(regex, '').replace(/^'s\s+/i, '');
    }
    description = description.replace(/\bbuilts\b/gi, 'builds');
    const sentence = description.split(/[.!?]/)[0].trim();
    const short = sentence.split(/\s+/).slice(0, 18).join(' ');
    return short ? `${short}.` : '';
  }
  if (industries) {
    return `areas like ${industries}.`;
  }
  return '';
}

function toInfinitive(phrase: string): string {
  const map: Record<string, string> = {
    builds: 'build',
    building: 'build',
    develops: 'develop',
    provides: 'provide',
    offers: 'offer',
    creates: 'create',
    delivers: 'deliver',
    designs: 'design',
    runs: 'run',
    operates: 'operate',
    is: 'be',
    are: 'be'
  };
  const words = phrase.split(/\s+/);
  const first = words[0]?.toLowerCase();
  if (first && map[first]) {
    words[0] = map[first];
  }
  return words.join(' ');
}

function toProgressive(phrase: string): string {
  const map: Record<string, string> = {
    builds: 'building',
    building: 'building',
    develops: 'developing',
    provides: 'providing',
    offers: 'offering',
    creates: 'creating',
    delivers: 'delivering',
    designs: 'designing',
    runs: 'running',
    operates: 'operating',
    is: 'working on',
    are: 'working on'
  };
  const words = phrase.split(/\s+/);
  const first = words[0]?.toLowerCase();
  if (first && map[first]) {
    words[0] = map[first];
  }
  return words.join(' ');
}

export function applyEventName(text: string, earthx: EarthXData): string {
  const eventName = getEventName(earthx);
  if (!text || eventName === 'EarthX') return text;
  return text
    .replace(/EarthX's/g, `${eventName}'s`)
    .replace(/EarthX\u2019s/g, `${eventName}'s`)
    .replace(/EarthX/gi, eventName)
    .replace(/\bcleantech\b/gi, 'business')
    .replace(/practical environmental solutions/gi, 'business expansion and market entry')
    .replace(/environmental solutions/gi, 'business expansion and market entry')
    .replace(/environmental progress/gi, 'business expansion');
}

export interface DraftResult {
  subject: string;
  body: string;
  score: number;
  template_id: string;
  title_category: string;
  angle: string;
  used_fields_json: string;
  coverage_score: number;
  similarity_score: number;
  banned_phrase_hits: number;
  hash: string;
  selected_highlight: string;
  selected_attendee_type: string;
  subject_hash: string;
  body_hash: string;
}

export function getAnniversaryLabel(earthx: EarthXData): string | null {
  const raw = earthx.earthx_anniversary_years || earthx.event_anniversary_years;
  if (raw && raw.trim().length > 0) return raw.trim();
  return null;
}

const BANNED_PHRASES = [
  "I'm reaching out from HQ Outreach",
  "We're hosting a booth and would love to connect",
  "Your expertise would be invaluable",
  "I hope this email finds you well",
  "premier gathering",
  "attendees consistently rate",
  "lasting partnerships",
  "exclusive roundtables",
  "many participants have formed",
  "many participants have",
  "premier event",
  "exclusive",
  "invaluable",
  "cutting-edge",
  "breakthrough",
  "world-class",
  "best-in-class",
  "leading-edge",
  "industry-leading",
  "most valuable",
  "attendees include",
  "keynote",
  "investor meetups",
  "networking opportunities",
  "strategic discussions",
  "stay ahead of industry trends",
  "rapidly evolving"
];

const OPTIONAL_SENTENCE_MARKERS = [
  "if this isn't relevant",
  "feel free to ignore",
  "many participants",
  "previous attendees",
  "most valuable",
  "networking",
  "keynote",
  "investor",
  "exclusive",
  "premier",
  "cutting-edge"
];

function sentenceSplit(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
}

function normalizeValue(value?: string): string {
  return (value || '').trim();
}

function summarizeThemes(earthx: EarthXData): string {
  const source = earthx.earthx_core_themes && earthx.earthx_core_themes.length > 0
    ? earthx.earthx_core_themes
    : earthx.earthx_highlights || [];
  return source
    .map((item) => compactTheme(item))
    .filter(Boolean)
    .slice(0, 2)
    .join(' and ') || 'cross-border business growth';
}

export function postProcessDraft(
  subject: string,
  body: string,
  contact: ContactData,
  earthx: EarthXData,
  angle?: string
): { subject: string; body: string } {
  const complianceRules = (earthx.earthx_compliance_rules || []).map(r => r.toLowerCase());
  const banned = BANNED_PHRASES.map(p => p.toLowerCase());

  // Remove signature block if present
  const signatureIndex = body.toLowerCase().lastIndexOf('best regards');
  let bodyCore = signatureIndex >= 0 ? body.slice(0, signatureIndex).trim() : body.trim();
  bodyCore = bodyCore.replace(/\bU\.S\.\b/g, 'US').replace(/\bU\.S\b/g, 'US');
  
  // Remove greeting if present (template includes "Dear X,")
  bodyCore = bodyCore.replace(/^Dear\s+[A-Z][a-z]+,?\s*/i, '');

  // Remove all question sentences and disallowed sentences
  let sentences = sentenceSplit(bodyCore).filter(s => !s.includes('?'));

  sentences = sentences.filter(s => {
    const lower = s.toLowerCase();
    if (banned.some(p => lower.includes(p))) return false;
    if (complianceRules.some(p => p && lower.includes(p))) return false;
    return true;
  });

  // Drop optional fluff sentences
  sentences = sentences.filter(s => {
    const lower = s.toLowerCase();
    return !OPTIONAL_SENTENCE_MARKERS.some(m => lower.includes(m));
  });

  // Remove role/title mentions to avoid inaccurate position references
  const titleLower = (contact.title || '').toLowerCase().trim();
  if (titleLower) {
    sentences = sentences.filter(s => !s.toLowerCase().includes(titleLower));
  }

  // Remove explicit company description/product sentences
  const description = contact.crunchbase_description?.trim();
  if (description) {
    const descKey = description.split(/\s+/).slice(0, 6).join(' ').toLowerCase();
    if (descKey) {
      sentences = sentences.filter(s => !s.toLowerCase().includes(descKey));
    }
  }
  sentences = sentences.filter(s => {
    const lower = s.toLowerCase();
    return !lower.includes('works in ') && !lower.includes('operates in ');
  });

  // Ensure EarthX date/location reference (first sentence)
  const dateRef = normalizeValue(earthx.earthx_date_range || earthx.event_date_range);
  const cityRef = normalizeValue(earthx.earthx_city || earthx.event_city);
  const venueRef = normalizeValue(earthx.earthx_venue || earthx.event_venue);
  const themes = summarizeThemes(earthx);
  const eventParts = [
    dateRef,
    venueRef ? `at ${venueRef}` : '',
    cityRef ? `in ${cityRef}` : ''
  ].filter(Boolean).join(' ');
  const seedSource = `${contact.company_name || ''}|${angle || ''}`;
  const seed = seedSource.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const eventDescriptor = eventParts ? `(${eventParts})` : '';
  const eventName = getEventName(earthx);
  const variants = eventParts ? [
    `${eventName} ${eventDescriptor} is centered on ${themes}.`,
    `At ${eventName} ${eventDescriptor}, leaders focus on ${themes}.`,
    `${eventName} ${eventDescriptor} convenes leaders around ${themes}.`,
    `This April, ${eventName} ${eventDescriptor} brings together teams advancing ${themes}.`,
    `${eventName} ${eventDescriptor} gathers leaders to advance ${themes}.`
  ] : [
    `${eventName} is centered on ${themes}.`,
    `At ${eventName}, leaders focus on ${themes}.`,
    `${eventName} convenes leaders around ${themes}.`,
    `This April, ${eventName} brings together teams advancing ${themes}.`,
    `${eventName} gathers leaders to advance ${themes}.`
  ];
  const earthxSentence = variants[seed % variants.length];
  const hasDate = dateRef ? sentences.some(s => s.includes(dateRef)) : false;
  const hasLocation = (cityRef || venueRef)
    ? sentences.some(s => s.includes(cityRef) || s.includes(venueRef))
    : false;
  if (!hasDate || !hasLocation) {
    sentences.unshift(earthxSentence);
  } else {
    const idx = sentences.findIndex(s => s.includes(eventName));
    if (idx > 0) {
      const [earthxLine] = sentences.splice(idx, 1);
      sentences.unshift(earthxLine);
    }
  }

  // Add anniversary credibility sentence near the top
  const anniversaryLabel = getAnniversaryLabel(earthx);
  if (anniversaryLabel) {
    const hasAnniversary = sentences.some(s => s.toLowerCase().includes('anniversary'));
    if (!hasAnniversary) {
      const anniversarySentence = anniversaryLabel.toLowerCase().includes('anniversary')
        ? `This marks ${eventName}'s ${anniversaryLabel}.`
        : `This marks ${eventName}'s ${anniversaryLabel} anniversary.`;
      const insertIndex = sentences.length > 1 ? 1 : sentences.length;
      sentences.splice(insertIndex, 0, anniversarySentence);
    }
  }

  // Add a highlight sentence to diversify A/B/C variants
  const highlights = (earthx.earthx_highlights || []).filter(h => h && h.trim().length > 0);
  if (highlights.length > 0) {
    const highlight = highlights[seed % highlights.length];
    const highlightVariants = [
      `A focus this year is ${highlight}.`,
      `This year’s program highlights ${highlight}.`,
      `One highlight this year: ${highlight}.`
    ];
    const highlightLine = highlightVariants[seed % highlightVariants.length];
    if (!sentences.some(s => s.includes(highlight))) {
      const insertIndex = sentences.length > 1 ? 2 : sentences.length;
      sentences.splice(insertIndex, 0, highlightLine);
    }
  }

  // Add a light company-specific context line (Crunchbase-only, hedged).
  const focusSnippet = summarizeCompanyFocus(contact);
  if (focusSnippet && !sentences.some(s => s.includes(focusSnippet))) {
    const cleanedSnippet = focusSnippet.replace(/\.$/, '').trim();
    const verbStart = /^(builds|building|develops|provides|offers|creates|delivers|is|are|runs|operates|designs)\b/i.test(cleanedSnippet);
    const infinitiveSnippet = verbStart ? toInfinitive(cleanedSnippet) : cleanedSnippet;
    const progressiveSnippet = verbStart ? toProgressive(cleanedSnippet) : cleanedSnippet;
    const companyFocusVariants = [
      verbStart
        ? `From Crunchbase, it looks like your team ${cleanedSnippet}.`
        : `From Crunchbase, it looks like your team focuses on ${cleanedSnippet}.`,
      verbStart
        ? `Your team appears to ${infinitiveSnippet}.`
        : `Your team appears to be active in ${cleanedSnippet}.`,
      verbStart
        ? `It looks like you’re ${progressiveSnippet}.`
        : `It looks like you’re building around ${cleanedSnippet}.`
    ];
    const focusLine = companyFocusVariants[seed % companyFocusVariants.length];
    const insertIndex = sentences.length > 1 ? 2 : sentences.length;
    sentences.splice(insertIndex, 0, focusLine);
  }

  // Ensure company leadership connection without describing products
  const industries = contact.crunchbase_industries?.trim();
  const primaryIndustry = industries ? industries.split(',')[0].trim() : 'cleantech';
  const leadershipVariants = [
    `${contact.company_name} is a leader in ${primaryIndustry}, and ${eventName} could be a strong fit for partnerships and visibility.`,
    `${contact.company_name} stands out in ${primaryIndustry}; ${eventName} could be a fit for collaboration and broader visibility.`,
    `${contact.company_name} leads in ${primaryIndustry}, and ${eventName} offers a venue for partnerships and exposure.`
  ];
  const leadershipLine = leadershipVariants[seed % leadershipVariants.length];
  const hasLeadership = sentences.some(s => s.includes('leader in') && s.includes(contact.company_name));
  if (!hasLeadership) {
    const insertIndex = sentences.length > 1 ? 1 : sentences.length;
    sentences.splice(insertIndex, 0, leadershipLine);
  }

  // Clean up awkward redundancies introduced by post-processing replacements.
  sentences = sentences.map((s) => s
    .replace(/\s+and business expansion and market entry\.?/gi, '.')
    .replace(/\s+and business expansion\.?/gi, '.')
    .replace(/\s+and business expansion and market entry/gi, '')
    .replace(/\s+and business expansion/gi, '')
    .replace(/\s+and market entry\.?/gi, '.')
    .replace(/\s+and market entry/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  ).filter(Boolean);

  // Deduplicate sentences (case-insensitive)
  const seen = new Set<string>();
  sentences = sentences.filter(s => {
    const key = s.toLowerCase().trim();
    if (!key) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Rebuild body and enforce word count 70-120
  let rebuilt = sentences.join(' ');
  let words = rebuilt.split(/\s+/).filter(Boolean);
  while (words.length > 100 && sentences.length > 2) {
    sentences.pop();
    rebuilt = sentences.join(' ');
    words = rebuilt.split(/\s+/).filter(Boolean);
  }

  // Ensure minimum length with a short supportive sentence
  if (words.length < 70) {
    const mission = earthx.earthx_mission || 'EarthX connects leaders advancing environmental progress.';
    if (!rebuilt.toLowerCase().includes(mission.toLowerCase())) {
      rebuilt = `${rebuilt} ${mission}`.trim();
    }
    words = rebuilt.split(/\s+/).filter(Boolean);
    if (words.length < 70) {
      const themes = summarizeThemes(earthx);
      rebuilt = `${rebuilt} ${contact.company_name} aligns with ${eventName}'s focus on ${themes}.`.trim();
    }
  }

  // Add CTA question
  const ctaVariants = [
    `Open to a quick call to see if ${eventName} is a fit for ${contact.company_name}?`,
    `Open to a quick call next week to see if ${eventName} fits ${contact.company_name}?`,
    `Open to a quick intro to see if ${eventName} is a fit for ${contact.company_name}?`
  ];
  const cta = ctaVariants[seed % ctaVariants.length];

  // Final signature
  const senderName = earthx.earthx_outreach_sender_name || 'Your Name';
  const senderOrg = earthx.earthx_outreach_sender_org || 'Your Organization';

  // Final dedupe pass after padding
  const finalSentences = sentenceSplit(rebuilt).filter(s => s.trim().length > 0);
  const seenFinal = new Set<string>();
  const uniqueFinal = finalSentences.filter(s => {
    const key = s.toLowerCase().trim();
    if (seenFinal.has(key)) return false;
    seenFinal.add(key);
    return true;
  });
  const finalRebuilt = uniqueFinal.join(' ');

  const greeting = contact.first_name ? `Dear ${contact.first_name},\n\n` : '';
  const finalBody = `${greeting}${finalRebuilt}\n\n${cta}\n\nBest regards,\n${senderName}, ${senderOrg}`;

  return {
    subject: applyEventName(subject, earthx),
    body: applyEventName(finalBody, earthx)
  };
}

export function getAvailableFields(contact: ContactData): string[] {
  const fields: string[] = [];

  if (contact.crunchbase_description) fields.push('crunchbase_description');
  if (contact.crunchbase_industries) fields.push('crunchbase_industries');
  if (contact.crunchbase_headquarters_location) fields.push('crunchbase_headquarters_location');
  if (contact.crunchbase_stage) fields.push('crunchbase_stage');
  if (contact.crunchbase_number_of_employees) fields.push('crunchbase_number_of_employees');
  if (contact.crunchbase_estimated_revenue_range) fields.push('crunchbase_estimated_revenue_range');
  if (contact.crunchbase_total_funding_amount) fields.push('crunchbase_total_funding_amount');
  if (contact.website) fields.push('website');

  return fields;
}

export function calculateCoverageScore(usedFields: string[], availableFields: string[]): number {
  const requiredFields: string[] = [];
  const optionalFields = availableFields.filter(f => !requiredFields.includes(f));

  let score = 0;

  // At least one of description/industries (5 points)
  const descFields = ['crunchbase_description', 'crunchbase_industries'];
  if (descFields.some(f => usedFields.includes(f))) score += 5;

  // Optional fields (up to 5 points)
  const optionalUsed = optionalFields.filter(f => usedFields.includes(f));
  score += Math.min(optionalUsed.length * 2, 5);

  return Math.min(score, 15);
}

export function checkBannedPhrases(text: string): number {
  return BANNED_PHRASES.filter(phrase =>
    text.toLowerCase().includes(phrase.toLowerCase())
  ).length;
}

export function calculateSimilarity(text: string, recentTexts: string[]): number {
  if (recentTexts.length === 0) return 0;

  // Simple trigram similarity
  const getTrigrams = (s: string) => {
    const trigrams = new Set<string>();
    const clean = s.toLowerCase().replace(/[^a-z0-9\s]/g, '').toLowerCase();
    for (let i = 0; i < clean.length - 2; i++) {
      trigrams.add(clean.slice(i, i + 3));
    }
    return trigrams;
  };

  const textTrigrams = getTrigrams(text);
  let maxSimilarity = 0;

  for (const recent of recentTexts) {
    const recentTrigrams = getTrigrams(recent);
    const intersection = new Set([...textTrigrams].filter(x => recentTrigrams.has(x)));
    const union = new Set([...textTrigrams, ...recentTrigrams]);
    const similarity = intersection.size / union.size;
    maxSimilarity = Math.max(maxSimilarity, similarity);
  }

  return maxSimilarity;
}

export function generateHash(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

export function validateDraft(draft: DraftResult, earthxData: EarthXData, contact: ContactData): boolean {
  // Length check: 70-120 words (tightened for concise, impactful emails)
  const wordCount = draft.body.split(/\s+/).length;
  if (wordCount < 70 || wordCount > 120) {
    console.log(`Word count fail: ${wordCount}`);
    return false;
  }

  // Exactly one CTA question
  const questions = draft.body.match(/\?/g);
  if (!questions || questions.length !== 1) {
    console.log(`Question count fail: ${questions?.length || 0}`);
    return false;
  }

  // No banned phrases
  if (draft.banned_phrase_hits > 0) {
    console.log(`Banned phrases: ${draft.banned_phrase_hits}`);
    return false;
  }

  // Subject <= 16 words (supports multi-word event names and long company names)
  const subjectWords = draft.subject.split(/\s+/).length;
  if (subjectWords > 16) {
    console.log(`Subject too long: ${subjectWords}`);
    return false;
  }

  // Must reference EarthX facts properly
  const dateRef = earthxData.earthx_date_range || earthxData.event_date_range || '';
  const cityRef = earthxData.earthx_city || earthxData.event_city || '';
  const venueRef = earthxData.earthx_venue || earthxData.event_venue || '';
  const hasDateRef = dateRef ? draft.body.includes(dateRef) : false;
  const hasLocationRef = (cityRef && draft.body.includes(cityRef)) ||
                        (venueRef && draft.body.includes(venueRef));
  const requireDate = Boolean(dateRef);
  const requireLocation = Boolean(cityRef || venueRef);
  if ((requireDate && !hasDateRef) || (requireLocation && !hasLocationRef)) {
    console.log(`Missing EarthX refs: date=${hasDateRef}, location=${hasLocationRef}`);
    return false;
  }

  // Must have at least one company-specific sentence
  const sentences = draft.body.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const companySentences = sentences.filter(s =>
    s.includes(contact.company_name) ||
    s.includes(contact.crunchbase_description || '') ||
    s.includes(contact.crunchbase_industries || '')
  );
  if (companySentences.length < 1) {
    console.log(`Company sentences: ${companySentences.length}`);
    return false;
  }

  // Field utilization gate
  const availableFields = getAvailableFields(contact);
  const usedFields = draft.used_fields_json ? JSON.parse(draft.used_fields_json) : [];
  
  // If industries exist, they must be used
  if (contact.crunchbase_industries && !usedFields.includes('crunchbase_industries')) {
    console.log('Industries available but not used');
    return false;
  }
  
  // If description exists, it must be used
  if (contact.crunchbase_description && !usedFields.includes('crunchbase_description')) {
    console.log('Description available but not used');
    return false;
  }
  
  // Minimum field usage: if >=3 fields available, must use at least 2
  if (availableFields.length >= 3 && usedFields.length < 2) {
    console.log(`Insufficient field usage: ${usedFields.length}/${availableFields.length} available`);
    return false;
  }

  return true;
}
