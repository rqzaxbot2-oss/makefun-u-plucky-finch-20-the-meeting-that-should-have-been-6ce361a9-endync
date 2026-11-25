export const MAX_JOKE_CHARS = 200;
export const IDEAL_MIN_CHARS = 48;
export const IDEAL_MAX_CHARS = 155;
export const IDEAL_MIN_WORDS = 9;
export const IDEAL_MAX_WORDS = 28;

export interface SnapshotSignal {
  name: string;
  value: number;
  weight: number;
  min?: number;
  max?: number;
  invert?: boolean;
}

export interface SnapshotScoreResult {
  total: number;
  normalized: number;
  totalWeight: number;
  breakdown: Record<string, number>;
}

export interface JokeCraftMetrics {
  text: string;
  length: number;
  wordCount: number;
  isSingleLine: boolean;
  withinLimit: boolean;
  economyScore: number;
  standaloneScore: number;
  freshnessScore: number;
  relevanceScore: number;
  punchPositionScore: number;
  clichePenalty: number;
  overallScore: number;
  valid: boolean;
  reasons: string[];
}

export interface RankedJoke extends JokeCraftMetrics {
  rank: number;
  fingerprint: string;
}

export interface PairwiseComparison {
  winner: "a" | "b" | "tie";
  margin: number;
  aMetrics: JokeCraftMetrics;
  bMetrics: JokeCraftMetrics;
}

const MEETING_TERMS: readonly string[] = [
  "meeting",
  "sync",
  "standup",
  "call",
  "zoom",
  "teams",
  "calendar",
  "invite",
  "agenda",
  "huddle",
  "all-hands",
  "retro",
  "kickoff",
  "checkin",
  "check-in",
  "recurring",
  "conference",
  "boardroom",
  "slide",
  "slides",
  "deck",
  "screen",
  "mute",
  "muted",
  "attendees",
  "hour",
  "minutes",
  "align",
  "alignment",
  "circle",
  "touchbase",
];

const EMAIL_TERMS: readonly string[] = [
  "email",
  "inbox",
  "subject",
  "reply",
  "reply-all",
  "cc",
  "bcc",
  "thread",
  "memo",
  "bullet",
  "sentence",
  "paragraph",
  "draft",
  "send",
  "sent",
  "unread",
  "archive",
  "slack",
  "text",
  "note",
  "two-word",
  "one-line",
  "yes",
  "no",
];

const TURN_MARKERS: readonly string[] = [
  "only",
  "just",
  "turns",
  "turned",
  "except",
  "until",
  "instead",
  "ended",
  "ended up",
  "scheduled",
  "booked",
  "spent",
  "survived",
  "announced",
  "concluded",
  "recap",
  "follow-up",
  "followup",
  "action",
  "actually",
  "basically",
  "apparently",
  "finally",
  "still",
  "now",
];

const FILLER_WORDS: readonly string[] = [
  "very",
  "really",
  "literally",
  "honestly",
  "basically",
  "totally",
  "definitely",
  "obviously",
  "actually",
  "simply",
  "perhaps",
  "maybe",
  "somewhat",
  "kind",
  "sort",
];

const CLICHE_PHRASES: readonly string[] = [
  "this meeting could have been an email",
  "that meeting could have been an email",
  "meeting that could have been an email",
  "meeting that should have been an email",
  "could have been an email",
  "should have been an email",
  "i survived another meeting",
  "per my last email",
  "circle back",
  "synergy",
];

const SETUP_PREFIXES: readonly string[] = [
  "joke:",
  "here is",
  "here's",
  "imagine",
  "so today",
  "you know how",
  "have you ever",
  "pov:",
  "me:",
];

export function roundFixed(value: number, decimals = 4): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

export function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function normalizeSignal(signal: SnapshotSignal): number {
  const min = signal.min ?? 0;
  const max = signal.max ?? 1;
  if (!Number.isFinite(signal.value) || max <= min) {
    return 0;
  }
  const raw = clamp((signal.value - min) / (max - min), 0, 1);
  return roundFixed(signal.invert ? 1 - raw : raw, 4);
}

export function scoreSnapshot(signals: readonly SnapshotSignal[]): SnapshotScoreResult {
  const breakdown: Record<string, number> = {};
  let weightedSum = 0;
  let totalWeight = 0;

  for (const signal of signals) {
    const weight = Number.isFinite(signal.weight) && signal.weight > 0 ? signal.weight : 0;
    const norm = normalizeSignal(signal);
    const contribution = roundFixed(norm * weight, 4);
    breakdown[signal.name] = contribution;
    weightedSum += norm * weight;
    totalWeight += weight;
  }

  const normalized = totalWeight > 0 ? weightedSum / totalWeight : 0;
  return {
    total: roundFixed(weightedSum, 4),
    normalized: roundFixed(normalized, 4),
    totalWeight: roundFixed(totalWeight, 4),
    breakdown,
  };
}

export function normalizePlainLine(raw: string): string {
  return raw.replace(/\t/g, " ").replace(/ {2,}/g, " ").trim();
}

export function tokenizeWords(line: string): string[] {
  const matches = line.toLowerCase().match(/[a-z0-9]+(?:['’-][a-z0-9]+)*/g);
  return matches ? [...matches] : [];
}

function countTermHits(words: readonly string[], lexicon: readonly string[]): number {
  const seen = new Set<string>();
  for (const word of words) {
    for (const term of lexicon) {
      if (word === term || (term.length >= 4 && word.startsWith(term))) {
        seen.add(term);
      }
    }
  }
  return seen.size;
}

function computeEconomyScore(text: string, words: readonly string[]): number {
  const len = text.length;
  const count = words.length;
  if (len === 0 || count === 0) {
    return 0;
  }

  let lengthFit = 1;
  if (len < IDEAL_MIN_CHARS) {
    lengthFit = clamp(len / IDEAL_MIN_CHARS, 0.2, 1);
  } else if (len > IDEAL_MAX_CHARS) {
    const excess = (len - IDEAL_MAX_CHARS) / (MAX_JOKE_CHARS - IDEAL_MAX_CHARS);
    lengthFit = clamp(1 - excess * 0.45, 0.4, 1);
  }

  let wordFit = 1;
  if (count < IDEAL_MIN_WORDS) {
    wordFit = clamp(count / IDEAL_MIN_WORDS, 0.25, 1);
  } else if (count > IDEAL_MAX_WORDS) {
    wordFit = clamp(1 - (count - IDEAL_MAX_WORDS) * 0.05, 0.35, 1);
  }

  const uniqueRatio = new Set(words).size / count;
  let fillerCount = 0;
  for (const word of words) {
    if (FILLER_WORDS.includes(word)) {
      fillerCount += 1;
    }
  }
  const fillerPenalty = clamp(fillerCount * 0.12, 0, 0.48);

  return roundFixed(clamp(lengthFit * 0.4 + wordFit * 0.35 + uniqueRatio * 0.25 - fillerPenalty, 0, 1), 4);
}

function computeStandaloneScore(text: string, words: readonly string[]): number {
  if (words.length === 0) {
    return 0;
  }
  const lower = text.toLowerCase();
  let score = 0.72;

  if (/^[A-Z"“]/.test(text)) {
    score += 0.1;
  }
  if (/[.!?]["”]?$/.test(text)) {
    score += 0.1;
  }
  if (/<[a-z/!][^>]*>/i.test(text) || /https?:\/\//i.test(text)) {
    score -= 0.5;
  }
  for (const prefix of SETUP_PREFIXES) {
    if (lower.startsWith(prefix)) {
      score -= 0.3;
      break;
    }
  }

  const sentenceBreaks = (text.match(/[.!?]+\s+/g) ?? []).length;
  if (sentenceBreaks === 1) {
    score += 0.08;
  } else if (sentenceBreaks >= 3) {
    score -= 0.2;
  }

  return roundFixed(clamp(score, 0, 1), 4);
}

function computeRelevanceScore(words: readonly string[]): number {
  const meetingHits = countTermHits(words, MEETING_TERMS);
  const emailHits = countTermHits(words, EMAIL_TERMS);
  const hasBoth = meetingHits > 0 && emailHits > 0;
  const meetingPart = clamp(meetingHits / 2, 0, 1);
  const emailPart = clamp(emailHits / 2, 0, 1);
  const base = meetingPart * 0.45 + emailPart * 0.35 + (hasBoth ? 0.2 : 0);
  return roundFixed(clamp(base, 0, 1), 4);
}

function computePunchPositionScore(text: string, words: readonly string[]): number {
  if (words.length < 4) {
    return 0.2;
  }

  const lower = text.toLowerCase();
  let score = 0.45;

  const pivotMatch = /[,;:—–-]\s+[^,;:—–-]+$/.exec(text);
  if (pivotMatch) {
    const ratio = pivotMatch.index / text.length;
    if (ratio >= 0.42 && ratio <= 0.85) {
      score += 0.3;
    } else if (ratio > 0.25) {
      score += 0.15;
    }
  }

  const secondHalfStart = Math.floor(words.length * 0.45);
  let turnInSecondHalf = false;
  for (let i = secondHalfStart; i < words.length; i += 1) {
    if (TURN_MARKERS.includes(words[i])) {
      turnInSecondHalf = true;
      break;
    }
  }
  if (turnInSecondHalf) {
    score += 0.15;
  }

  const hasContrastDigit = /\b\d+\b/.test(lower);
  if (hasContrastDigit) {
    score += 0.1;
  }

  return roundFixed(clamp(score, 0, 1), 4);
}

function computeClichePenalty(text: string): number {
  const lower = text.toLowerCase();
  let penalty = 0;
  for (const phrase of CLICHE_PHRASES) {
    if (lower.includes(phrase)) {
      penalty += 0.28;
    }
  }
  return roundFixed(clamp(penalty, 0, 0.7), 4);
}

function computeFreshnessScore(
  text: string,
  words: readonly string[],
  clichePenalty: number,
): number {
  if (words.length === 0) {
    return 0;
  }
  const uniqueWords = new Set(words);
  const lexicalVariety = uniqueWords.size / words.length;

  let concreteDetailBonus = 0;
  if (/\b\d+[- ]?(minute|min|hour|hr|word|slide|person|people|slide|deck|email)\b/i.test(text)) {
    concreteDetailBonus += 0.14;
  }
  if (/["“][^"”]{2,40}["”]/.test(text)) {
    concreteDetailBonus += 0.1;
  }
  if (/[—–:;]/.test(text)) {
    concreteDetailBonus += 0.08;
  }

  const raw = lexicalVariety * 0.72 + concreteDetailBonus - clichePenalty;
  return roundFixed(clamp(raw, 0, 1), 4);
}

export function scoreJokeCraft(candidate: string): JokeCraftMetrics {
  const isSingleLine = !/[\r\n]/.test(candidate);
  const text = isSingleLine ? normalizePlainLine(candidate) : candidate.trim();
  const length = text.length;
  const withinLimit = length > 0 && length <= MAX_JOKE_CHARS;
  const words = tokenizeWords(text);
  const wordCount = words.length;

  const reasons: string[] = [];
  if (!isSingleLine) {
    reasons.push("contains line break");
  }
  if (length === 0) {
    reasons.push("empty line");
  }
  if (length > MAX_JOKE_CHARS) {
    reasons.push(`exceeds ${MAX_JOKE_CHARS} characters`);
  }
  if (wordCount < 4) {
    reasons.push("too few words to establish a turn");
  }

  const economyScore = computeEconomyScore(text, words);
  const standaloneScore = computeStandaloneScore(text, words);
  const relevanceScore = computeRelevanceScore(words);
  const punchPositionScore = computePunchPositionScore(text, words);
  const clichePenalty = computeClichePenalty(text);
  const freshnessScore = computeFreshnessScore(text, words, clichePenalty);

  const valid = isSingleLine && withinLimit && wordCount >= 4;

  const snapshot = scoreSnapshot([
    { name: "freshness", value: freshnessScore, weight: 0.3 },
    { name: "economy", value: economyScore, weight: 0.24 },
    { name: "standalone", value: standaloneScore, weight: 0.18 },
    { name: "relevance", value: relevanceScore, weight: 0.16 },
    { name: "punchPosition", value: punchPositionScore, weight: 0.12 },
  ]);

  const overallScore = valid ? snapshot.normalized : roundFixed(snapshot.normalized * 0.25, 4);

  return {
    text,
    length,
    wordCount,
    isSingleLine,
    withinLimit,
    economyScore,
    standaloneScore,
    freshnessScore,
    relevanceScore,
    punchPositionScore,
    clichePenalty,
    overallScore,
    valid,
    reasons,
  };
}

function compareLex(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

export function rankJokeCandidates(candidates: readonly string[]): RankedJoke[] {
  const scored = candidates.map((line) => {
    const metrics = scoreJokeCraft(line);
    return {
      ...metrics,
      rank: 0,
      fingerprint: fnv1a32(metrics.text),
    };
  });

  scored.sort((a, b) => {
    if (a.valid !== b.valid) {
      return a.valid ? -1 : 1;
    }
    if (b.overallScore !== a.overallScore) {
      return b.overallScore - a.overallScore;
    }
    if (b.freshnessScore !== a.freshnessScore) {
      return b.freshnessScore - a.freshnessScore;
    }
    if (b.economyScore !== a.economyScore) {
      return b.economyScore - a.economyScore;
    }
    if (a.length !== b.length) {
      return a.length - b.length;
    }
    const fpCmp = compareLex(a.fingerprint, b.fingerprint);
    if (fpCmp !== 0) {
      return fpCmp;
    }
    return compareLex(a.text, b.text);
  });

  return scored.map((item, index) => ({
    ...item,
    rank: index + 1,
  }));
}

export function selectBestJoke(candidates: readonly string[]): RankedJoke | null {
  const ranked = rankJokeCandidates(candidates);
  return ranked.length > 0 ? ranked[0] : null;
}

export function comparePairwise(a: string, b: string): PairwiseComparison {
  const aMetrics = scoreJokeCraft(a);
  const bMetrics = scoreJokeCraft(b);
  const diff = roundFixed(aMetrics.overallScore - bMetrics.overallScore, 4);

  if (aMetrics.valid !== bMetrics.valid) {
    return {
      winner: aMetrics.valid ? "a" : "b",
      margin: Math.abs(diff),
      aMetrics,
      bMetrics,
    };
  }

  if (diff > 0) {
    return { winner: "a", margin: diff, aMetrics, bMetrics };
  }
  if (diff < 0) {
    return { winner: "b", margin: Math.abs(diff), aMetrics, bMetrics };
  }
  return { winner: "tie", margin: 0, aMetrics, bMetrics };
}