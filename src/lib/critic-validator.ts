/**
 * Critic Validator
 * Final validation gate before saving drafts
 */

import { trackFieldUsage, validateFieldCoverage, FieldUsage } from './field-tracker';

export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    scores: {
        word_count: number;
        subject_length: number;
        question_mark_count: number;
        banned_phrase_hits: number;
        coverage_score: number;
        similarity_score: number;
    };
    field_usage: FieldUsage | null;
}

// Expanded banned phrases list - Phase 1.5
const BANNED_PHRASES = [
    // Generic social proof (ungrounded)
    'premier gathering',
    'exclusive roundtables',
    'lasting partnerships',
    'attendees consistently rate',
    'many participants have',
    'invaluable',
    'unique opportunity',
    'rapidly evolving',
    'cutting-edge',
    'breakthrough',
    'game-changing',
    'world-class',
    'best-in-class',
    'leading-edge',
    'industry-leading',

    // Overused opener phrases
    'i hope this email finds you well',
    'i hope this message finds you',
    'i wanted to reach out',
    'i am reaching out',
    'i\'m reaching out',
    'just wanted to touch base',
    'touching base',

    // Vague claims
    'critical environmental challenges',
    'making important contributions',
    'highly valued',
    'tremendous opportunity',
    'exciting opportunity',
    'amazing opportunity',
    'incredible opportunity',

    // Pushy language
    'act now',
    'don\'t miss out',
    'limited time',
    'once in a lifetime',
    'you won\'t regret',

    // Filler phrases
    'at the end of the day',
    'moving forward',
    'going forward',
    'in today\'s world',
    'in this day and age',
    'needless to say',
    'it goes without saying',

    // Additional banned phrases - Phase 1.5 expansion
    'unparalleled',
    'unprecedented',
    'revolutionary',
    'transformative',
    'disruptive innovation',
    'paradigm shift',
    'quantum leap',
    'sea change',
    'groundbreaking',
    'trailblazing',
    'pioneering',
    'visionary',
    'thought leadership',
    'industry expert',
    'market leader',
    'global leader',
    'recognized leader',
    'proven track record',
    'battle-tested',
    'field-proven',
    'time-tested',
    'tried and true',
    'rock-solid',
    'bulletproof',
    'foolproof',
    'effortless',
    'seamless',
    'frictionless',
    'painless',
    'zero-effort',
    'plug and play',
    'out of the box',
    'turnkey solution',
    'silver bullet',
    'magic bullet',
    'holy grail',
    'killer app',
    'must-have',
    'can\'t live without',
    'game-changer',
    'showstopper',
    'show-stopper',
    'jaw-dropping',
    'mind-blowing',
    'blow your mind',
    'blows your mind',
    'astonishing',
    'staggering',
    'stunning',
    'spectacular',
    'phenomenal',
    'extraordinary',
    'unbelievable',
    'incredible',
    'amazing',
    'awesome',
    'fantastic',
    'terrific',
    'superb',
    'excellent',
    'outstanding',
    'exceptional',
    'remarkable',
    'impressive',
    'striking',
    'notable',
    'noteworthy',
    'commendable',
    'laudable',
    'praiseworthy',
    'admirably',
    'commendably',
    'praiseworthily'
];

// Soft banned phrases (deduct points but don't fail)
const SOFT_BANNED_PHRASES = [
    'ecosystem',
    'synergy',
    'leverage',
    'scalable',
    'disruptive',
    'innovative solutions',
    'thought leader',
    'comprehensive',
    'holistic',
    'integrated',
    'end-to-end',
    'full-service',
    'one-stop shop',
    'turnkey',
    'customizable',
    'flexible',
    'adaptable',
    'versatile',
    'robust',
    'reliable',
    'dependable',
    'trustworthy',
    'proven',
    'tested',
    'validated',
    'verified',
    'certified',
    'accredited',
    'recognized',
    'acclaimed',
    'renowned',
    'famous',
    'celebrated',
    'distinguished',
    'eminent',
    'prominent',
    'illustrious',
    'glorious',
    'magnificent',
    'splendid',
    'brilliant',
    'dazzling',
    'gleaming',
    'shining',
    'radiant',
    'luminous',
    'glowing',
    'beaming',
    'sparkling',
    'twinkling',
    'glittering',
    'shimmering',
    'gleaming',
    'lustrous',
    'resplendent',
    'effulgent'
];

/**
 * Validate a draft email before saving
 */
export function validateDraftCritic(
    subject: string,
    body: string,
    contact: any,
    company: any,
    earthx: any,
    recentEmails: string[] = [],
    stage: string = 'COLD'
): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const bodyLower = body.toLowerCase();
    const subjectLower = subject.toLowerCase();

    // 1. Word count validation (70-120 words)
    const wordCount = body.split(/\s+/).filter(w => w.length > 0).length;
    if (wordCount < 70) {
        errors.push(`Body too short: ${wordCount} words (minimum 70)`);
    } else if (wordCount > 120) {
        errors.push(`Body too long: ${wordCount} words (maximum 120)`);
    }

    // 2. Subject length validation (≤7 words)
    const subjectWordCount = subject.split(/\s+/).filter(w => w.length > 0).length;
    if (subjectWordCount > 7) {
        errors.push(`Subject too long: ${subjectWordCount} words (maximum 7)`);
    }

    // 3. Question mark validation (exactly 1 in body)
    const questionMarkCount = (body.match(/\?/g) || []).length;
    if (questionMarkCount === 0) {
        errors.push('No question mark found (need exactly 1 CTA question)');
    } else if (questionMarkCount > 1) {
        errors.push(`Too many question marks: ${questionMarkCount} (need exactly 1)`);
    }

    // 4. Banned phrase check
    let bannedPhraseHits = 0;
    const foundBannedPhrases: string[] = [];
    for (const phrase of BANNED_PHRASES) {
        if (bodyLower.includes(phrase) || subjectLower.includes(phrase)) {
            bannedPhraseHits++;
            foundBannedPhrases.push(phrase);
        }
    }
    if (bannedPhraseHits > 0) {
        errors.push(`Banned phrases found: ${foundBannedPhrases.join(', ')}`);
    }

    // 5. Soft banned phrase check (warnings only)
    let softBannedHits = 0;
    for (const phrase of SOFT_BANNED_PHRASES) {
        if (bodyLower.includes(phrase)) {
            softBannedHits++;
            warnings.push(`Soft banned phrase found: "${phrase}"`);
        }
    }

    // 6. Calendly link validation
    if (bodyLower.includes('calendly')) {
        if (stage !== 'HANDOFF' && stage !== 'INTERESTED') {
            errors.push('Calendly link found in non-HANDOFF stage email');
        }
    }

    // 7. Field coverage validation
    let fieldUsage: FieldUsage | null = null;
    let coverageScore = 0;
    if (contact && company && earthx) {
        fieldUsage = trackFieldUsage(body, contact, company, earthx);
        coverageScore = fieldUsage.coverage_score;

        const coverageValidation = validateFieldCoverage(fieldUsage);
        if (!coverageValidation.valid) {
            warnings.push(coverageValidation.reason); // Warning not error for now
        }
    }

    // 8. Similarity check against recent emails
    let similarityScore = 0;
    if (recentEmails.length > 0) {
        similarityScore = calculateMaxSimilarity(body, recentEmails);
        if (similarityScore > 0.65) {
            errors.push(`Too similar to recent email: ${(similarityScore * 100).toFixed(1)}% (max 65%)`);
        } else if (similarityScore > 0.50) {
            warnings.push(`Moderately similar to recent email: ${(similarityScore * 100).toFixed(1)}%`);
        }
    }

    // 9. Check for required elements
    // - Signature
    if (!body.includes('Your Name') && !body.includes('Your Name')) {
        warnings.push('Missing signature: Your Name');
    }
    if (!body.includes('Your Organization')) {
        warnings.push('Missing company in signature: Your Organization');
    }

    // - Company name mentioned
    if (company?.name && !body.toLowerCase().includes(company.name.toLowerCase())) {
        warnings.push(`Company name "${company.name}" not mentioned in body`);
    }

    // - Contact first name in greeting
    if (contact?.first_name && !body.includes(`Dear ${contact.first_name}`)) {
        warnings.push(`Greeting should be "Dear ${contact.first_name},"`);
    }

    // 10. Check closing line format
    const closerPattern = /(open to|interested in).*(quick call|quick intro|quick discussion)/i;
    if (!closerPattern.test(bodyLower)) {
        warnings.push('Closing line does not match required format');
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
        scores: {
            word_count: wordCount,
            subject_length: subjectWordCount,
            question_mark_count: questionMarkCount,
            banned_phrase_hits: bannedPhraseHits + softBannedHits,
            coverage_score: coverageScore,
            similarity_score: similarityScore
        },
        field_usage: fieldUsage
    };
}

/**
 * Calculate similarity between text and a list of recent emails
 */
function calculateMaxSimilarity(text: string, recentEmails: string[]): number {
    let maxSimilarity = 0;

    for (const recent of recentEmails) {
        const similarity = calculateTrigramSimilarity(text, recent);
        if (similarity > maxSimilarity) {
            maxSimilarity = similarity;
        }
    }

    return maxSimilarity;
}

/**
 * Calculate trigram similarity between two texts
 */
function calculateTrigramSimilarity(text1: string, text2: string): number {
    const getTrigrams = (text: string): Set<string> => {
        const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
        const trigrams = new Set<string>();
        for (let i = 0; i <= normalized.length - 3; i++) {
            trigrams.add(normalized.substring(i, i + 3));
        }
        return trigrams;
    };

    const trigrams1 = getTrigrams(text1);
    const trigrams2 = getTrigrams(text2);

    if (trigrams1.size === 0 || trigrams2.size === 0) return 0;

    let intersection = 0;
    for (const trigram of trigrams1) {
        if (trigrams2.has(trigram)) intersection++;
    }

    const union = trigrams1.size + trigrams2.size - intersection;
    return intersection / union;
}

/**
 * Calculate intra-draft similarity (A vs B vs C)
 */
export function calculateIntraDraftSimilarity(drafts: { body: string }[]): {
    ab: number;
    ac: number;
    bc: number;
    allPass: boolean;
    failedPairs: string[];
} {
    const threshold = 0.70;
    const failedPairs: string[] = [];

    const ab = drafts.length >= 2 ? calculateTrigramSimilarity(drafts[0].body, drafts[1].body) : 0;
    const ac = drafts.length >= 3 ? calculateTrigramSimilarity(drafts[0].body, drafts[2].body) : 0;
    const bc = drafts.length >= 3 ? calculateTrigramSimilarity(drafts[1].body, drafts[2].body) : 0;

    if (ab > threshold) failedPairs.push(`A-B: ${(ab * 100).toFixed(1)}%`);
    if (ac > threshold) failedPairs.push(`A-C: ${(ac * 100).toFixed(1)}%`);
    if (bc > threshold) failedPairs.push(`B-C: ${(bc * 100).toFixed(1)}%`);

    return {
        ab,
        ac,
        bc,
        allPass: failedPairs.length === 0,
        failedPairs
    };
}

/**
 * Check first sentence diversity across drafts
 */
export function checkFirstSentenceDiversity(drafts: { body: string }[]): {
    pass: boolean;
    issues: string[];
} {
    const issues: string[] = [];
    const maxSharedWords = 5;

    const getFirstSentence = (body: string): string[] => {
        const firstSentence = body.split(/[.!?]/)[0] || '';
        return firstSentence.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    };

    const firstSentences = drafts.map(d => getFirstSentence(d.body));

    // Check each pair
    for (let i = 0; i < firstSentences.length; i++) {
        for (let j = i + 1; j < firstSentences.length; j++) {
            const shared = countConsecutiveSharedWords(firstSentences[i], firstSentences[j]);
            if (shared > maxSharedWords) {
                const labels = ['A', 'B', 'C'];
                issues.push(`${labels[i]}-${labels[j]} share ${shared} consecutive words in first sentence`);
            }
        }
    }

    return {
        pass: issues.length === 0,
        issues
    };
}

/**
 * Count maximum consecutive shared words between two word arrays
 */
function countConsecutiveSharedWords(words1: string[], words2: string[]): number {
    let maxConsecutive = 0;

    for (let i = 0; i < words1.length; i++) {
        for (let j = 0; j < words2.length; j++) {
            let consecutive = 0;
            let ii = i, jj = j;
            while (ii < words1.length && jj < words2.length && words1[ii] === words2[jj]) {
                consecutive++;
                ii++;
                jj++;
            }
            if (consecutive > maxConsecutive) {
                maxConsecutive = consecutive;
            }
        }
    }

    return maxConsecutive;
}