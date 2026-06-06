import * as FileSystem from 'expo-file-system/legacy';

/**
 * 有道词典发音通道（零配置）。
 *
 * 接口：https://dict.youdao.com/dictvoice?audio={word}&type={1|2}
 *   - type=1 → 英式英文
 *   - type=2 → 美式英文
 * 直接返回 mp3 二进制；无需任何 API Key；CDN 分发；
 * 同一 (word, type) 输出的音频字节是固定的，每次发音一致。
 *
 * 使用策略：
 *   1) 命中本地 cache → 直接返回缓存路径。
 *   2) 未命中 → 下载到 cache，再返回路径。
 *   3) 下载失败 → 调用方应降级到 expo-speech 系统 TTS。
 */

const ENDPOINT = 'https://dict.youdao.com/dictvoice';
const REQUEST_TIMEOUT_MS = 12000;

const TYPE_BY_ACCENT: Record<'uk' | 'us', 1 | 2> = {
  uk: 1,
  us: 2
};

const CACHE_DIR = `${FileSystem.cacheDirectory ?? ''}tts/`;

export type YoudaoTtsOutcome =
  | { kind: 'ok'; uri: string }
  | { kind: 'failed'; message?: string };

export async function fetchYoudaoAudio(
  word: string,
  accent: 'uk' | 'us'
): Promise<YoudaoTtsOutcome> {
  const trimmed = word.trim();
  if (!trimmed) return { kind: 'failed', message: 'empty word' };

  await ensureCacheDir();
  const cachePath = cachePathFor(trimmed, accent);

  const cached = await FileSystem.getInfoAsync(cachePath);
  if (
    cached.exists &&
    (cached as { size?: number }).size &&
    (cached as { size: number }).size > 0
  ) {
    return { kind: 'ok', uri: cachePath };
  }

  const remoteUrl = buildRemoteUrl(trimmed, accent);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const { uri, status } = await FileSystem.downloadAsync(remoteUrl, cachePath);
    if (status >= 200 && status < 300) {
      const info = await FileSystem.getInfoAsync(uri);
      const size = (info as { size?: number }).size ?? 0;
      if (size > 0) return { kind: 'ok', uri };
      // 0 字节通常意味着该词不在词典，及时清掉避免下次命中假缓存。
      await FileSystem.deleteAsync(uri, { idempotent: true });
      return { kind: 'failed', message: 'empty audio' };
    }
    return { kind: 'failed', message: `HTTP ${status}` };
  } catch (err) {
    return { kind: 'failed', message: errorMessage(err) };
  } finally {
    clearTimeout(timer);
  }
}

function buildRemoteUrl(word: string, accent: 'uk' | 'us'): string {
  const params = new URLSearchParams({
    audio: word,
    type: String(TYPE_BY_ACCENT[accent])
  });
  return `${ENDPOINT}?${params.toString()}`;
}

async function ensureCacheDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(CACHE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
  }
}

function cachePathFor(word: string, accent: 'uk' | 'us'): string {
  const safe = word.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return `${CACHE_DIR}yd_${safe}_${accent}.mp3`;
}

function errorMessage(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as { message: unknown }).message ?? '');
  }
  return String(err ?? '');
}
