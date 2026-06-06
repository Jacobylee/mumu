import { words } from '../mockData';
import { searchWordWithFreeDictionary } from './freeDictionary';
import type { SearchOutcome } from './qwen';

export type { SearchOutcome } from './qwen';

/**
 * 查词统一入口。默认走 dictionaryapi.dev（免费、无需 Key、毫秒级响应），
 * 网络/超时/服务异常时降级到本地 mock 词条以保证开发体验。
 * 大模型仅在「问一问 AI」对话页中按需触发，避免常规查词卡顿。
 */
export async function searchWord(query: string, _apiKey?: string): Promise<SearchOutcome> {
  const trimmed = query.trim();
  if (!trimmed) return { kind: 'failed', message: 'empty query' };

  const remote = await searchWordWithFreeDictionary(trimmed);
  if (remote.kind === 'ok' || remote.kind === 'not_found') return remote;

  // 网络/超时/服务异常：兜底查本地 mock，命中则按 ok 返回，否则把原始失败抛上去。
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
