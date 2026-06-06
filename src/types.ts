export type UsageTag = 'written' | 'spoken';

export type WordMeaning = {
  meaning_en: string;
  meaning_cn: string;
  example_en: string;
  example_cn: string;
};

export type Word = {
  id: string;
  word: string;
  phonetic_uk: string;
  phonetic_us: string;
  usage_tags: UsageTag[];
  collocations: string[];
  meanings: WordMeaning[];
};

export type UserWord = {
  id: string;
  word_id: string;
  /** 本地快照：加入生词本时存下的完整词条详情，用于离线复习。 */
  word: Word;
  added_at: string;
  next_review_at: string;
  current_interval_index: number;
  review_remaining_count: number;
  mastered: boolean;
};

export type ReviewResult = 'known' | 'unknown';

export type ReviewLog = {
  id: string;
  user_word_id: string;
  reviewed_at: string;
  result: ReviewResult;
};

export type ScreenName =
  | 'home'
  | 'search'
  | 'detail'
  | 'book'
  | 'review'
  | 'reviewDetail'
  | 'complete'
  | 'my'
  | 'mastered'
  | 'intervals'
  | 'apiKey'
  | 'aiChat';

export type AppSettings = {
  autoPronounceOnReview: boolean;
};
