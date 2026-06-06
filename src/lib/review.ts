import { ReviewResult, UserWord, Word } from '../types';

const dayMs = 24 * 60 * 60 * 1000;

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * dayMs);
}

export function completeReview(
  userWord: UserWord,
  result: ReviewResult,
  intervals: number[],
  reviewedAt = new Date()
): UserWord {
  if (result === 'unknown') {
    return {
      ...userWord,
      current_interval_index: 0,
      next_review_at: addDays(reviewedAt, intervals[0] ?? 1).toISOString(),
      mastered: false
    };
  }

  const nextIndex = userWord.current_interval_index + 1;
  const nextRemaining = Math.max(0, userWord.review_remaining_count - 1);

  if (nextRemaining === 0 || nextIndex >= intervals.length) {
    return {
      ...userWord,
      current_interval_index: nextIndex,
      review_remaining_count: 0,
      mastered: true,
      next_review_at: reviewedAt.toISOString()
    };
  }

  return {
    ...userWord,
    current_interval_index: nextIndex,
    review_remaining_count: nextRemaining,
    mastered: false,
    next_review_at: addDays(reviewedAt, intervals[nextIndex]).toISOString()
  };
}

export function createUserWord(id: string, word: Word, intervals: number[], now = new Date()): UserWord {
  return {
    id,
    word_id: word.id,
    word,
    added_at: now.toISOString(),
    next_review_at: addDays(now, intervals[0] ?? 1).toISOString(),
    current_interval_index: 0,
    review_remaining_count: intervals.length,
    mastered: false
  };
}

export function isDue(userWord: UserWord, now = new Date()) {
  return !userWord.mastered && new Date(userWord.next_review_at).getTime() <= now.getTime();
}
