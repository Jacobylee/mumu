import AsyncStorage from '@react-native-async-storage/async-storage';

import { initialUserWords } from '../mockData';
import { AppSettings, ReviewLog, UserWord } from '../types';

const VERSION = 'v1';
const KEYS = {
  userWords: `mumu:${VERSION}:userWords`,
  reviewLogs: `mumu:${VERSION}:reviewLogs`,
  settings: `mumu:${VERSION}:settings`,
  auth: `mumu:${VERSION}:auth`,
  dailyStats: `mumu:${VERSION}:dailyStats`,
  qwenApiKey: `mumu:${VERSION}:qwenApiKey`,
  chatHistory: `mumu:${VERSION}:chatHistory`,
  cnTranslations: `mumu:${VERSION}:cnTranslations`,
  searchHistory: `mumu:${VERSION}:searchHistory`,
  searchWordCache: `mumu:${VERSION}:searchWordCache`
};

export type DailyStats = {
  date: string; // YYYY-MM-DD（本地时区）
  completed: number;
  known: number;
};

export type AuthState = {
  isLoggedIn: boolean;
};

export type ChatMessageRecord = { role: 'system' | 'user' | 'assistant'; content: string };
export type ChatHistoryMap = Record<string, ChatMessageRecord[]>; // key: word.toLowerCase()
export type CnTranslationItem = { meaning_cn: string; example_en: string; example_cn: string };
export type CnTranslationMap = Record<string, CnTranslationItem[]>; // key: word.toLowerCase()

export type PersistedState = {
  userWords: UserWord[];
  reviewLogs: ReviewLog[];
  settings: AppSettings;
  auth: AuthState;
  dailyStats: DailyStats;
  qwenApiKey: string;
  chatHistory: ChatHistoryMap;
  cnTranslations: CnTranslationMap;
};

const defaults: PersistedState = {
  userWords: initialUserWords,
  reviewLogs: [],
  settings: { autoPronounceOnReview: true },
  auth: { isLoggedIn: false },
  dailyStats: { date: todayKey(), completed: 0, known: 0 },
  qwenApiKey: '',
  chatHistory: {},
  cnTranslations: {}
};

export function todayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn(`[storage] read ${key} failed`, err);
    return fallback;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`[storage] write ${key} failed`, err);
  }
}

async function readString(key: string, fallback: string): Promise<string> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ?? fallback;
  } catch (err) {
    console.warn(`[storage] read ${key} failed`, err);
    return fallback;
  }
}

async function writeString(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch (err) {
    console.warn(`[storage] write ${key} failed`, err);
  }
}

/** 一次性加载所有持久化数据，并处理跨天重置 dailyStats。 */
export async function loadAll(): Promise<PersistedState> {
  const [userWords, reviewLogs, settings, auth, dailyStats, qwenApiKey, chatHistory, cnTranslations] =
    await Promise.all([
      readJson<UserWord[]>(KEYS.userWords, defaults.userWords),
      readJson<ReviewLog[]>(KEYS.reviewLogs, defaults.reviewLogs),
      readJson<AppSettings>(KEYS.settings, defaults.settings),
      readJson<AuthState>(KEYS.auth, defaults.auth),
      readJson<DailyStats>(KEYS.dailyStats, defaults.dailyStats),
      readString(KEYS.qwenApiKey, defaults.qwenApiKey),
      readJson<ChatHistoryMap>(KEYS.chatHistory, defaults.chatHistory),
      readJson<CnTranslationMap>(KEYS.cnTranslations, defaults.cnTranslations)
    ]);

  const today = todayKey();
  const normalizedStats: DailyStats =
    dailyStats?.date === today ? dailyStats : { date: today, completed: 0, known: 0 };

  // 旧版本的 UserWord 可能缺少内嵌的 word 详情，这里过滤掉以避免运行时崩溃。
  const safeUserWords = (Array.isArray(userWords) ? userWords : defaults.userWords).filter(
    (item): item is UserWord => Boolean(item && typeof item === 'object' && (item as UserWord).word)
  );

  return {
    userWords: safeUserWords,
    reviewLogs: Array.isArray(reviewLogs) ? reviewLogs : defaults.reviewLogs,
    settings: { ...defaults.settings, ...(settings ?? {}) },
    auth: { ...defaults.auth, ...(auth ?? {}) },
    dailyStats: normalizedStats,
    qwenApiKey: qwenApiKey ?? '',
    chatHistory: chatHistory && typeof chatHistory === 'object' ? chatHistory : defaults.chatHistory,
    cnTranslations:
      cnTranslations && typeof cnTranslations === 'object' ? cnTranslations : defaults.cnTranslations
  };
}

export const saveUserWords = (value: UserWord[]) => writeJson(KEYS.userWords, value);
export const saveReviewLogs = (value: ReviewLog[]) => writeJson(KEYS.reviewLogs, value);
export const saveSettings = (value: AppSettings) => writeJson(KEYS.settings, value);
export const saveAuth = (value: AuthState) => writeJson(KEYS.auth, value);
export const saveDailyStats = (value: DailyStats) => writeJson(KEYS.dailyStats, value);
export const saveQwenApiKey = (value: string) => writeString(KEYS.qwenApiKey, value);
export const saveChatHistory = (value: ChatHistoryMap) => writeJson(KEYS.chatHistory, value);
export const saveCnTranslations = (value: CnTranslationMap) => writeJson(KEYS.cnTranslations, value);
export const loadSearchHistory = () => readJson<string[]>(KEYS.searchHistory, []);
export const saveSearchHistory = (value: string[]) => writeJson(KEYS.searchHistory, value);
export const loadSearchWordCache = () => readJson<Record<string, unknown>>(KEYS.searchWordCache, {});
export const saveSearchWordCache = (value: Record<string, unknown>) => writeJson(KEYS.searchWordCache, value);

/** 仅供调试 / 退出登录时清空。 */
export async function clearAll(): Promise<void> {
  try {
    await AsyncStorage.multiRemove(Object.values(KEYS));
  } catch (err) {
    console.warn('[storage] clearAll failed', err);
  }
}
