/**
 * Title normalization utilities
 */

export function normalizeTitle(title: string): string {
  if (!title) return title;

  // Trim and collapse multiple spaces
  let normalized = title.trim().replace(/\s+/g, ' ');

  // Remove odd punctuation but keep standard ones
  normalized = normalized.replace(/[^a-zA-Z0-9\s\-&.,()]/g, '');

  // Fix pluralization issues
  const pluralFixes: { [key: string]: string } = {
    'engineerings': 'engineering',
    'marketings': 'marketing',
    'developments': 'development',
    'operations': 'operations',
    'finances': 'finance',
    'sciences': 'science',
    'technologys': 'technology',
    'managements': 'management',
    'directors': 'director',
    'managers': 'manager',
    'specialists': 'specialist',
    'coordinators': 'coordinator',
    'consultants': 'consultant'
  };

  // Apply plural fixes
  for (const [plural, singular] of Object.entries(pluralFixes)) {
    const regex = new RegExp(`\\b${plural}\\b`, 'gi');
    normalized = normalized.replace(regex, singular);
  }

  return normalized;
}

export function getTitleCategory(title: string): string {
  const normalized = title.toLowerCase();

  if (normalized.includes('ceo') || normalized.includes('founder') || normalized.includes('president')) {
    return 'CEO_FOUNDER';
  }
  if (normalized.includes('cfo') || normalized.includes('finance') || normalized.includes('financial')) {
    return 'CFO_FINANCE';
  }
  if (normalized.includes('cto') || normalized.includes('product') || normalized.includes('engineering') || normalized.includes('tech')) {
    return 'CTO_PRODUCT';
  }
  if (normalized.includes('partnership') || normalized.includes('business development') || normalized.includes('biz dev')) {
    return 'PARTNERSHIPS_BIZDEV';
  }
  if (normalized.includes('marketing') || normalized.includes('growth') || normalized.includes('sales')) {
    return 'MARKETING_GROWTH';
  }
  if (normalized.includes('sustainability') || normalized.includes('esg') || normalized.includes('environmental')) {
    return 'SUSTAINABILITY_ESG';
  }
  if (normalized.includes('scientist') || normalized.includes('research')) {
    return 'SCIENCE_RESEARCH';
  }
  if (normalized.includes('coo') || normalized.includes('operations')) {
    return 'OPERATIONS';
  }

  return 'GENERAL';
}