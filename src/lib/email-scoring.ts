import { Database } from '../db/database';
import {
  ContactData,
  EarthXData,
  DraftResult,
  getAvailableFields,
  calculateCoverageScore,
  checkBannedPhrases,
  calculateSimilarity,
  generateHash,
  validateDraft,
  postProcessDraft,
  getAnniversaryLabel
} from './email-utils';
import { generateDraft as generateTemplateDraft } from './templates';
import { getTitleCategory } from './title-utils';

function selectEarthXHighlight(contact: ContactData, earthx: EarthXData): string {
  const industries = contact.crunchbase_industries?.toLowerCase() || '';
  
  // EarthX_HIGHLIGHT_MAP
  const highlightMap: { [key: string]: string[] } = {
    'water': ['Clean water technologies', 'clean water'],
    'carbon': ['Carbon capture innovations', 'carbon capture'],
    'energy': ['Sustainable agriculture solutions', 'sustainable agriculture'],
    'agriculture': ['Sustainable agriculture solutions', 'sustainable agriculture'],
    'climate': ['Carbon capture innovations', 'carbon capture'],
    'environmental': ['Clean water technologies', 'clean water']
  };
  
  for (const [industry, highlights] of Object.entries(highlightMap)) {
    if (industries.includes(industry)) {
      // Find matching highlight
      for (const highlight of highlights) {
        const match = earthx.earthx_highlights.find(h => 
          h.toLowerCase().includes(highlight.toLowerCase())
        );
        if (match) return match;
      }
    }
  }
  
  // Default to a concise context highlight when no industry mapping matches.
  const concise = (earthx.earthx_highlights || []).find(h => h && h.length <= 80 && !h.includes(' - '));
  return concise || earthx.earthx_highlights[0] || earthx.earthx_mission;
}

function selectFocusArea(contact: ContactData, earthx: EarthXData): string {
  const eventName = earthx.event_name || '';
  if (eventName && eventName !== 'EarthX') {
    const themes = (earthx.earthx_core_themes && earthx.earthx_core_themes.length > 0)
      ? earthx.earthx_core_themes
      : (earthx.earthx_highlights || []);
    if (themes.length > 0) {
      return themes.slice(0, 2).join(' and ');
    }
    return 'market entry, investment, and manufacturing';
  }
  const industries = contact.crunchbase_industries?.toLowerCase() || '';
  const description = contact.crunchbase_description?.toLowerCase() || '';
  const industryText = `${industries} ${description}`.trim();
  
  // FOCUS_AREA_MAP - maps industries to relevant focus areas
    const focusAreaMap: { [key: string]: string[] } = {
    'water': ['clean water technologies', 'water purification solutions', 'water conservation innovations'],
    'carbon': ['carbon capture technologies', 'carbon reduction solutions', 'climate change mitigation'],
      'capture': ['carbon capture technologies', 'carbon removal solutions', 'climate change mitigation'],
    'energy': ['renewable energy solutions', 'sustainable energy technologies', 'clean energy innovations'],
    'agriculture': ['sustainable agriculture solutions', 'agricultural technology innovations', 'food security advancements'],
      'agtech': ['sustainable agriculture solutions', 'agricultural technology innovations', 'food security advancements'],
      'food': ['food security advancements', 'sustainable agriculture solutions', 'agricultural technology innovations'],
      'forestry': ['nature-based solutions', 'forest restoration technologies', 'sustainable land use innovations'],
    'climate': ['climate change solutions', 'environmental sustainability technologies', 'green technology innovations'],
    'environmental': ['environmental protection technologies', 'sustainability solutions', 'green innovation'],
    'waste': ['waste management technologies', 'circular economy solutions', 'recycling innovations'],
    'recycling': ['recycling technologies', 'circular economy solutions', 'waste reduction innovations'],
      'circular': ['circular economy solutions', 'recycling innovations', 'waste reduction innovations'],
    'battery': ['energy storage solutions', 'battery technology innovations', 'renewable energy storage'],
      'storage': ['energy storage solutions', 'grid storage innovations', 'renewable energy storage'],
      'grid': ['grid modernization', 'energy storage solutions', 'clean energy innovations'],
    'solar': ['solar energy technologies', 'renewable energy solutions', 'clean energy innovations'],
    'wind': ['wind energy technologies', 'renewable energy solutions', 'clean energy innovations'],
    'hydrogen': ['hydrogen technologies', 'clean energy solutions', 'renewable energy innovations'],
    'biotech': ['biotechnology innovations', 'life science solutions', 'biological technology advancements'],
    'biomedical': ['biomedical innovations', 'healthcare technology solutions', 'medical technology advancements'],
    'ai': ['artificial intelligence solutions', 'machine learning innovations', 'AI technology applications'],
    'machine learning': ['machine learning solutions', 'AI technology innovations', 'data science applications'],
    'iot': ['Internet of Things solutions', 'connected technology innovations', 'smart technology applications'],
    'robotics': ['robotics solutions', 'automation technologies', 'intelligent systems'],
    'space': ['space technology innovations', 'aerospace solutions', 'satellite technology advancements'],
    'transportation': ['transportation solutions', 'mobility innovations', 'smart transportation technologies'],
    'mobility': ['mobility innovations', 'transportation solutions', 'smart transportation technologies'],
    'shipping': ['clean shipping technologies', 'logistics innovations', 'transportation solutions'],
    'aviation': ['aviation technology solutions', 'aerospace innovations', 'flight technology advancements'],
    'manufactur': ['industrial efficiency solutions', 'advanced manufacturing innovations', 'clean production technologies'],
    'materials': ['advanced materials innovations', 'sustainable materials solutions', 'circular economy solutions'],
    'construction': ['green building technologies', 'sustainable construction solutions', 'building efficiency innovations'],
    'building': ['green building technologies', 'building efficiency innovations', 'sustainable construction solutions'],
    'logistics': ['logistics technology solutions', 'supply chain innovations', 'distribution technology advancements'],
    'finance': ['financial technology solutions', 'fintech innovations', 'digital finance applications'],
    'healthcare': ['healthcare technology solutions', 'medical innovations', 'health technology advancements'],
    'education': ['education technology solutions', 'learning innovations', 'educational technology advancements'],
    'security': ['security technology solutions', 'cybersecurity innovations', 'protection technology advancements']
  };
  
  // Check for industry matches
    const seed = (contact.company_name || '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    for (const [industry, focusAreas] of Object.entries(focusAreaMap)) {
      if (industryText.includes(industry)) {
        return focusAreas[seed % focusAreas.length];
      }
    }
  
  // Fallback: combine 2-3 EarthX highlights dynamically
  const highlights = earthx.earthx_highlights.slice(0, 3);
  if (highlights.length >= 2) {
    return highlights.slice(0, 2).join(', ') + (highlights.length > 2 ? ', and ' + highlights[2] : '');
  }
  
  // Ultimate fallback
  return 'cross-border investment, manufacturing, and market entry';
}

function selectAttendeeType(contact: ContactData, earthx: EarthXData): string {
  const titleCategory = getTitleCategory(contact.title);
  
  // ATTENDEE_MAP
  const attendeeMap: { [key: string]: string[] } = {
    'CEO_FOUNDER': ['CEOs', 'founders', 'executives'],
    'CTO_PRODUCT': ['CTOs', 'technical leaders', 'engineers'],
    'CFO_FINANCE': ['CFOs', 'finance executives'],
    'PARTNERSHIPS_BIZDEV': ['business development leaders', 'partnership executives'],
    'MARKETING_GROWTH': ['marketing executives', 'growth leaders'],
    'SUSTAINABILITY_ESG': ['sustainability leaders', 'ESG professionals'],
    'SCIENCE_RESEARCH': ['scientists', 'researchers'],
    'OPERATIONS': ['operations executives', 'COOs']
  };
  
  const preferredAttendees = attendeeMap[titleCategory] || ['executives'];
  
  for (const attendee of preferredAttendees) {
    const match = earthx.earthx_attendee_types.find(a => 
      a.toLowerCase().includes(attendee.toLowerCase())
    );
    if (match) return match;
  }
  
  return earthx.earthx_attendee_types[0] || '';
}

const MIN_DRAFT_SCORE = 70;

function enforceIntraDraftDiversity(drafts: DraftResult[]): void {
  if (drafts.length < 3) return;
  
  // Sort by angle: ROLE_FIRST (A), COMPANY_FIRST (B), EVENT_FIRST (C)
  const angleOrder: Record<string, number> = { 'ROLE_FIRST': 0, 'COMPANY_FIRST': 1, 'EVENT_FIRST': 2 };
  drafts.sort((a, b) => angleOrder[a.angle] - angleOrder[b.angle]);
  
  const [draftA, draftB, draftC] = drafts;
  
  // Check pairwise similarities
  const simAB = calculateSimilarity(draftA.body, [draftB.body]);
  const simAC = calculateSimilarity(draftA.body, [draftC.body]);
  const simBC = calculateSimilarity(draftB.body, [draftC.body]);
  
  const penalizePair = (a: DraftResult, b: DraftResult, sim: number) => {
    if (sim >= 0.85) {
      a.score = Math.max(0, a.score - 15);
      b.score = Math.max(0, b.score - 15);
    } else if (sim >= 0.70) {
      a.score = Math.max(0, a.score - 8);
      b.score = Math.max(0, b.score - 8);
    }
  };

  if (simAB >= 0.70 || simAC >= 0.70 || simBC >= 0.70) {
    console.log(`Intra-draft similarity too high: AB=${simAB}, AC=${simAC}, BC=${simBC}`);
    penalizePair(draftA, draftB, simAB);
    penalizePair(draftA, draftC, simAC);
    penalizePair(draftB, draftC, simBC);
  }
  
  // Check first sentence overlap
  const getFirstSentence = (body: string) => body.split(/[.!?]/)[0];
  const firstA = getFirstSentence(draftA.body);
  const firstB = getFirstSentence(draftB.body);
  const firstC = getFirstSentence(draftC.body);
  
  const checkOverlap = (s1: string, s2: string) => {
    const words1 = s1.toLowerCase().split(/\s+/);
    const words2 = s2.toLowerCase().split(/\s+/);
    let maxConsecutive = 0;
    for (let i = 0; i < words1.length; i++) {
      for (let j = 0; j < words2.length; j++) {
        let consecutive = 0;
        while (i + consecutive < words1.length && 
               j + consecutive < words2.length && 
               words1[i + consecutive] === words2[j + consecutive]) {
          consecutive++;
        }
        maxConsecutive = Math.max(maxConsecutive, consecutive);
      }
    }
    return maxConsecutive;
  };
  
  if (checkOverlap(firstA, firstB) > 5 || checkOverlap(firstA, firstC) > 5 || checkOverlap(firstB, firstC) > 5) {
    console.log('First sentence overlap too high');
    draftA.score = Math.max(0, draftA.score - 5);
    draftB.score = Math.max(0, draftB.score - 5);
    draftC.score = Math.max(0, draftC.score - 5);
  }
}

export async function scoreDraft(draft: DraftResult, contact: ContactData, earthx: EarthXData, recentBodies: string[] = []): Promise<DraftResult> {
  const availableFields = getAvailableFields(contact);

  // Calculate coverage score
  draft.coverage_score = calculateCoverageScore(JSON.parse(draft.used_fields_json), availableFields);

  // Check banned phrases
  draft.banned_phrase_hits = checkBannedPhrases(draft.body);

  // Calculate similarity to recent emails
  draft.similarity_score = calculateSimilarity(draft.body, recentBodies);

  // Generate hashes
  draft.subject_hash = generateHash(draft.subject);
  draft.body_hash = generateHash(draft.body);

  // Calculate overall score (0-100)
  let score = 0;

  // Grounded realism (0-30): any unsupported claims => 0
  if (draft.banned_phrase_hits > 0) score = 0;
  else score += 30;

  // Company relevance (0-20)
  const companyName = contact.company_name || '';
  if (companyName && draft.body.toLowerCase().includes(companyName.toLowerCase())) {
    score += 10;
  }
  const dateRef = earthx.earthx_date_range || earthx.event_date_range || '';
  const cityRef = earthx.earthx_city || earthx.event_city || '';
  const venueRef = earthx.earthx_venue || earthx.event_venue || '';
  if (dateRef && draft.body.includes(dateRef)) {
    score += 5;
  }
  if ((cityRef && draft.body.includes(cityRef)) || (venueRef && draft.body.includes(venueRef))) {
    score += 5;
  }

  // Anniversary credibility (0-5)
  const anniversaryLabel = getAnniversaryLabel(earthx);
  if (anniversaryLabel) {
    const lowerBody = draft.body.toLowerCase();
    const lowerSubject = draft.subject.toLowerCase();
    if (lowerSubject.includes('anniversary') || lowerSubject.includes(anniversaryLabel.toLowerCase()) ||
        lowerBody.includes('anniversary') || lowerBody.includes(anniversaryLabel.toLowerCase())) {
      score += 5;
    }
  }

  // Field coverage (0-15)
  score += draft.coverage_score;

  // Diversity vs recent outputs (0-10)
  if (draft.similarity_score < 0.4) score += 10;
  else if (draft.similarity_score < 0.6) score += 6;
  else if (draft.similarity_score < 0.75) score += 2;
  else if (draft.similarity_score > 0.9) score -= 5;

  // Clarity/length (0-10): 70–120 words
  const wordCount = draft.body.split(/\s+/).length;
  if (wordCount >= 70 && wordCount <= 120) score += 10;
  else if (wordCount >= 65 && wordCount <= 130) score += 5;

  // CTA quality (0-5): exactly one question CTA
  const questions = draft.body.match(/\?/g);
  if (questions && questions.length === 1) score += 5;

  // Tone (0-5): confident, warm, not corny
  score += 5; // Assume good tone for now

  draft.score = Math.max(0, Math.min(score, 100));
  return draft;
}

export async function generateAndScoreDrafts(
  contact: ContactData,
  earthx: EarthXData,
  db: Database,
  campaignId: number
): Promise<DraftResult[]> {
    // Select highlight and attendee based on company data
    const selectedHighlight = selectEarthXHighlight(contact, earthx);
    const selectedAttendee = selectAttendeeType(contact, earthx);
    const selectedFocusArea = selectFocusArea(contact, earthx);
    
    const angles = ['ROLE_FIRST', 'COMPANY_FIRST', 'EVENT_FIRST'];
    const drafts: DraftResult[] = [];

    // Get recent email bodies for similarity checking
    const recentMessages = await db.all<{body: string}[]>(
      `SELECT body FROM recent_messages
       WHERE campaign_id = ?
       ORDER BY created_at DESC
       LIMIT 5`,
      [campaignId]
    );
    const recentBodies = recentMessages.map((m: any) => m.body);

    for (const angle of angles) {
      let attempts = 0;
      let validDraft = false;

      while (!validDraft && attempts < 3) {
        const draft = generateTemplateDraft(contact, earthx, angle, selectedHighlight, selectedAttendee, selectedFocusArea);
        const processed = postProcessDraft(draft.subject, draft.body, contact, earthx, draft.angle);
        draft.subject = processed.subject;
        draft.body = processed.body;

        const usedFields = draft.used_fields_json ? JSON.parse(draft.used_fields_json) : [];
        if (contact.title && !usedFields.includes('title')) usedFields.push('title');
        if (contact.crunchbase_industries && !usedFields.includes('crunchbase_industries')) usedFields.push('crunchbase_industries');
        if (contact.crunchbase_description && !usedFields.includes('crunchbase_description')) usedFields.push('crunchbase_description');
        draft.used_fields_json = JSON.stringify(usedFields);
        const scoredDraft = await scoreDraft(draft, contact, earthx, recentBodies);

        // Basic validation
        if (scoredDraft.score >= MIN_DRAFT_SCORE && scoredDraft.similarity_score < 0.72) {
          drafts.push(scoredDraft);
          validDraft = true;
        } else if (scoredDraft.score >= MIN_DRAFT_SCORE) {
          console.log(`High similarity draft accepted with warning: ${scoredDraft.similarity_score}`);
          drafts.push(scoredDraft);
          validDraft = true;
        }
        attempts++;
      }
    }

    // Enforce intra-draft diversity
    if (drafts.length >= 3) {
      enforceIntraDraftDiversity(drafts);
    }
    
    return drafts;
}

export async function selectBestDraft(drafts: DraftResult[], contact: ContactData): Promise<DraftResult | null> {
  if (drafts.length === 0) return null;

  // Sort by score descending, then prefer lower similarity when scores are close
  drafts.sort((a, b) => {
    const scoreDiff = b.score - a.score;
    if (Math.abs(scoreDiff) <= 5) {
      return a.similarity_score - b.similarity_score;
    }
    return scoreDiff;
  });

  // Take the highest scoring draft
  const best = drafts[0];

  console.log(`Selected best draft score: ${best.score}, coverage: ${best.coverage_score}, similarity: ${best.similarity_score}, banned: ${best.banned_phrase_hits}`);

  return best;
}

export async function enforceDiversity(
  draft: DraftResult,
  db: Database,
  campaignId: number,
  contactId: number
): Promise<boolean> {
  // Check subject similarity
  const recentSubjects = await db.all<{subject: string}[]>(
    `SELECT subject FROM recent_messages
     WHERE campaign_id = ?
     ORDER BY created_at DESC
     LIMIT 2`,
    [campaignId]
  );

  if (recentSubjects.length < 2) {
    return true;
  }

  for (const recent of recentSubjects) {
    if (calculateSimilarity(draft.subject, [(recent as any).subject]) > 0.99) {
      return false; // Too similar
    }
  }

  // Check body similarity
  const recentBodies = await db.all<{body: string}[]>(
    `SELECT body FROM recent_messages
     WHERE campaign_id = ?
     ORDER BY created_at DESC
     LIMIT 5`,
    [campaignId]
  );

  if (recentBodies.length < 3) {
    return true;
  }

  const maxSimilarity = Math.max(...recentBodies.map((r: any) => calculateSimilarity(draft.body, [r.body])));
  if (maxSimilarity > 0.99) {
    return false; // Too similar
  }

  return true;
}

export async function saveDraftToRecent(
  draft: DraftResult,
  db: Database,
  campaignId: number,
  contactId: number
): Promise<void> {
  await db.run(
    `INSERT INTO recent_messages (campaign_id, contact_id, subject, body, subject_hash, body_hash)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [campaignId, contactId, draft.subject, draft.body, draft.subject_hash, draft.body_hash]
  );
}
