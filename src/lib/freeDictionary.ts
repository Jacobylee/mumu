import { UsageTag, Word, WordMeaning } from '../types';
import type { SearchOutcome } from './qwen';

const ENDPOINT = 'https://api.dictionaryapi.dev/api/v2/entries/en';
const REQUEST_TIMEOUT_MS = 8000;

/**
 * 默认查词通道：dictionaryapi.dev，免费且无需 Key，毫秒级返回。
 * 仅返回英文释义；中文释义/语境对话由「问一问 AI」走 Qwen。
 * 失败语义复用 Qwen 的 SearchOutcome，方便上层统一展示。
 */
export async function searchWordWithFreeDictionary(query: string): Promise<SearchOutcome> {
  const trimmed = query.trim();
  if (!trimmed) return { kind: 'failed', message: 'empty query' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch(`${ENDPOINT}/${encodeURIComponent(trimmed)}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });

    if (resp.status === 404) return { kind: 'not_found' };
    if (!resp.ok) return { kind: 'failed', message: `HTTP ${resp.status}` };

    const json = await resp.json();
    if (!Array.isArray(json) || json.length === 0) return { kind: 'not_found' };

    const word = toWord(json, trimmed);
    if (!word) return { kind: 'failed', message: 'invalid response shape' };
    return { kind: 'ok', word };
  } catch (err: unknown) {
    if (isAbortError(err)) return { kind: 'timeout' };
    return { kind: 'network' };
  } finally {
    clearTimeout(timer);
  }
}

function isAbortError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { name?: string }).name === 'AbortError';
}

type RawPhonetic = { text?: string; audio?: string };
type RawDefinition = { definition?: string; example?: string };
type RawMeaning = { partOfSpeech?: string; definitions?: RawDefinition[] };
type RawEntry = { word?: string; phonetic?: string; phonetics?: RawPhonetic[]; meanings?: RawMeaning[] };

function toWord(entries: RawEntry[], query: string): Word | null {
  // dictionaryapi.dev 同一词可能返回多个 entry，合并所有 meanings。
  const allPhonetics: RawPhonetic[] = [];
  const allMeanings: RawMeaning[] = [];
  let topLevelPhonetic = '';
  let resolvedWord = '';

  for (const entry of entries) {
    if (!resolvedWord && typeof entry.word === 'string') resolvedWord = entry.word;
    if (!topLevelPhonetic && typeof entry.phonetic === 'string') topLevelPhonetic = entry.phonetic;
    if (Array.isArray(entry.phonetics)) allPhonetics.push(...entry.phonetics);
    if (Array.isArray(entry.meanings)) allMeanings.push(...entry.meanings);
  }

  // 抽音标：优先用带音频的 GB / US 区分，其次回退到任意非空文本。
  const ukPhonetic = pickPhonetic(allPhonetics, 'gb') || topLevelPhonetic || pickFirstText(allPhonetics);
  const usPhonetic = pickPhonetic(allPhonetics, 'us') || topLevelPhonetic || ukPhonetic;

  const meanings: WordMeaning[] = [];
  for (const m of allMeanings) {
    const pos = typeof m.partOfSpeech === 'string' ? m.partOfSpeech : '';
    const defs = Array.isArray(m.definitions) ? m.definitions : [];
    for (const d of defs) {
      const defText = typeof d.definition === 'string' ? d.definition.trim() : '';
      if (!defText) continue;
      meanings.push({
        meaning_en: pos ? `(${pos}) ${defText}` : defText,
        meaning_cn: '',
        example_en: typeof d.example === 'string' ? d.example : '',
        example_cn: ''
      });
      if (meanings.length >= 4) break;
    }
    if (meanings.length >= 4) break;
  }

  if (meanings.length === 0) return null;

  const usageTags: UsageTag[] = ['written'];
  const word = resolvedWord || query;
  return {
    id: `dict-${word.toLowerCase()}-${Date.now()}`,
    word,
    phonetic_uk: ukPhonetic,
    phonetic_us: usPhonetic,
    usage_tags: usageTags,
    collocations: [],
    meanings
  };
}

function pickPhonetic(list: RawPhonetic[], hint: 'gb' | 'us'): string {
  for (const p of list) {
    if (typeof p.audio === 'string' && p.audio.includes(`_${hint}_`)) {
      if (typeof p.text === 'string' && p.text) return p.text;
    }
  }
  return '';
}

function pickFirstText(list: RawPhonetic[]): string {
  for (const p of list) {
    if (typeof p.text === 'string' && p.text) return p.text;
  }
  return '';
}
