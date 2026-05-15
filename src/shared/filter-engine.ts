import type { CapturedRequest, FilterRule, ApiPattern } from './types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC_RE = /^\d+$/;
const HEX_RE = /^[0-9a-f]{16,}$/i;
const HASH_RE = /^[a-z0-9]{20,}$/i;

function isIdSegment(segment: string): boolean {
  if (!segment) return false;
  return UUID_RE.test(segment) || NUMERIC_RE.test(segment) || HEX_RE.test(segment) || HASH_RE.test(segment);
}

function patternizeUrl(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    const segments = url.pathname.split('/').filter(Boolean);
    const patterned = segments.map(s => isIdSegment(s) ? '*' : s);
    return `${url.origin}/${patterned.join('/')}`;
  } catch {
    return urlStr;
  }
}

export function extractApiPatterns(requests: CapturedRequest[]): ApiPattern[] {
  const groups = new Map<string, { count: number; sampleUrls: string[] }>();

  for (const req of requests) {
    const pattern = patternizeUrl(req.url);
    const existing = groups.get(pattern);
    if (existing) {
      existing.count++;
      if (existing.sampleUrls.length < 3) {
        existing.sampleUrls.push(req.url);
      }
    } else {
      groups.set(pattern, { count: 1, sampleUrls: [req.url] });
    }
  }

  const results: ApiPattern[] = [];
  for (const [pattern, data] of groups) {
    if (data.count >= 1) {
      try {
        const url = new URL(pattern);
        results.push({
          pattern,
          displayName: url.pathname,
          count: data.count,
          sampleUrls: data.sampleUrls,
        });
      } catch {
        results.push({
          pattern,
          displayName: pattern,
          count: data.count,
          sampleUrls: data.sampleUrls,
        });
      }
    }
  }

  return results.sort((a, b) => b.count - a.count);
}

function globToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const globPattern = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${globPattern}$`, 'i');
}

export function matchesFilter(url: string, rule: FilterRule): boolean {
  switch (rule.type) {
    case 'substring':
      return url.toLowerCase().includes(rule.pattern.toLowerCase());
    case 'glob':
      return globToRegex(rule.pattern).test(url);
    case 'regex':
      try {
        return new RegExp(rule.pattern, 'i').test(url);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

export function applyFilters(
  requests: CapturedRequest[],
  rules: FilterRule[]
): CapturedRequest[] {
  const enabledRules = rules.filter(r => r.enabled);
  if (enabledRules.length === 0) return requests;

  const includeRules = enabledRules.filter(r => r.mode === 'include');
  const excludeRules = enabledRules.filter(r => r.mode === 'exclude');

  return requests.filter(req => {
    let passInclude = true;
    if (includeRules.length > 0) {
      passInclude = includeRules.some(rule => matchesFilter(req.url, rule));
    }

    const passExclude = !excludeRules.some(rule => matchesFilter(req.url, rule));

    return passInclude && passExclude;
  });
}

export function patternToFilterRule(pattern: string): FilterRule {
  return {
    id: crypto.randomUUID(),
    pattern,
    type: 'glob',
    enabled: true,
    mode: 'include',
    createdAt: Date.now(),
  };
}
