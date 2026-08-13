import type { TypingTextCategory } from '@worknest/types';

/** Word pools per category — easy to extend later */
export const TEXT_COLLECTIONS: Record<TypingTextCategory, string[]> = {
  general: [
    'the', 'quick', 'brown', 'fox', 'jumps', 'over', 'lazy', 'dog', 'time', 'write',
    'read', 'learn', 'practice', 'every', 'day', 'make', 'progress', 'slow', 'steady',
    'focus', 'mind', 'clear', 'goal', 'simple', 'clean', 'design', 'works', 'well',
    'house', 'turn', 'leave', 'form', 'group', 'again', 'other', 'since', 'problem',
    'keep', 'during', 'while', 'here', 'will', 'than', 'new', 'say', 'but', 'up',
  ],
  business: [
    'meeting', 'report', 'budget', 'client', 'project', 'deadline', 'team', 'plan',
    'review', 'update', 'revenue', 'profit', 'market', 'sales', 'growth', 'strategy',
    'invoice', 'payment', 'contract', 'vendor', 'partner', 'quarter', 'annual', 'goal',
    'stakeholder', 'deliverable', 'milestone', 'forecast', 'pipeline', 'margin',
  ],
  erp: [
    'inventory', 'warehouse', 'supplier', 'purchase', 'requisition', 'order', 'receive',
    'stock', 'product', 'employee', 'department', 'permission', 'role', 'audit', 'ledger',
    'module', 'workflow', 'approval', 'balance', 'movement', 'adjustment', 'procurement',
    'organization', 'position', 'user', 'account', 'transaction', 'record', 'system',
  ],
  office: [
    'email', 'calendar', 'schedule', 'printer', 'folder', 'document', 'spreadsheet',
    'coffee', 'break', 'lunch', 'desk', 'chair', 'keyboard', 'monitor', 'phone',
    'conference', 'agenda', 'minutes', 'memo', 'policy', 'handbook', 'training',
    'onboarding', 'payroll', 'benefits', 'leave', 'attendance', 'shift', 'overtime',
  ],
  programming: [
    'function', 'variable', 'constant', 'array', 'object', 'string', 'number', 'boolean',
    'async', 'await', 'promise', 'callback', 'module', 'import', 'export', 'class',
    'interface', 'type', 'return', 'const', 'let', 'null', 'undefined', 'error',
    'debug', 'test', 'build', 'deploy', 'commit', 'branch', 'merge', 'refactor',
  ],
};

export const TEXT_CATEGORY_LABELS: Record<TypingTextCategory, string> = {
  general: 'General',
  business: 'Business',
  erp: 'ERP',
  office: 'Office',
  programming: 'Programming',
};

export const TIME_MODE_OPTIONS = [15, 30, 60, 120] as const;
export const WORD_MODE_OPTIONS = [25, 50, 100] as const;
export const DEFAULT_TIME_MODE = 30;
export const DEFAULT_WORD_MODE = 25;

export type TypingModeType = 'time' | 'words';

export type TypingConfig = {
  modeType: TypingModeType;
  modeValue: number;
  category: TypingTextCategory;
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export type WordSlice = { word: string; startIndex: number };

/** Split "hello world foo" into words with their start index in the full string */
export function splitWords(text: string): WordSlice[] {
  const words: WordSlice[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === ' ') {
      i++;
      continue;
    }
    const startIndex = i;
    while (i < text.length && text[i] !== ' ') i++;
    words.push({ word: text.slice(startIndex, i), startIndex });
  }
  return words;
}

/** How many words to show at once before advancing to the next set */
export const WORDS_PER_CHUNK = 20;

export type TextChunk = {
  /** Char index where this chunk starts in the full text */
  start: number;
  /** Char index where this chunk ends (after trailing space if any) */
  end: number;
  /** Words in this chunk */
  words: WordSlice[];
};

/** Split full text into fixed-size word batches (e.g. 15 words each) */
export function splitTextIntoChunks(
  text: string,
  wordsPerChunk = WORDS_PER_CHUNK,
): TextChunk[] {
  const allWords = splitWords(text);
  const chunks: TextChunk[] = [];

  for (let i = 0; i < allWords.length; i += wordsPerChunk) {
    const chunkWords = allWords.slice(i, i + wordsPerChunk);
    if (chunkWords.length === 0) break;

    const start = chunkWords[0]!.startIndex;
    const lastWord = chunkWords[chunkWords.length - 1]!;
    let end = lastWord.startIndex + lastWord.word.length;
    // Include the space after the last word so typing it advances to the next chunk
    if (end < text.length && text[end] === ' ') end += 1;

    chunks.push({ start, end, words: chunkWords });
  }

  if (chunks.length === 0 && text.length > 0) {
    chunks.push({ start: 0, end: text.length, words: allWords });
  }

  return chunks;
}

/** Which word-batch the user is on (advances only after finishing the current set) */
export function getCurrentChunkIndex(chunks: TextChunk[], cursorIndex: number): number {
  if (chunks.length === 0) return 0;

  for (let i = 0; i < chunks.length; i++) {
    if (cursorIndex < chunks[i]!.end) return i;
  }

  return chunks.length - 1;
}

/** Build a space-separated word string with enough words for the test */
export function generateTestText(config: TypingConfig): string {
  const pool = TEXT_COLLECTIONS[config.category];
  const minWords =
    config.modeType === 'words'
      ? config.modeValue + 20
      : Math.max(120, config.modeValue * 3);

  const words: string[] = [];
  while (words.length < minWords) {
    words.push(pickRandom(pool));
  }

  return words.join(' ');
}

/** Count completed words: cursor is after a space following word chars */
export function countCompletedWords(text: string, cursorIndex: number): number {
  const typed = text.slice(0, cursorIndex);
  if (!typed.trim()) return 0;
  return typed.trim().split(/\s+/).filter(Boolean).length;
}

export function calcWpm(correctChars: number, durationSeconds: number): number {
  if (durationSeconds <= 0) return 0;
  const minutes = durationSeconds / 60;
  return Math.round(((correctChars / 5) / minutes) * 10) / 10;
}

export function calcRawWpm(totalChars: number, durationSeconds: number): number {
  if (durationSeconds <= 0) return 0;
  const minutes = durationSeconds / 60;
  return Math.round(((totalChars / 5) / minutes) * 10) / 10;
}

export function calcAccuracy(correct: number, total: number): number {
  if (total <= 0) return 100;
  return Math.round((correct / total) * 1000) / 10;
}

export type CharState = 'pending' | 'correct' | 'incorrect' | 'extra';

export function getCharStates(text: string, typed: string): CharState[] {
  const states: CharState[] = [];
  for (let i = 0; i < text.length; i++) {
    if (i >= typed.length) {
      states.push('pending');
    } else if (typed[i] === text[i]) {
      states.push('correct');
    } else {
      states.push('incorrect');
    }
  }
  return states;
}

/** Map a character to virtual keyboard key id */
export function charToKeyId(char: string): string | null {
  if (char === ' ') return 'space';
  const lower = char.toLowerCase();
  if (lower >= 'a' && lower <= 'z') return lower;
  return null;
}

export const KEYBOARD_ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
] as const;
