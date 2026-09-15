export interface FieldUsage {
  fields_used: string[];
  fields_available: string[];
  coverage_score: number;
  must_use_missing: string[];
  should_use_missing: string[];
}

function includesIgnoreCase(haystack: string, needle: string): boolean {
  if (!haystack || !needle) return false;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function hasAny(haystack: string, needles: string[]): boolean {
  return needles.some(n => includesIgnoreCase(haystack, n));
}

export function trackFieldUsage(body?: string, contact?: any, company?: any, earthx?: any): FieldUsage {
  const text = (body || '').toLowerCase();
  const fields_used: string[] = [];
  const fields_available: string[] = [];

  const companyName = company?.name || contact?.company_name || '';
  const industries = company?.crunchbase_industries || contact?.crunchbase_industries || '';
  const description = company?.crunchbase_description || contact?.crunchbase_description || '';
  const earthxDate = earthx?.earthx_date_range || earthx?.event_date_range || '';
  const earthxCity = earthx?.earthx_city || earthx?.event_city || '';
  const earthxVenue = earthx?.earthx_venue || earthx?.event_venue || '';
  const earthxMission = earthx?.earthx_mission || '';

  if (companyName) fields_available.push('company_name');
  if (industries) fields_available.push('crunchbase_industries');
  if (description) fields_available.push('crunchbase_description');
  if (earthxDate) fields_available.push('earthx_date_range');
  if (earthxCity) fields_available.push('earthx_city');
  if (earthxVenue) fields_available.push('earthx_venue');
  if (earthxMission) fields_available.push('earthx_mission');

  if (companyName && includesIgnoreCase(text, companyName)) fields_used.push('company_name');
  if (industries && includesIgnoreCase(text, industries.split(',')[0].trim())) fields_used.push('crunchbase_industries');
  if (description && includesIgnoreCase(text, description.split(' ').slice(0, 5).join(' '))) fields_used.push('crunchbase_description');
  if (earthxDate && includesIgnoreCase(text, earthxDate)) fields_used.push('earthx_date_range');
  if (earthxCity && includesIgnoreCase(text, earthxCity)) fields_used.push('earthx_city');
  if (earthxVenue && includesIgnoreCase(text, earthxVenue)) fields_used.push('earthx_venue');
  if (earthxMission && includesIgnoreCase(text, earthxMission.split(' ').slice(0, 5).join(' '))) fields_used.push('earthx_mission');

  const hasCTA = hasAny(text, [
    'open to a quick call',
    'quick call',
    'open to a quick intro',
    'open to a quick discussion'
  ]);
  if (hasCTA) fields_used.push('cta');

  const hasSignature = hasAny(text, ['Your Name', 'Your Name', 'Your Organization']);
  if (hasSignature) fields_used.push('signature');

  const must_use = ['company_name'];
  if (earthxDate) must_use.push('earthx_date_range');
  if (earthxCity || earthxVenue) must_use.push('earthx_city_or_venue');
  must_use.push('cta');

  const should_use = ['crunchbase_industries', 'crunchbase_description', 'earthx_mission'];

  const must_use_missing = must_use.filter(f => {
    if (f === 'earthx_city_or_venue') return !fields_used.includes('earthx_city') && !fields_used.includes('earthx_venue');
    return !fields_used.includes(f);
  });

  const should_use_missing = should_use.filter(f => !fields_used.includes(f));

  let coverage_score = 0;
  if (!must_use_missing.includes('company_name')) coverage_score += 3;
  if (!must_use_missing.includes('earthx_date_range')) coverage_score += 2;
  if (!must_use_missing.includes('earthx_city_or_venue')) coverage_score += 2;
  if (!must_use_missing.includes('cta')) coverage_score += 2;
  if (should_use.some(f => !should_use_missing.includes(f))) coverage_score += 1;

  return {
    fields_used: Array.from(new Set(fields_used)),
    fields_available: Array.from(new Set(fields_available)),
    coverage_score,
    must_use_missing,
    should_use_missing
  };
}

export function validateFieldCoverage(usage?: FieldUsage): { valid: boolean; reason: string } {
  if (!usage) return { valid: true, reason: '' };
  if (usage.must_use_missing.length > 0) {
    return {
      valid: false,
      reason: `Missing required fields: ${usage.must_use_missing.join(', ')}`
    };
  }
  if (usage.should_use_missing.length > 1) {
    return {
      valid: true,
      reason: `Consider adding one of: ${usage.should_use_missing.join(', ')}`
    };
  }
  return { valid: true, reason: '' };
}
