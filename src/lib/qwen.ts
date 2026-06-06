import { UsageTag, Word, WordMeaning } from '../types';

const ENDPOINT = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const MODEL = 'qwen-plus';
const REQUEST_TIMEOUT_MS = 20000;

const SYSTEM_PROMPT = `You are a professional English dictionary assistant. Given an English word or phrase, return a JSON object with the following structure:

{
  "word": "the input word or phrase",
  "phonetic_uk": "UK IPA transcription",
  "phonetic_us": "US IPA transcription",
  "usage_tags": ["written" and/or "spoken"],
  "collocations": ["common collocation 1", "common collocation 2", "common collocation 3"],
  "meanings": [
    {
      "meaning_en": "English definition in simple, clear language",
      "meaning_cn": "简洁准确的中文释义",
      "example_en": "A natural English example sentence using this meaning",
      "example_cn": "例句的中文翻译"
    }
  ]
}

Rules:
1. Provide 2-4 most common meanings, ordered by frequency of use.
2. Prioritize workplace and professional contexts for examples when applicable.
3. collocations: provide 2-4 high-frequency and practical collocations for the word.
4. meaning_en: use clear, concise definitions similar to learner dictionaries (e.g., Oxford Learner's Dictionary style).
5. meaning_cn: accurate and natural Chinese translation.
6. example_en: natural, complete sentences that clearly demonstrate the meaning in context.
7. example_cn: accurate Chinese translation of the example sentence.
8. usage_tags: must include at least one of "written" or "spoken"; include both if the word is common in both contexts.
9. If the input is not a valid English word or phrase, return: {"error": "not_found"}.
10. Return ONLY valid JSON, no additional text or markdown formatting.`;

export type SearchOutcome =
  | { kind: 'ok'; word: Word }
  | { kind: 'not_found' }
  | { kind: 'timeout' }
  | { kind: 'network' }
  | { kind: 'failed'; message?: string }
  | { kind: 'no_key' };

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type ChatOutcome =
  | { kind: 'ok'; reply: string }
  | { kind: 'timeout' }
  | { kind: 'network' }
  | { kind: 'failed'; message?: string }
  | { kind: 'no_key' };

const CHAT_TIMEOUT_MS = 30000;
const TRANSLATE_TIMEOUT_MS = 20000;

const TRANSLATE_SYSTEM_PROMPT = `You are a professional English-Chinese translator for a vocabulary app. Given a JSON array of meaning objects (each with meaning_en and example_en), return a JSON object {"items":[{"meaning_cn":"...","example_cn":"..."}, ...]} preserving the exact same order and length. Rules:
1. meaning_cn: 准确、简洁的中文释义，保留词性标记如（v.）。
2. example_cn: 为 example_en 提供自然准确的中文翻译；若 example_en 为空则 example_cn 返回空字符串。
3. Output ONLY valid JSON, no markdown, no extra text.`;

/**
 * 按需调 Qwen 为已有的英文释义补充中文翻译。
 * 输入为一组 {meaning_en, example_en}，输出为同顺序等长的 {meaning_cn, example_cn}。
 */
export type TranslateOutcome =
  | { kind: 'ok'; items: Array<{ meaning_cn: string; example_cn: string }> }
  | { kind: 'timeout' }
  | { kind: 'network' }
  | { kind: 'failed'; message?: string }
  | { kind: 'no_key' };

export async function translateMeaningsToChinese(
  payload: Array<{ meaning_en: string; example_en: string }>,
  apiKey: string
): Promise<TranslateOutcome> {
  if (!apiKey || !apiKey.trim()) return { kind: 'no_key' };
  if (!Array.isArray(payload) || payload.length === 0) return { kind: 'failed', message: 'empty payload' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRANSLATE_TIMEOUT_MS);
  try {
    const resp = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: TRANSLATE_SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(payload) }
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' }
      })
    });

    if (!resp.ok) {
      const text = await safeText(resp);
      return { kind: 'failed', message: `HTTP ${resp.status} ${text.slice(0, 120)}` };
    }

    const json = await resp.json();
    const content: string = json?.choices?.[0]?.message?.content ?? '';
    const parsed = safeParseJson(content);
    if (!parsed) return { kind: 'failed', message: 'invalid JSON from model' };
    const itemsRaw = Array.isArray((parsed as Record<string, unknown>).items)
      ? ((parsed as Record<string, unknown>).items as unknown[])
      : null;
    if (!itemsRaw) return { kind: 'failed', message: 'missing items field' };

    const items = itemsRaw.map(it => {
      if (typeof it !== 'object' || it === null) return { meaning_cn: '', example_cn: '' };
      const obj = it as Record<string, unknown>;
      return { meaning_cn: str(obj.meaning_cn), example_cn: str(obj.example_cn) };
    });
    return { kind: 'ok', items };
  } catch (err: unknown) {
    if (isAbortError(err)) return { kind: 'timeout' };
    return { kind: 'network' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 多轮对话接口：供「问一问 AI」页面使用。
 * 会话上下文由调用方维护，此函数不做重试，避免重复计费。
 */
export async function chatWithQwen(messages: ChatMessage[], apiKey: string): Promise<ChatOutcome> {
  if (!apiKey || !apiKey.trim()) return { kind: 'no_key' };
  if (messages.length === 0) return { kind: 'failed', message: 'empty messages' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);
  try {
    const resp = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.5
      })
    });

    if (!resp.ok) {
      const text = await safeText(resp);
      return { kind: 'failed', message: `HTTP ${resp.status} ${text.slice(0, 120)}` };
    }

    const json = await resp.json();
    const reply: string = json?.choices?.[0]?.message?.content ?? '';
    if (!reply.trim()) return { kind: 'failed', message: 'empty reply' };
    return { kind: 'ok', reply };
  } catch (err: unknown) {
    if (isAbortError(err)) return { kind: 'timeout' };
    return { kind: 'network' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 调 Qwen 查词。PRD 要求失败时自动重试 1 次。
 * not_found / no_key 不重试；timeout / network / failed 重试一次。
 */
export async function searchWordWithQwen(query: string, apiKey: string): Promise<SearchOutcome> {
  if (!apiKey || !apiKey.trim()) return { kind: 'no_key' };
  const trimmed = query.trim();
  if (!trimmed) return { kind: 'failed', message: 'empty query' };

  let last: SearchOutcome = { kind: 'failed' };
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await callOnce(trimmed, apiKey.trim());
    if (result.kind === 'ok' || result.kind === 'not_found') return result;
    last = result;
  }
  return last;
}

async function callOnce(query: string, apiKey: string): Promise<SearchOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: query }
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' }
      })
    });

    if (!resp.ok) {
      const text = await safeText(resp);
      return { kind: 'failed', message: `HTTP ${resp.status} ${text.slice(0, 120)}` };
    }

    const json = await resp.json();
    const content: string = json?.choices?.[0]?.message?.content ?? '';
    const parsed = safeParseJson(content);
    if (!parsed) return { kind: 'failed', message: 'invalid JSON from model' };
    if (parsed.error === 'not_found') return { kind: 'not_found' };

    const word = toWord(parsed, query);
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

async function safeText(resp: Response): Promise<string> {
  try {
    return await resp.text();
  } catch {
    return '';
  }
}

function safeParseJson(content: string): Record<string, unknown> | null {
  if (!content) return null;
  // 兼容偶尔被 ```json ... ``` 包裹的输出
  const stripped = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    const obj = JSON.parse(stripped);
    return typeof obj === 'object' && obj !== null ? (obj as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function toWord(raw: Record<string, unknown>, query: string): Word | null {
  const meaningsRaw = Array.isArray(raw.meanings) ? raw.meanings : null;
  if (!meaningsRaw || meaningsRaw.length === 0) return null;

  const meanings: WordMeaning[] = meaningsRaw
    .map((m: unknown) => {
      if (typeof m !== 'object' || m === null) return null;
      const obj = m as Record<string, unknown>;
      return {
        meaning_en: str(obj.meaning_en),
        meaning_cn: str(obj.meaning_cn),
        example_en: str(obj.example_en),
        example_cn: str(obj.example_cn)
      };
    })
    .filter((m): m is WordMeaning => m !== null && m.meaning_en.length > 0);

  if (meanings.length === 0) return null;

  const usageTagsRaw = Array.isArray(raw.usage_tags) ? raw.usage_tags : [];
  const usageTags = usageTagsRaw
    .map(t => str(t).toLowerCase())
    .filter((t): t is UsageTag => t === 'written' || t === 'spoken');

  const collocations = Array.isArray(raw.collocations)
    ? raw.collocations.map(c => str(c)).filter(c => c.length > 0)
    : [];

  const word = str(raw.word) || query;
  return {
    id: `qwen-${word.toLowerCase()}-${Date.now()}`,
    word,
    phonetic_uk: str(raw.phonetic_uk),
    phonetic_us: str(raw.phonetic_us),
    usage_tags: usageTags.length > 0 ? usageTags : ['written'],
    collocations,
    meanings
  };
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
