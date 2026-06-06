import { UserWord, Word } from './types';

/** 复习节奏：完成五轮即标记为已掌握。 */
export const reviewIntervals = [2, 2, 3, 8, 15];

/** 不再内置示例词条；查词失败时不再有本地兜底。 */
export const words: Word[] = [];

/** 不再附带 Demo 用户词汇，首次启动单词本为空。 */
export const initialUserWords: UserWord[] = [];
