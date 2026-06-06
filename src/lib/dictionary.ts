import { words } from '../mockData';
import { searchWordWithFreeDictionary } from './freeDictionary';
import { searchWordWithQwen, suggestSimilarWords, type SearchOutcome } from './qwen';

export type { SearchOutcome } from './qwen';

/**
 * 查词统一入口。路由策略：
 * 1. 先走 dictionaryapi.dev（免费、无需 Key、毫秒级响应）
 * 2. 若 not_found 且输入含空格（短语）→ 降级 Qwen 查词
 * 3. 若 not_found 且输入为单词（可能拼写错误）→ 降级 Qwen 模糊建议（猜你想搜）
 * 4. 网络/超时/服务异常时降级到本地 mock 词条以保证开发体验。
 */
export async function searchWord(query: string, apiKey?: string): Promise<SearchOutcome> {
  const trimmed = query.trim();
  if (!trimmed) return { kind: 'failed', message: 'empty query' };

  const remote = await searchWordWithFreeDictionary(trimmed);

  // 命中或确定存在 → 直接返回
  if (remote.kind === 'ok') return remote;

  // not_found：尝试 AI 兜底
  if (remote.kind === 'not_found') {
    const hasApiKey = Boolean(apiKey && apiKey.trim());
    const isPhrase = trimmed.includes(' ');

    if (hasApiKey && isPhrase) {
      // 短语：Qwen 直接查词
      const qwenResult = await searchWordWithQwen(trimmed, apiKey!);
      if (qwenResult.kind === 'ok') return qwenResult;
      // Qwen 也没查到 → 返回 not_found
      return { kind: 'not_found' };
    }

    if (hasApiKey && !isPhrase) {
      // 单词拼错：Qwen 模糊建议
      const suggest = await suggestSimilarWords(trimmed, apiKey!);
      if (suggest.kind === 'ok') return { kind: 'suggestions', items: suggest.items };
    }

    // 没有 Key 或 AI 也失败 → 返回原始 not_found
    return { kind: 'not_found' };
  }

  // 网络/超时/服务异常：兜底查本地 mock
  const local = words.find(item => item.word.toLowerCase() === trimmed.toLowerCase());
  if (local) return { kind: 'ok', word: local };
  return remote;
}

export function formatRelativeReviewTime(iso: string) {
  const target = new Date(iso);
  const now = new Date();
  const diffDays = Math.ceil((startOfDay(target).getTime() - startOfDay(now).getTime()) / (24 * 60 * 60 * 1000));

  if (diffDays <= 0) return '今天';
  if (diffDays === 1) return '明天';
  return `${diffDays}天后`;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
