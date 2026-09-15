import * as fs from 'fs';
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

export function parseEarthXContextDoc(text: string): EarthXContext {
  // Helper to extract key/value pairs
  function extractKV(section: string, key: string): string {
    const regex = new RegExp(key + ':\s*([^\n]+)', 'i');
    const match = section.match(regex);
    return match ? match[1].trim() : '';
  }

  // EARTHX FACTS
  const factsSection = text.split('________________________________________')[0];
  const organization_name = extractKV(factsSection, 'Organization name');
  const org_description = extractKV(factsSection, 'Org description');
  const org_founded_year = extractKV(factsSection, 'Org founded year');
  const event_name = extractKV(factsSection, 'event_name');
  const event_city = extractKV(factsSection, 'event_city');
  const event_venue = extractKV(factsSection, 'event_venue');
  const event_date_range = extractKV(factsSection, 'event_date_range');
  const event_anniversary_years = extractKV(factsSection, 'event_anniversary_years');
  const event_industry_leader_claim = extractKV(factsSection, 'event_industry_leader_claim');

  // CORE THEMES
  const themesSection = text.split('2) CORE THEMES')[1]?.split('________________________________________')[0] || '';
  const themeRegex = /\d+\.\s*([\w &]+)[\s\S]*?(?=\d+\.|$)/g;
  const core_themes: string[] = [];
  let themeMatch;
  while ((themeMatch = themeRegex.exec(themesSection)) !== null) {
    core_themes.push(themeMatch[1].trim());
  }

  // PARTNER PROFILE
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

  // OUTREACH OFFER
  const outreachSection = text.split('4) APPROVED OUTREACH OFFER')[1]?.split('________________________________________')[0] || '';
  const outreach_offers: string[] = [];
  const offerRegex = /•\s*(ask_type_[ABC]):\s*“([^”]+)”/g;
  let offerMatch;
  while ((offerMatch = offerRegex.exec(outreachSection)) !== null) {
    outreach_offers.push(offerMatch[2].trim());
  }
  const default_cta = outreachSection.match(/Default CTA \(your style\):\s*“([^”]+)”/)?.[1] || '';

  // ROLE-BASED BENEFIT MESSAGING
  const roleSection = text.split('5) ROLE-BASED BENEFIT MESSAGING')[1]?.split('________________________________________')[0] || '';
  const role_benefit_map: Record<string, string> = {};
  const roleRegex = /•\s*([^:]+):\s*“([^”]+)”/g;
  let roleMatch;
  while ((roleMatch = roleRegex.exec(roleSection)) !== null) {
    role_benefit_map[roleMatch[1].trim()] = roleMatch[2].trim();
  }

  // COMPLIANCE + TONE RULES
  const complianceSection = text.split('6) COMPLIANCE + TONE RULES')[1]?.split('________________________________________')[0] || '';
  const compliance_rules: string[] = [];
  const complianceRegex = /•\s*“([^”]+)”/g;
  let complianceMatch;
  while ((complianceMatch = complianceRegex.exec(complianceSection)) !== null) {
    compliance_rules.push(complianceMatch[1].trim());
  }
  const tone = complianceSection.match(/Tone: ([^\.]+)/)?.[1].trim() || '';

  // CONTACT
  const contactSection = text.split('7) CONTACT')[1]?.split('________________________________________')[0] || '';
  const contact_email = extractKV(contactSection, 'partnerships@yourdomain.com') || 'partnerships@yourdomain.com';
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