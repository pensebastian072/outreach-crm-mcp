import { ContactData, EarthXData, DraftResult, applyEventName, getAnniversaryLabel, getEventName } from './email-utils';
import { normalizeTitle, getTitleCategory } from './title-utils';

export interface EmailTemplate {
  id: string;
  category: string;
  structure: (contact: ContactData, earthx: EarthXData, angle: string, selectedHighlight: string, selectedAttendeeType: string, selectedFocusArea: string) => { subject: string; body: string; usedFields: string[] };
}

function trimSubjectWords(subject: string, maxWords: number = 12): string {
  const words = subject.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return subject.trim();
  return words.slice(0, maxWords).join(' ');
}

function buildAnniversarySubject(subject: string, earthx: EarthXData, contact: ContactData): string {
  const label = getAnniversaryLabel(earthx);
  if (!label) return trimSubjectWords(subject);
  const eventName = getEventName(earthx);

  const lower = subject.toLowerCase();
  if (lower.includes('anniversary') || lower.includes(label.toLowerCase())) {
    return trimSubjectWords(subject);
  }

  const subjectTail = subject
    .replace(new RegExp(escapeRegExp(eventName), 'gi'), '')
    .replace(/earthx/gi, '')
    .replace(/[-–—]/g, ' ')
    .trim();
  const tailWords = subjectTail.split(/\s+/).filter(Boolean).slice(0, 2).join(' ');
  const company = contact.company_name ? contact.company_name.split(/\s+/).slice(0, 2).join(' ') : '';
  const pieces = [eventName, label, 'Anniversary', tailWords || company].filter(Boolean).join(' ');

  return trimSubjectWords(pieces);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function generateDiverseSubject(contact: ContactData, earthx: EarthXData, angle: string, selectedHighlight: string, selectedAttendeeType: string, category: string): string {
  const highlightShort = selectedHighlight
    ? selectedHighlight.split(/\s+/).slice(0, 3).join(' ')
    : (earthx.earthx_highlights[0] || 'Innovation');
  const industryShort = contact.crunchbase_industries?.split(',')[0]?.trim() || 'Cleantech';
  const cityShort = earthx.earthx_city || 'Dallas';

  const subjectTemplates = [
    // Event-focused
    `EarthX ${highlightShort}`,
    `EarthX in ${cityShort}`,
    `EarthX ${industryShort}`,

    // Company-focused
    `${contact.company_name} + EarthX`,
    `${contact.company_name} at EarthX`,

    // Leadership-focused
    `EarthX for ${selectedAttendeeType}`,
    `Leadership at EarthX`,

    // Value-focused
    `EarthX Connections`,
    `EarthX Innovation`,

    // Industry-focused
    `${industryShort} at EarthX`
  ];

  // Select based on angle
  let filteredTemplates = subjectTemplates;
  if (angle === 'ROLE_FIRST') {
    filteredTemplates = subjectTemplates.filter(s => s.includes('Connecting') || s.includes('Leadership') || s.includes(selectedAttendeeType));
  } else if (angle === 'COMPANY_FIRST') {
    filteredTemplates = subjectTemplates.filter(s => s.includes(contact.company_name) || s.includes('Perfect for'));
  } else if (angle === 'EVENT_FIRST') {
    filteredTemplates = subjectTemplates.filter(s => s.includes('EarthX') && !s.includes(contact.company_name));
  }

  const baseSubject = filteredTemplates[Math.floor(Math.random() * filteredTemplates.length)];
  return buildAnniversarySubject(baseSubject, earthx, contact);
}

function getPrimaryIndustry(contact: ContactData): string {
  const industries = contact.crunchbase_industries
    ?.split(',')
    .map(i => i.trim())
    .filter(Boolean);
  return industries && industries.length > 0 ? industries[0] : 'cleantech';
}

function formatEventLine(earthx: EarthXData): string {
  const eventName = getEventName(earthx);
  const dateRange = earthx.event_date_range || earthx.earthx_date_range || '';
  const venue = earthx.event_venue || earthx.earthx_venue || '';
  const city = earthx.event_city || earthx.earthx_city || '';
  const parts = [dateRange, venue ? `at ${venue}` : '', city ? `in ${city}` : '']
    .filter(Boolean)
    .join(' ');
  return parts ? `${eventName} (${parts})` : eventName;
}

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: 'ceo_role_first',
    category: 'CEO_FOUNDER',
    structure: (contact, earthx, angle, selectedHighlight, selectedAttendeeType, selectedFocusArea) => {
      const usedFields: string[] = [];
      const industry = getPrimaryIndustry(contact);
      let subject = '';
      let body = '';

      if (angle === 'ROLE_FIRST') {
        subject = generateDiverseSubject(contact, earthx, angle, selectedHighlight, selectedAttendeeType, 'CEO_FOUNDER');
        body = `Dear ${contact.first_name},

${formatEventLine(earthx)} brings together leaders focused on ${selectedFocusArea} and practical environmental solutions.

${contact.company_name} is a leader in ${industry}, and EarthX could be a strong fit to connect with ${selectedAttendeeType} and explore partnerships that expand impact.

${earthx.earthx_mission || 'EarthX convenes leaders accelerating environmental progress.'}

Best regards,
${earthx.earthx_outreach_sender_name || 'Your Name'}, ${earthx.earthx_outreach_sender_org || 'Your Organization'}`;
        if (contact.crunchbase_industries) usedFields.push('crunchbase_industries');
      } else if (angle === 'COMPANY_FIRST') {
        subject = `${contact.company_name} & EarthX ${earthx.earthx_date_range || earthx.event_date_range}`;
        body = `Dear ${contact.first_name},

${formatEventLine(earthx)} brings together leaders focused on ${selectedFocusArea} and practical environmental solutions.

${contact.company_name} is a leader in ${industry}, and EarthX could be a strong fit to connect with ${selectedAttendeeType} and explore partnerships that expand impact.

${earthx.earthx_mission || 'EarthX convenes leaders accelerating environmental progress.'}

Best regards,
${earthx.outreach_sender_name || 'Your Name'}, ${earthx.outreach_sender_org || 'Your Organization'}`;
        if (contact.crunchbase_industries) usedFields.push('crunchbase_industries');
      } else if (angle === 'EVENT_FIRST') {
        subject = generateDiverseSubject(contact, earthx, angle, selectedHighlight, selectedAttendeeType, 'CEO_FOUNDER');
        body = `Dear ${contact.first_name},

${formatEventLine(earthx)} showcases ${(earthx.core_themes || earthx.earthx_core_themes || []).slice(0, 2).join(' and ')} for cleantech leaders.

${contact.company_name} is a leader in ${industry}, and EarthX could be a strong fit to connect with ${selectedAttendeeType} and explore partnerships that expand impact.

${earthx.earthx_mission || 'EarthX convenes leaders accelerating environmental progress.'}

Best regards,
${earthx.outreach_sender_name || 'Your Name'}, ${earthx.outreach_sender_org || 'Your Organization'}`;
        if (contact.crunchbase_industries) usedFields.push('crunchbase_industries');
      }

      return { subject, body, usedFields };
    }
  },

  {
    id: 'cto_company_first',
    category: 'CTO_PRODUCT',
    structure: (contact, earthx, angle, selectedHighlight, selectedAttendeeType, selectedFocusArea) => {
      const usedFields = ['title'];
      let subject = '';
      let body = '';

      if (angle === 'COMPANY_FIRST') {
        subject = `${contact.company_name} & EarthX ${earthx.event_date_range}`;
        body = `Dear ${contact.first_name},

${contact.crunchbase_description ? `${contact.company_name} ${contact.crunchbase_description.slice(0, 100)}... This represents a significant advancement in cleantech innovation.` : `${contact.company_name} is doing impressive work in the cleantech space, developing solutions that address critical environmental challenges.`}

EarthX (${earthx.event_date_range} at ${earthx.event_venue} in ${earthx.event_city}) features ${(earthx.core_themes || earthx.earthx_core_themes || [])[0] || 'innovative cleantech solutions'} and connects CTOs with cutting-edge technologies in ${selectedFocusArea}.

The event brings together technical leaders from across the cleantech ecosystem, providing opportunities for learning about emerging technologies, sharing insights with peers, and exploring potential collaborations.

As ${normalizeTitle(contact.title)}, your technical expertise at ${contact.company_name} would make you a valuable contributor to the EarthX community.

${earthx.earthx_default_cta ? earthx.earthx_default_cta.replace('{company_name}', contact.company_name) : 'Interested in how EarthX can benefit ' + contact.company_name + '?'}

Best regards,
${earthx.outreach_sender_name || 'Your Name'}, ${earthx.outreach_sender_org || 'Your Organization'}`;
        if (contact.crunchbase_description) usedFields.push('crunchbase_description');
      } else if (angle === 'ROLE_FIRST') {
        subject = `CTO Leadership + EarthX ${earthx.event_date_range}`;
        body = `Dear ${contact.first_name},

As ${normalizeTitle(contact.title)} at ${contact.company_name}, you drive technological innovation${contact.crunchbase_description ? `, particularly with ${contact.company_name}'s work in ${contact.crunchbase_description.slice(0, 70)}...` : ' in the cleantech sector.'}

EarthX (${earthx.event_date_range} at ${earthx.event_venue} in ${earthx.event_city}) brings together CTOs and technical leaders to explore ${(earthx.core_themes || earthx.earthx_core_themes || [])[0] || 'cutting-edge cleantech solutions'} in ${selectedFocusArea}.

The event features technical deep-dives, innovation showcases, and networking with fellow technology executives shaping the future of sustainable solutions.

Your leadership in technology development would be highly valued at EarthX. Many CTOs have leveraged the event to identify new technological approaches and collaborate on breakthrough solutions.

${earthx.earthx_default_cta ? earthx.earthx_default_cta.replace('{company_name}', contact.company_name) : 'Interested in how EarthX can benefit ' + contact.company_name + '?'}

Best regards,
${earthx.outreach_sender_name || 'Your Name'}, ${earthx.outreach_sender_org || 'Your Organization'}`;
        if (contact.crunchbase_description) usedFields.push('crunchbase_description');
      } else if (angle === 'EVENT_FIRST') {
        subject = `EarthX ${earthx.event_date_range} - CTO Connect`;
        body = `Dear ${contact.first_name},

EarthX (${earthx.event_date_range} at ${earthx.event_venue} in ${earthx.event_city}) showcases ${(earthx.core_themes || earthx.earthx_core_themes || []).slice(0, 2).join(' and ')} for cleantech innovators, featuring technical sessions on emerging technologies and networking opportunities with industry leaders.

${contact.crunchbase_description ? `${contact.company_name}'s work in ${contact.crunchbase_description.slice(0, 80)}... aligns perfectly with EarthX's focus on technological solutions for environmental challenges.` : `${contact.company_name} contributes to cleantech innovation, relevant to the EarthX technical community.`}

As ${normalizeTitle(contact.title)}, your technical expertise would be valuable at EarthX. The event connects CTOs with cutting-edge developments in ${selectedFocusArea}, providing opportunities to learn from peers and explore potential collaborations.

${earthx.earthx_default_cta ? earthx.earthx_default_cta.replace('{company_name}', contact.company_name) : 'Interested in how EarthX can benefit ' + contact.company_name + '?'}

Best regards,
${earthx.outreach_sender_name || 'Your Name'}, ${earthx.outreach_sender_org || 'Your Organization'}`;
        if (contact.crunchbase_description) usedFields.push('crunchbase_description');
      }

      return { subject, body, usedFields };
    }
  },

  {
    id: 'bizdev_event_first',
    category: 'PARTNERSHIPS_BIZDEV',
    structure: (contact, earthx, angle, selectedHighlight, selectedAttendeeType, selectedFocusArea) => {
      const usedFields = ['title'];
      let subject = '';
      let body = '';

      if (angle === 'EVENT_FIRST') {
        subject = `EarthX ${earthx.earthx_date_range} - ${earthx.earthx_highlights[0] || 'Innovation Showcase'}`;
        body = `Dear ${contact.first_name},

EarthX (${earthx.earthx_date_range} at ${earthx.earthx_venue} in ${earthx.earthx_city}) showcases ${earthx.earthx_highlights.slice(0, 2).join(' and ')} for cleantech leaders, bringing together innovators, investors, and strategic partners from around the world.

${contact.crunchbase_industries ? `${contact.company_name} operates in ${contact.crunchbase_industries}, which connects directly with EarthX's focus on ${selectedFocusArea}.` : ''}

The event features extensive networking opportunities, including dedicated partnership sessions, investor meetups, and industry roundtables. Previous EarthX events have resulted in numerous successful partnerships and funding rounds for participating companies.

We're looking to connect with ${normalizeTitle(contact.title)} professionals like yourself who are driving business development and strategic partnerships in the cleantech sector. EarthX provides an ideal environment for identifying potential collaborators and exploring new market opportunities.

Open to a quick intro next week to discuss how ${contact.company_name} might engage with the EarthX community?

Best regards,
${earthx.earthx_outreach_sender_name || 'Your Name'}, ${earthx.earthx_outreach_sender_org || 'Your Organization'}`;
        if (contact.crunchbase_industries) usedFields.push('crunchbase_industries');
      } else if (angle === 'COMPANY_FIRST') {
        subject = `${contact.company_name} & EarthX ${earthx.earthx_date_range || earthx.event_date_range}`;
        body = `Dear ${contact.first_name},

${contact.crunchbase_industries ? `${contact.company_name} operates in ${contact.crunchbase_industries}, positioning it as a key player in the cleantech sector.` : `${contact.company_name} is making significant contributions to cleantech innovation and partnership development.`}

EarthX (${earthx.earthx_date_range} at ${earthx.earthx_venue} in ${earthx.earthx_city}) brings together innovators, investors, and strategic partners to explore ${selectedFocusArea}.

As ${normalizeTitle(contact.title)}, your business development expertise at ${contact.company_name} would be highly valued at EarthX. The event features extensive networking opportunities, partnership sessions, and industry roundtables that have resulted in numerous successful collaborations.

Many business development leaders have used EarthX as a platform to identify strategic partners and explore new market opportunities.

Worth exploring partnership opportunities for ${contact.company_name} at EarthX?

Best regards,
${earthx.earthx_outreach_sender_name || 'Your Name'}, ${earthx.earthx_outreach_sender_org || 'Your Organization'}`;
        if (contact.crunchbase_industries) usedFields.push('crunchbase_industries');
      } else if (angle === 'ROLE_FIRST') {
        subject = `Business Development + EarthX ${earthx.earthx_date_range}`;
        body = `Dear ${contact.first_name},

As ${normalizeTitle(contact.title)} at ${contact.company_name}, you understand the complexities of building strategic partnerships in the rapidly evolving cleantech landscape.

EarthX (${earthx.earthx_date_range} at ${earthx.earthx_venue} in ${earthx.earthx_city}) unites business development leaders with innovators, investors, and strategic partners from around the world.

${contact.crunchbase_industries ? `${contact.company_name} operates in ${contact.crunchbase_industries}, which connects directly with EarthX's focus on ${selectedFocusArea}.` : ''}

The event features dedicated partnership sessions, investor meetups, and industry roundtables designed specifically for business development professionals. Previous EarthX events have facilitated numerous successful partnerships and funding opportunities.

Your expertise in strategic partnerships would be invaluable at EarthX. Many business development leaders have leveraged the event to identify collaborators and explore new market opportunities.

Open to discussing how ${contact.company_name} might benefit from EarthX partnerships?

Best regards,
${earthx.earthx_outreach_sender_name || 'Your Name'}, ${earthx.earthx_outreach_sender_org || 'Your Organization'}`;
        if (contact.crunchbase_industries) usedFields.push('crunchbase_industries');
      }

      return { subject, body, usedFields };
    }
  },

  {
    id: 'marketing_stage_focus',
    category: 'MARKETING_GROWTH',
    structure: (contact, earthx, angle, selectedHighlight, selectedAttendeeType, selectedFocusArea) => {
      const usedFields = ['title'];
      let subject = '';
      let body = '';

      if (angle === 'COMPANY_FIRST') {
        subject = `${contact.company_name} & EarthX ${earthx.earthx_date_range}`;
        body = `Dear ${contact.first_name},

${contact.company_name} is at an exciting ${contact.crunchbase_stage || 'growth'} stage${contact.crunchbase_number_of_employees ? ` with ${contact.crunchbase_number_of_employees} team members` : ''} driving cleantech innovation.

EarthX (${earthx.earthx_date_range} at ${earthx.earthx_venue} in ${earthx.earthx_city}) brings together marketing and growth leaders to explore ${selectedFocusArea}.

As ${normalizeTitle(contact.title)}, your perspective on scaling sustainable solutions would be invaluable.

Would you be available for a brief meeting?

Best regards,
${earthx.earthx_outreach_sender_name || 'Your Name'}, ${earthx.earthx_outreach_sender_org || 'Your Organization'}`;
        if (contact.crunchbase_stage) usedFields.push('crunchbase_stage');
        if (contact.crunchbase_number_of_employees) usedFields.push('crunchbase_number_of_employees');
      } else if (angle === 'ROLE_FIRST') {
        subject = `Marketing Leadership + EarthX ${earthx.earthx_date_range}`;
        body = `Dear ${contact.first_name},

As ${normalizeTitle(contact.title)} at ${contact.company_name}, you understand the unique challenges of marketing sustainable technologies in a rapidly evolving cleantech landscape.

EarthX (${earthx.earthx_date_range} at ${earthx.earthx_venue} in ${earthx.earthx_city}) brings together marketing and growth leaders to explore innovative approaches to ${selectedFocusArea}.

${contact.crunchbase_stage ? `${contact.company_name} is at an exciting ${contact.crunchbase_stage} stage${contact.crunchbase_number_of_employees ? ` with ${contact.crunchbase_number_of_employees} team members` : ''}, making this an ideal time to connect with peers facing similar growth challenges.` : ''}

The event features marketing-focused sessions, growth strategy discussions, and extensive networking opportunities with fellow marketing executives from leading cleantech companies.

Your expertise in scaling sustainable solutions would be highly valued at EarthX. Many marketing leaders have used the event to identify new strategies and form valuable partnerships.

Open to exploring how ${contact.company_name} might benefit from EarthX?

Best regards,
${earthx.earthx_outreach_sender_name || 'Your Name'}, ${earthx.earthx_outreach_sender_org || 'Your Organization'}`;
        if (contact.crunchbase_stage) usedFields.push('crunchbase_stage');
        if (contact.crunchbase_number_of_employees) usedFields.push('crunchbase_number_of_employees');
      } else if (angle === 'EVENT_FIRST') {
        subject = `EarthX ${earthx.earthx_date_range} - Growth Leaders`;
        body = `Dear ${contact.first_name},

EarthX (${earthx.earthx_date_range} at ${earthx.earthx_venue} in ${earthx.earthx_city}) showcases ${earthx.earthx_highlights.slice(0, 2).join(' and ')} for cleantech innovators, featuring marketing and growth strategy sessions that bring together leaders from across the sustainable technology ecosystem.

${contact.crunchbase_stage ? `${contact.company_name} is at an exciting ${contact.crunchbase_stage} stage${contact.crunchbase_number_of_employees ? ` with ${contact.crunchbase_number_of_employees} team members` : ''}, which aligns perfectly with EarthX's focus on scaling sustainable solutions.` : `${contact.company_name} is actively contributing to cleantech innovation, making it a great fit for the EarthX marketing community.`}

The event includes dedicated marketing tracks, investor meetups, and networking opportunities with fellow growth leaders. Attendees include marketing executives, growth strategists, and business development leaders from leading cleantech companies.

As ${normalizeTitle(contact.title)}, your marketing perspective would be invaluable at EarthX. Many participants have successfully scaled their marketing efforts and formed strategic partnerships through EarthX connections.

Worth discussing how ${contact.company_name} might engage with the EarthX marketing community?

Best regards,
${earthx.earthx_outreach_sender_name || 'Your Name'}, ${earthx.earthx_outreach_sender_org || 'Your Organization'}`;
        if (contact.crunchbase_stage) usedFields.push('crunchbase_stage');
        if (contact.crunchbase_number_of_employees) usedFields.push('crunchbase_number_of_employees');
      }

      return { subject, body, usedFields };
    }
  },

  {
    id: 'sustainability_mission',
    category: 'SUSTAINABILITY_ESG',
    structure: (contact, earthx, angle, selectedHighlight, selectedAttendeeType, selectedFocusArea) => {
      const usedFields = ['title'];
      let subject = '';
      let body = '';

      if (angle === 'EVENT_FIRST') {
        subject = `EarthX ${earthx.earthx_date_range} - Sustainability`;
        body = `Dear ${contact.first_name},

${earthx.earthx_mission} EarthX (${earthx.earthx_date_range} at ${earthx.earthx_venue} in ${earthx.earthx_city}) is where sustainability leaders connect.

${contact.crunchbase_industries ? `${contact.company_name}'s work in ${contact.crunchbase_industries} aligns with EarthX's focus on ${selectedFocusArea}.` : ''}

We're eager to connect with ${normalizeTitle(contact.title)} professionals driving ESG initiatives.

Worth exploring partnership opportunities?

Best regards,
${earthx.earthx_outreach_sender_name || 'Your Name'}, ${earthx.earthx_outreach_sender_org || 'Your Organization'}`;
        if (contact.crunchbase_industries) usedFields.push('crunchbase_industries');
      } else if (angle === 'COMPANY_FIRST') {
        subject = `${contact.company_name} & EarthX ${earthx.earthx_date_range}`;
        body = `Dear ${contact.first_name},

${contact.crunchbase_industries ? `${contact.company_name}'s work in ${contact.crunchbase_industries} demonstrates a strong commitment to sustainability and environmental impact.` : `${contact.company_name} is making important contributions to cleantech innovation with a focus on sustainable solutions.`}

${earthx.earthx_mission} EarthX (${earthx.earthx_date_range} at ${earthx.earthx_venue} in ${earthx.earthx_city}) brings together sustainability leaders to explore ${selectedFocusArea}.

As ${normalizeTitle(contact.title)}, your expertise in ESG initiatives would be highly valued at EarthX. The event features sustainability-focused sessions, impact investment discussions, and networking with fellow leaders driving positive environmental change.

Many sustainability professionals have used EarthX as a platform to advance their ESG goals and form strategic partnerships.

Worth discussing how ${contact.company_name}'s sustainability initiatives might align with EarthX?

Best regards,
${earthx.earthx_outreach_sender_name || 'Your Name'}, ${earthx.earthx_outreach_sender_org || 'Your Organization'}`;
        if (contact.crunchbase_industries) usedFields.push('crunchbase_industries');
      } else if (angle === 'ROLE_FIRST') {
        subject = `Sustainability Leadership + EarthX ${earthx.earthx_date_range}`;
        body = `Dear ${contact.first_name},

As ${normalizeTitle(contact.title)} at ${contact.company_name}, you play a crucial role in driving ESG initiatives and sustainability strategies in the cleantech sector.

${earthx.earthx_mission} EarthX (${earthx.earthx_date_range} at ${earthx.earthx_venue} in ${earthx.earthx_city}) unites sustainability leaders to advance solutions for ${selectedFocusArea}.

${contact.crunchbase_industries ? `${contact.company_name}'s work in ${contact.crunchbase_industries} aligns perfectly with EarthX's focus on accelerating the transition to a sustainable future.` : ''}

The event features dedicated ESG tracks, impact measurement sessions, and extensive networking opportunities with fellow sustainability executives from leading cleantech companies.

Your leadership in sustainability would be invaluable at EarthX. Many ESG professionals have leveraged the event to identify new approaches and build partnerships that advance environmental goals.

Open to exploring how ${contact.company_name} might contribute to the EarthX sustainability community?

Best regards,
${earthx.earthx_outreach_sender_name || 'Your Name'}, ${earthx.earthx_outreach_sender_org || 'Your Organization'}`;
        if (contact.crunchbase_industries) usedFields.push('crunchbase_industries');
      }

      return { subject, body, usedFields };
    }
  },

  {
    id: 'general_executive',
    category: 'GENERAL',
    structure: (contact, earthx, angle, selectedHighlight, selectedAttendeeType, selectedFocusArea) => {
        const usedFields: string[] = [];
        const industry = getPrimaryIndustry(contact);
      let subject = '';
      let body = '';

      if (angle === 'ROLE_FIRST') {
    subject = `EarthX ${earthx.earthx_date_range} - Connecting with industry leaders`;
        body = `Dear ${contact.first_name},

  ${formatEventLine(earthx)} unites executives, innovators, and investors to explore breakthroughs in ${selectedFocusArea}.

  ${contact.company_name} is a leader in ${industry}, and EarthX could be a strong fit to connect with ${selectedAttendeeType} and explore partnerships that expand impact.

  ${earthx.earthx_mission || 'EarthX convenes leaders accelerating environmental progress.'}

  Best regards,
  ${earthx.earthx_outreach_sender_name || 'Your Name'}, ${earthx.earthx_outreach_sender_org || 'Your Organization'}`;
    if (contact.crunchbase_industries) usedFields.push('crunchbase_industries');
      } else if (angle === 'COMPANY_FIRST') {
    subject = `${contact.company_name} & EarthX ${earthx.earthx_date_range || earthx.event_date_range}`;
        body = `Dear ${contact.first_name},

  ${formatEventLine(earthx)} brings together leaders focused on ${selectedFocusArea} and practical environmental solutions.

  ${contact.company_name} is a leader in ${industry}, and EarthX could be a strong fit to connect with ${selectedAttendeeType} and explore partnerships that expand impact.

  ${earthx.earthx_mission || 'EarthX convenes leaders accelerating environmental progress.'}

  Best regards,
  ${earthx.earthx_outreach_sender_name || 'Your Name'}, ${earthx.earthx_outreach_sender_org || 'Your Organization'}`;
    if (contact.crunchbase_industries) usedFields.push('crunchbase_industries');
      } else if (angle === 'EVENT_FIRST') {
    subject = `EarthX ${earthx.earthx_date_range} - Executive Connect`;
        body = `Dear ${contact.first_name},

  ${formatEventLine(earthx)} showcases ${earthx.earthx_highlights.slice(0, 2).join(' and ')} for cleantech leaders.

  ${contact.company_name} is a leader in ${industry}, and EarthX could be a strong fit to connect with ${selectedAttendeeType} and explore partnerships that expand impact.

  ${earthx.earthx_mission || 'EarthX convenes leaders accelerating environmental progress.'}

  Best regards,
  ${earthx.earthx_outreach_sender_name || 'Your Name'}, ${earthx.earthx_outreach_sender_org || 'Your Organization'}`;
    if (contact.crunchbase_industries) usedFields.push('crunchbase_industries');
      }

      return { subject, body, usedFields };
    }
  },

  {
    id: 'science_research_innovation',
    category: 'SCIENCE_RESEARCH',
    structure: (contact, earthx, angle, selectedHighlight, selectedAttendeeType, selectedFocusArea) => {
      const usedFields = ['title'];
      let subject = '';
      let body = '';

      if (angle === 'ROLE_FIRST') {
        subject = `EarthX ${earthx.earthx_date_range} - Research & Innovation`;
        body = `Dear ${contact.first_name},

As a researcher/scientist at ${contact.company_name}, your work in advancing cleantech solutions is critical to addressing today's environmental challenges. EarthX (${earthx.earthx_date_range} at ${earthx.earthx_venue} in ${earthx.earthx_city}) brings together leading researchers and scientists to explore breakthrough technologies in carbon capture, sustainable agriculture, and clean water innovations.

${contact.crunchbase_description ? `${contact.company_name} ${contact.crunchbase_description.slice(0, 100)}... This research aligns with EarthX's focus on accelerating scientific discovery for environmental impact.` : ''}

The event features technical presentations from leading scientists, collaborative workshops on emerging research, and networking with fellow researchers driving innovation. Attendees include ${selectedAttendeeType} from academic institutions and research organizations worldwide.

${selectedHighlight ? `One highlight of EarthX is ${selectedHighlight}.` : ''}

EarthX provides a platform for researchers to connect with industry partners, explore funding opportunities, and collaborate on solutions that can scale globally.

Would you be interested in presenting your research or exploring collaboration opportunities at EarthX?

Best regards,
Your Name, Your Organization`;
        if (contact.crunchbase_description) usedFields.push('crunchbase_description');
      } else if (angle === 'COMPANY_FIRST') {
        subject = `${contact.company_name} Research & EarthX ${earthx.earthx_date_range}`;
        body = `Dear ${contact.first_name},

${contact.crunchbase_description ? `${contact.company_name}'s research in ${contact.crunchbase_description.slice(0, 120)}... represents cutting-edge work in cleantech innovation.` : `${contact.company_name} is conducting important research that addresses key environmental challenges.`}

EarthX (${earthx.earthx_date_range} at ${earthx.earthx_venue} in ${earthx.earthx_city}) connects researchers with industry leaders to accelerate the translation of scientific discoveries into scalable solutions.

As a researcher at ${contact.company_name}, your expertise would be highly valued at EarthX. The event features technical sessions, research showcases, and opportunities to connect with potential collaborators and funders.

${selectedHighlight ? `One highlight of EarthX is ${selectedHighlight}.` : ''}

Many researchers have used EarthX to form partnerships that advanced their work and increased its real-world impact.

Open to discussing how ${contact.company_name}'s research might fit into EarthX?

Best regards,
Your Name, Your Organization`;
        if (contact.crunchbase_description) usedFields.push('crunchbase_description');
      } else if (angle === 'EVENT_FIRST') {
        subject = `EarthX ${earthx.earthx_date_range} - ${selectedHighlight || 'Scientific Innovation'}`;
        body = `Dear ${contact.first_name},

EarthX (${earthx.earthx_date_range} at ${earthx.earthx_venue} in ${earthx.earthx_city}) is where scientific research meets real-world cleantech innovation. The event brings together researchers, scientists, and industry experts to explore breakthrough solutions in ${selectedFocusArea}.

${selectedHighlight ? `A key highlight is ${selectedHighlight}.` : ''}

${contact.crunchbase_description ? `${contact.company_name}'s research in ${contact.crunchbase_description.slice(0, 100)}... would be a great fit for the EarthX scientific community.` : `Your research at ${contact.company_name} addresses critical environmental challenges that align with EarthX's mission.`}

The event features presentations from leading researchers, technical workshops, and networking opportunities with ${selectedAttendeeType} from academia and industry.

EarthX represents a unique opportunity for researchers to connect with industry partners and accelerate the impact of their work.

Would you consider participating in EarthX to share your research and explore collaboration opportunities?

Best regards,
Your Name, Your Organization`;
        if (contact.crunchbase_description) usedFields.push('crunchbase_description');
      }

      return { subject, body, usedFields };
    }
  },

  {
    id: 'operations_efficiency',
    category: 'OPERATIONS',
    structure: (contact, earthx, angle, selectedHighlight, selectedAttendeeType, selectedFocusArea) => {
      const usedFields = ['title'];
      let subject = '';
      let body = '';

      if (angle === 'ROLE_FIRST') {
        subject = `EarthX ${earthx.earthx_date_range} - Operations Excellence`;
        body = `Dear ${contact.first_name},

As an operations leader at ${contact.company_name}, you understand the challenges of scaling cleantech solutions efficiently and sustainably. EarthX (${earthx.earthx_date_range} at ${earthx.earthx_venue} in ${earthx.earthx_city}) brings together operations executives to explore technologies and strategies for operational excellence in the cleantech sector.

${contact.crunchbase_description ? `${contact.company_name} ${contact.crunchbase_description.slice(0, 100)}... This operational approach aligns with EarthX's focus on scalable, efficient cleantech solutions.` : ''}

The event features sessions on operational best practices, supply chain optimization, and scaling strategies. Attendees include ${selectedAttendeeType} from leading cleantech companies worldwide.

${selectedHighlight ? `One highlight of EarthX is ${selectedHighlight}.` : ''}

EarthX provides operations leaders with insights from peers who have successfully scaled cleantech businesses, including strategies for cost optimization, supply chain management, and operational efficiency.

Would you be available for a brief discussion about operational insights from EarthX?

Best regards,
Your Name, Your Organization`;
        if (contact.crunchbase_description) usedFields.push('crunchbase_description');
      } else if (angle === 'COMPANY_FIRST') {
        subject = `${contact.company_name} Operations & EarthX ${earthx.earthx_date_range}`;
        body = `Dear ${contact.first_name},

${contact.crunchbase_description ? `${contact.company_name}'s operational excellence in ${contact.crunchbase_description.slice(0, 120)}... demonstrates effective scaling of cleantech solutions.` : `${contact.company_name} is effectively scaling cleantech operations, making it a model for the industry.`}

EarthX (${earthx.earthx_date_range} at ${earthx.earthx_venue} in ${earthx.earthx_city}) connects operations leaders with innovative technologies and strategies for operational excellence.

As an operations executive at ${contact.company_name}, your experience would be highly valued at EarthX. The event features practical sessions on operational challenges, technology implementations, and efficiency improvements.

${selectedHighlight ? `One highlight of EarthX is ${selectedHighlight}.` : ''}

Many operations leaders have gained valuable insights and formed partnerships at EarthX that improved their company's efficiency and scalability.

${earthx.earthx_default_cta ? earthx.earthx_default_cta.replace('{company_name}', contact.company_name) : 'Interested in how EarthX can benefit ' + contact.company_name + '?'}

Best regards,
Your Name, Your Organization`;
        if (contact.crunchbase_description) usedFields.push('crunchbase_description');
      } else if (angle === 'EVENT_FIRST') {
        subject = `EarthX ${earthx.earthx_date_range} - ${selectedHighlight || 'Operational Excellence'}`;
        body = `Dear ${contact.first_name},

EarthX (${earthx.earthx_date_range} at ${earthx.earthx_venue} in ${earthx.earthx_city}) focuses on operational excellence in cleantech, bringing together operations leaders to share strategies for scaling sustainable technologies efficiently.

${selectedHighlight ? `A key highlight is ${selectedHighlight}.` : ''}

${contact.crunchbase_description ? `${contact.company_name}'s operational approach to ${contact.crunchbase_description.slice(0, 100)}... would provide valuable insights for the EarthX operations community.` : `Your operational leadership at ${contact.company_name} addresses key challenges in scaling cleantech that align with EarthX's mission.`}

The event features sessions on operational best practices, technology implementations, and efficiency strategies. Attendees include ${selectedAttendeeType} from companies successfully scaling cleantech operations.

EarthX represents an opportunity for operations leaders to learn from peers and explore technologies that can improve efficiency and scalability.

Would you consider participating in EarthX to share your operational insights and learn from others?

Best regards,
Your Name, Your Organization`;
        if (contact.crunchbase_description) usedFields.push('crunchbase_description');
      }

      return { subject, body, usedFields };
    }
  }
];

export function getTemplatesForTitle(title: string): EmailTemplate[] {
  const category = getTitleCategory(title);
  return EMAIL_TEMPLATES.filter(t => t.category === category || t.category === 'GENERAL');
}

export function generateDraft(contact: ContactData, earthx: EarthXData, angle: string, selectedHighlight: string, selectedAttendeeType: string, selectedFocusArea: string): DraftResult {
  const templates = getTemplatesForTitle(contact.title);
  const template = templates[Math.floor(Math.random() * templates.length)];

  const result = template.structure(contact, earthx, angle, selectedHighlight, selectedAttendeeType, selectedFocusArea);

  const subject = applyEventName(buildAnniversarySubject(result.subject, earthx, contact), earthx);
  const body = applyEventName(result.body, earthx);
  const usedFields = result.usedFields;

  return {
    subject,
    body,
    score: 0, // Will be calculated later
    template_id: template.id,
    title_category: template.category,
    angle,
    used_fields_json: JSON.stringify(usedFields),
    coverage_score: 0, // Will be calculated later
    similarity_score: 0, // Will be calculated later
    banned_phrase_hits: 0, // Will be calculated later
    hash: '',
    selected_highlight: selectedHighlight,
    selected_attendee_type: selectedAttendeeType,
    subject_hash: '',
    body_hash: ''
  };
}

