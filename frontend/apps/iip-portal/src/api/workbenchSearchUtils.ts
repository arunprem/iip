const SEARCH_STOP_WORDS = new Set([
  'any',
  'who',
  'whom',
  'has',
  'have',
  'had',
  'the',
  'area',
  'near',
  'from',
  'with',
  'that',
  'this',
  'lives',
  'live',
  'living',
  'located',
  'address',
  'locality',
  'suspect',
  'suspects',
  'person',
  'people',
  'find',
  'search',
  'tell',
  'about',
  'please',
  'give',
  'need',
  'name',
  'names',
  'linked',
  'registered',
  'database',
  'dossier',
  'record',
  'records',
]);

function cleanSearchTerm(value: string): string {
  return value
    .replace(/[?.!,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function meaningfulTokens(question: string): string[] {
  return question
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !SEARCH_STOP_WORDS.has(w));
}

export function extractPhoneFromQuestion(question: string): string | null {
  const match = question.match(/(?:\+91[\s-]?)?[6-9]\d{9}\b/);
  if (!match) return null;
  const digits = match[0].replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 10) return digits;
  if (digits.length > 10) return digits.slice(-10);
  return digits.length >= 8 ? digits : null;
}

export function extractEmailFromQuestion(question: string): string | null {
  const match = question.match(/[\w.+-]+@[\w.-]+\.\w+/);
  return match?.[0]?.toLowerCase() ?? null;
}

function extractLocationFromQuestion(question: string): string | null {
  const patterns = [
    /(?:lives?(?:\s+in)?|living\s+in|located\s+in|resid(?:e|es|ing)\s+(?:in|at)|from|near|around|at)\s+(?:the\s+)?([A-Za-z][A-Za-z0-9\s.'-]{2,45}?)(?:\s+area|\s+district|\s+region|\s+police|\s+station|\s*,|\s*\.|\s+please|\s+who|$)/i,
    /(?:address|locality|village|town|city|area)\s+(?:is|has|contains|includes|in|at)?\s*(?:the\s+)?([A-Za-z][A-Za-z0-9\s.'-]{2,45}?)(?:\s*,|\s*\.|\s+please|\s+who|$)/i,
    /(?:has|with)\s+([A-Za-z][A-Za-z0-9\s.'-]{2,45}?)\s+in\s+(?:the\s+)?address/i,
    /([A-Za-z][A-Za-z0-9\s.'-]{2,45}?)\s+in\s+(?:the\s+)?address/i,
  ];
  for (const pattern of patterns) {
    const match = question.match(pattern);
    if (match?.[1]) {
      const term = cleanSearchTerm(match[1]);
      const tokens = meaningfulTokens(term);
      if (tokens.length > 0) return tokens.join(' ');
      if (term.length >= 3) return term;
    }
  }
  return null;
}

function extractFatherNameFromQuestion(question: string): string | null {
  const patterns = [
    /(?:father(?:'?s?)?\s+name\s+(?:is|as)?|son\s+of|daughter\s+of|s\/o|d\/o|s\.?\s*o\.?|d\.?\s*o\.?)\s+([A-Za-z][A-Za-z0-9\s.'-]{2,50}?)(?:\s*,|\s*\.|\s+who|\s+please|\s+lives|\s+from|$)/i,
    /(?:father(?:'?s?)?\s+name)\s+([A-Za-z][A-Za-z0-9\s.'-]{2,50}?)(?:\s*,|\s*\.|\s+who|\s+please|$)/i,
  ];
  for (const pattern of patterns) {
    const match = question.match(pattern);
    if (match?.[1]) {
      const term = cleanSearchTerm(match[1]);
      if (term.length >= 3) return term;
    }
  }
  return null;
}

function extractRelativeNameFromQuestion(question: string): string | null {
  const patterns = [
    /(?:relative|relation|brother|sister|mother|wife|husband|spouse|parent)\s+(?:name\s+)?(?:is\s+|named\s+)?([A-Za-z][A-Za-z0-9\s.'-]{2,50}?)(?:\s*,|\s*\.|\s+who|\s+please|$)/i,
    /(?:related\s+to|relation\s+with)\s+([A-Za-z][A-Za-z0-9\s.'-]{2,50}?)(?:\s*,|\s*\.|\s+who|\s+please|$)/i,
  ];
  for (const pattern of patterns) {
    const match = question.match(pattern);
    if (match?.[1]) {
      const term = cleanSearchTerm(match[1]);
      if (term.length >= 3) return term;
    }
  }
  return null;
}

function extractSuspectNameFromQuestion(question: string): string | null {
  const patterns = [
    /(?:original name is|correct name is|name is|called|spelled as|spelling is)\s+([A-Za-z][A-Za-z0-9\s.'-]{2,60}?)(?:\s+please|\s+give|\s+i need|\s+who|\s+from|[?.!,]|$)/i,
    /(?:about|for|find|search(?:\s+for)?)\s+(?:suspect\s+)?([A-Za-z][A-Za-z0-9\s.'-]{2,50}?)(?:\s+please|\s+give|\s+who|\s+who\s+lives|[?.!,]|$)/i,
    /(?:tell me about|details of|information on)\s+([A-Za-z][A-Za-z0-9\s.'-]{2,50}?)(?:\s+please|\s+who|[?.!,]|$)/i,
  ];
  for (const pattern of patterns) {
    const match = question.match(pattern);
    if (match?.[1]) {
      const term = cleanSearchTerm(match[1]);
      if (term.length >= 3) return term;
    }
  }

  const upperName = question.match(/\b([A-Z][A-Z0-9\s.'-]{2,40})\b/);
  if (upperName?.[1]) {
    const term = cleanSearchTerm(upperName[1]);
    if (term.split(' ').length >= 2) return term;
  }

  return null;
}

export function extractSearchQueryFromQuestion(question: string): string {
  const phone = extractPhoneFromQuestion(question);
  if (phone) return phone;

  const email = extractEmailFromQuestion(question);
  if (email) return email;

  const father = extractFatherNameFromQuestion(question);
  if (father) return father;

  const relative = extractRelativeNameFromQuestion(question);
  if (relative) return relative;

  const location = extractLocationFromQuestion(question);
  if (location) return location;

  const name = extractSuspectNameFromQuestion(question);
  if (name) return name;

  const tokens = meaningfulTokens(question);
  if (tokens.length > 0) return tokens.join(' ');

  return cleanSearchTerm(question) || question.trim();
}

export function isFreshDossierSearch(question: string): boolean {
  const q = question.toLowerCase();
  return (
    q.includes('any suspect') ||
    q.includes('find suspect') ||
    q.includes('search for') ||
    q.includes('who lives') ||
    q.includes('who live') ||
    q.includes('living in') ||
    q.includes('in address') ||
    q.includes('father name') ||
    q.includes("father's name") ||
    q.includes('relative') ||
    q.includes('son of') ||
    q.includes('daughter of') ||
    isNewPhoneOrEmailSearch(question)
  );
}

export function isNewPhoneOrEmailSearch(question: string): boolean {
  const q = question.toLowerCase();
  if (extractPhoneFromQuestion(question) || extractEmailFromQuestion(question)) {
    return (
      q.includes('any suspect') ||
      q.includes('find suspect') ||
      q.includes('search for') ||
      q.includes('with phone') ||
      q.includes('with mobile') ||
      q.includes('phone number') ||
      q.includes('mobile number') ||
      q.includes('email')
    );
  }
  return false;
}
