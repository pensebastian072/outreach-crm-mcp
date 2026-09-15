import { Database } from "../db/database";

// Types for Hormozi email structure
interface ContactData {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  title: string;
  companyName: string;
  industry?: string;
  linkedinUrl?: string;
}

interface EarthXData {
  eventDate: string;
  eventLocation: string;
  eventCity: string;
  eventYear: number;
  mission: string;
  expectedAttendees: number;
}

interface HormoziEmail {
  subject: string;
  previewText: string;
  nugget: string;
  problemStatement: string;
  solution: string;
  cta: string;
  psStatement: string;
  body: string;
  wordCount: number;
  linkCount: number;
  angle: string;
}

// Industry-specific immediate value nuggets (the hook)
const NUGGET_LIBRARY: Record<string, string[]> = {
  cleantech: [
    "The future of energy isn't about making technology cleaner—it's about making clean technology economical.",
    "Most cleantech companies fail not because their technology is bad, but because they're selling to the wrong buyer.",
    "88% of cleantech funding goes to just 5% of companies. The difference? Access to the right customer.",
    "The average cleantech company spends 18 months finding the first enterprise customer. EarthX shortens that to 5 days.",
  ],
  renewable: [
    "Renewable energy's biggest bottleneck isn't technology—it's partnerships with companies that need it.",
    "If you're not at EarthX, you're missing conversations with 10,000+ decision-makers actively buying renewable solutions.",
    "The fastest-growing renewable companies didn't grow because they were smarter. They grew because they were in the room.",
  ],
  sustainability: [
    "Sustainability initiatives fail because companies buy tools, not because they lack tools.",
    "The companies winning in ESG aren't the ones with the best metrics—they're the ones with the best partnerships.",
    "Most sustainability programs reach 40% of their potential because they don't have access to complementary solutions.",
  ],
  energy: [
    "Energy transition will be won by whoever builds the best supply chain, not whoever builds the best technology.",
    "The average energy sector executive meets 12 vendors per year at conferences. EarthX puts 50,000+ in one place.",
    "90% of energy partnerships start with an unexpected conversation at the right time and place.",
  ],
  infrastructure: [
    "Infrastructure projects don't fail because of engineering—they fail because stakeholders aren't aligned from day one.",
    "The companies winning infrastructure contracts are the ones who've already met the decision-maker informally.",
    "EarthX accelerates infrastructure sales cycles by 3-5x because relationships are built before the RFP process starts.",
  ],
};

// Problem statements per angle
const PROBLEM_STATEMENTS: Record<string, Record<string, string>> = {
  COMPANY_FIRST: {
    cleantech: "Most companies in {industry} miss 60% of partnership opportunities because they're not in the right room at the right time.",
    renewable: "Renewable companies leave money on the table because they don't have direct access to enterprise customers.",
    sustainability: "Sustainability-focused businesses struggle to scale because they work in isolation instead of building ecosystems.",
    energy: "Energy companies invest heavily in business development, but 70% of those conversations never convert to partnerships.",
    infrastructure: "Infrastructure providers lose major contracts to competitors simply because they weren't in the initial conversation.",
  },
  ROLE_FIRST: {
    cleantech: "As a {title}, you're drowning in vendor emails, but missing conversations with the actual decision-makers who move budgets.",
    renewable: "Decision-makers like you need direct supplier access, but traditional channels waste months just setting up introductions.",
    sustainability: "You're tasked with scaling {company_name}, but your sourcing options are limited to cold calls and email outreach.",
    energy: "Your team is under pressure to diversify the supply chain, but you don't have reliable access to new solution providers.",
    infrastructure: "You manage supplier relationships, but your best opportunities come from unexpected conversations, not formal processes.",
  },
  EVENT_FIRST: {
    cleantech: "EarthX brings 50,000+ decision-makers together for 5 days. Most cleantech companies send one person or no one at all.",
    renewable: "In Dallas April 22-26, enterprise customers are actively meeting renewable suppliers. {company_name} should be in those conversations.",
    sustainability: "EarthX is where sustainability agendas become supply chain reality. Missing it means missing 18 months of progress.",
    energy: "Energy executives do their networking at events like EarthX. Not being there means your competitors are in the room instead.",
    infrastructure: "Infrastructure deals start at conferences like EarthX. The companies that attend early close contracts 6 months faster.",
  },
};

// CTAs per angle
const CONTEXTUAL_CTAs: Record<string, Record<string, string>> = {
  COMPANY_FIRST: {
    cleantech: "If {company_name} wants to accelerate partnership growth with enterprise customers, let's talk about your EarthX strategy.",
    renewable: "If your team wants direct enterprise customer access in renewable energy, let's discuss how EarthX fits your growth plan.",
    sustainability: "If you're ready to scale {company_name}'s impact, let's explore how EarthX unlocks partnership opportunities.",
    energy: "If {company_name} is serious about diversifying its energy supply chain, we should talk about your EarthX presence.",
    infrastructure: "If your infrastructure business needs to expand its contract pipeline, let's discuss EarthX as your platform.",
  },
  ROLE_FIRST: {
    cleantech: "If you want direct access to enterprise buyers for your solutions, let's talk about positioning {company_name} at EarthX.",
    renewable: "If you're responsible for supplier relationships and want to reduce sourcing time, let's discuss your EarthX strategy.",
    sustainability: "If you're tasked with scaling and need ecosystem partners, let's talk about connecting at EarthX.",
    energy: "If you need faster access to energy solution providers, we should discuss how EarthX changes your sourcing process.",
    infrastructure: "If you're managing supplier expansion, let's talk about how EarthX accelerates your partnership timeline.",
  },
  EVENT_FIRST: {
    cleantech: "If {company_name} is thinking about EarthX, let's make sure you're set up to capture the right conversations.",
    renewable: "If your renewable business is going to Dallas April 22-26, let's talk strategy before you arrive.",
    sustainability: "If you're considering EarthX, let's discuss how to maximize your impact in a 5-day event.",
    energy: "If energy buyers and suppliers are meeting at EarthX, {company_name} should have a plan. Let's talk about it.",
    infrastructure: "If you're attending EarthX, let's prepare to make sure you meet the right decision-makers for your business.",
  },
};

// PS statements (high-read section)
const PS_STATEMENTS = [
  "P.S. Last year, 3 companies at EarthX pivoted their entire go-to-market based on conversations they had here. Worth exploring.",
  "P.S. 40% of attendees leave EarthX with at least one partnership agreement in motion. Most plan ahead.",
  "P.S. The conversations that matter usually happen outside the official sessions. Being present opens those doors.",
  "P.S. One of our fastest-growing partners met their largest customer at an event similar to EarthX. Coincidence? No.",
  "P.S. If you're curious, I'm happy to share a quick list of which sessions actually matter for your space. Just ask.",
];

/**
 * Generate a Hormozi Value-First email
 * Structure: Nugget → Problem → Solution → CTA → PS
 */
export async function generateHormoziEmail(
  db: Database,
  contact: ContactData,
  earthx: EarthXData,
  angle: "COMPANY_FIRST" | "ROLE_FIRST" | "EVENT_FIRST" = "COMPANY_FIRST"
): Promise<HormoziEmail> {
  const industry = contact.industry?.toLowerCase() || "cleantech";
  
  // Select a random nugget from the industry library
  const nuggets = NUGGET_LIBRARY[industry] || NUGGET_LIBRARY.cleantech;
  const nugget = nuggets[Math.floor(Math.random() * nuggets.length)];

  // Get problem statement for this angle
  const problemsForAngle = PROBLEM_STATEMENTS[angle] || PROBLEM_STATEMENTS.COMPANY_FIRST;
  const problemTemplate = problemsForAngle[industry] || problemsForAngle.cleantech;
  const problemStatement = problemTemplate
    .replace("{industry}", industry)
    .replace("{title}", contact.title)
    .replace("{company_name}", contact.companyName);

  // Build solution (EarthX value prop)
  const solution = `${earthx.eventCity} brings together 50,000+ decision-makers in one place for 5 days (${earthx.eventDate}). ${contact.companyName} gets direct access to enterprise customers, partners, and investors actively looking for solutions in your space.`;

  // Get CTA for this angle
  const ctasForAngle = CONTEXTUAL_CTAs[angle] || CONTEXTUAL_CTAs.COMPANY_FIRST;
  const ctaTemplate = ctasForAngle[industry] || ctasForAngle.cleantech;
  const cta = ctaTemplate.replace("{company_name}", contact.companyName);

  // Random PS statement
  const psStatement = PS_STATEMENTS[Math.floor(Math.random() * PS_STATEMENTS.length)];

  // Assemble full body
  const body = `${nugget}\n\n${problemStatement}\n\n${solution}\n\n${cta}\n\n${psStatement}\n\nBest,\nYour Name\nYour Organization`;

  // Generate subject line
  const subject = `HQ Minute: ${contact.companyName} & EarthX ${earthx.eventDate}`;

  // Generate preview text
  const previewText = `Quick thought on EarthX for your team`;

  // Calculate metrics
  const wordCount = body.split(/\s+/).length;
  const linkCount = (body.match(/http/g) || []).length;

  return {
    subject,
    previewText,
    nugget,
    problemStatement,
    solution,
    cta,
    psStatement,
    body,
    wordCount,
    linkCount,
    angle,
  };
}

/**
 * Validate that email meets Hormozi framework requirements
 */
export function validateHormoziEmail(email: HormoziEmail): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Word count should be 100-200 words
  if (email.wordCount < 100) {
    errors.push(`Email too short: ${email.wordCount} words (minimum 100)`);
  }
  if (email.wordCount > 200) {
    errors.push(`Email too long: ${email.wordCount} words (maximum 200)`);
  }

  // Link count should be 0-2
  if (email.linkCount > 2) {
    errors.push(`Too many links: ${email.linkCount} (maximum 2)`);
  }

  // Subject must include "HQ" brand
  if (!email.subject.includes("HQ")) {
    errors.push("Subject must include 'HQ' brand marker");
  }

  // Preview text must exist
  if (!email.previewText || email.previewText.length === 0) {
    errors.push("Preview text is required");
  }

  // Body must have all 5 Hormozi components
  if (!email.nugget) {
    errors.push("Missing immediate value nugget");
  }
  if (!email.problemStatement) {
    errors.push("Missing problem statement");
  }
  if (!email.solution) {
    errors.push("Missing solution/value prop");
  }
  if (!email.cta) {
    errors.push("Missing call-to-action");
  }
  if (!email.psStatement) {
    errors.push("Missing PS statement");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Format email for database storage and sending
 */
export function formatHormoziEmailForSending(email: HormoziEmail): {
  subject: string;
  body: string;
  previewText: string;
} {
  return {
    subject: email.subject,
    body: email.body,
    previewText: email.previewText,
  };
}
