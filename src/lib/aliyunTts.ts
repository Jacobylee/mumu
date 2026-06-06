import * as FileSystem from 'expo-file-system/legacy';

/**
 * 阿里云百炼 Qwen3-TTS-Flash 接入。
 *
 * 文档：https://help.aliyun.com/zh/model-studio/qwen-tts-api
 * 鉴权：复用查词用的 Qwen API Key（Bearer）。
 *
 * 调用流程：
 *   1) POST 文本 + voice，拿到一个 24 小时有效的 audio.url（mp3/wav）。
 *   2) 把音频流下载到本地 cache 目录，下次同词同口音直接用本地文件，节省调用次数。
 *
 * 音色选择（Qwen3-TTS 系统音色）：
 *   - 美式：Jennifer（官方明确标注 "cinematic American female voice"）
 *   - 英式：Cherry（Qwen-TTS 双语女声，作为另一种发音对照；
 *     当前 Qwen3 没有官方明确标注的英式音色，如后续上线可在 VOICE_BY_ACCENT 调整）
 */

const ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
const MODEL = 'qwen3-tts-flash';
const REQUEST_TIMEOUT_MS = 20000;

const VOICE_BY_ACCENT: Record<'uk' | 'us', string> = {
  us: 'Jennifer',
  uk: 'Cherry'
};

const CACHE_DIR = `${FileSystem.cacheDirectory ?? ''}tts/`;

export type TtsOutcome =
  | { kind: 'ok'; uri: string }
  | { kind: 'no_key' }
  | { kind: 'failed'; message?: string };

export async function fetchTtsAudio(
  word: string,
  accent: 'uk' | 'us',
  apiKey: string
): Promise<TtsOutcome> {
  const trimmedKey = apiKey?.trim();
  if (!trimmedKey) return { kind: 'no_key' };

  const trimmedWord = word.trim();
  if (!trimmedWord) return { kind: 'failed', message: 'empty word' };

  await ensureCacheDir();
  const cachePath = cachePathFor(trimmedWord, accent, 'mp3');
  const cached = await FileSystem.getInfoAsync(cachePath);
  if (cached.exists && (cached as { size?: number }).size && (cached as { size: number }).size > 0) {
    return { kind: 'ok', uri: cachePath };
  }

  const remoteUrl = await requestAudioUrl(trimmedWord, accent, trimmedKey);
  if (!remoteUrl) return { kind: 'failed', message: 'no audio url' };

  const ext = guessExt(remoteUrl);
  const finalPath = cachePathFor(trimmedWord, accent, ext);
  try {
    const { uri, status } = await FileSystem.downloadAsync(remoteUrl, finalPath);
    if (status >= 200 && status < 300) return { kind: 'ok', uri };
    return { kind: 'failed', message: `download HTTP ${status}` };
  } catch (err) {
    return { kind: 'failed', message: errorMessage(err) };
  }
}

async function ensureCacheDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(CACHE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
  }
}

function cachePathFor(word: string, accent: 'uk' | 'us', ext: string): string {
  const safe = word.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return `${CACHE_DIR}${safe}_${accent}.${ext}`;
}

function guessExt(url: string): string {
  const cleaned = url.split('?')[0]?.toLowerCase() ?? '';
  if (cleaned.endsWith('.wav')) return 'wav';
  if (cleaned.endsWith('.m4a')) return 'm4a';
  if (cleaned.endsWith('.mp3')) return 'mp3';
  return 'mp3';
}

async function requestAudioUrl(
  word: string,
  accent: 'uk' | 'us',
  apiKey: string
): Promise<string | null> {
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
        input: {
          text: word,
          voice: VOICE_BY_ACCENT[accent],
          language_type: 'English'
        }
      })
    });

    if (!resp.ok) return null;
    const json = (await resp.json()) as Record<string, unknown>;
    const output = json?.output as Record<string, unknown> | undefined;
    const audio = output?.audio as Record<string, unknown> | undefined;
    const url = typeof audio?.url === 'string' ? audio.url : null;
    return url && url.length > 0 ? url : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function errorMessage(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as { message: unknown }).message ?? '');
  }
  return String(err ?? '');
}
