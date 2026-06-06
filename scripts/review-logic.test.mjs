const dayMs = 24 * 60 * 60 * 1000;

function addDays(date, days) {
  return new Date(date.getTime() + days * dayMs);
}

function completeReview(userWord, result, intervals, reviewedAt) {
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

const intervals = [2, 2, 3, 8, 15];
const reviewedAt = new Date('2026-05-27T12:00:00.000Z');
const base = {
  id: 'uw-test',
  word_id: 'word-test',
  added_at: reviewedAt.toISOString(),
  next_review_at: reviewedAt.toISOString(),
  current_interval_index: 0,
  review_remaining_count: 5,
  mastered: false
};

const known = completeReview(base, 'known', intervals, reviewedAt);
assert(known.current_interval_index === 1, 'known advances interval index');
assert(known.review_remaining_count === 4, 'known decreases remaining count');
assert(known.next_review_at === addDays(reviewedAt, 2).toISOString(), 'known schedules from review time');

const unknown = completeReview({ ...base, current_interval_index: 3, review_remaining_count: 2 }, 'unknown', intervals, reviewedAt);
assert(unknown.current_interval_index === 0, 'unknown resets interval index');
assert(unknown.review_remaining_count === 2, 'unknown keeps remaining count');
assert(unknown.next_review_at === addDays(reviewedAt, 2).toISOString(), 'unknown restarts first interval');

const mastered = completeReview({ ...base, current_interval_index: 4, review_remaining_count: 1 }, 'known', intervals, reviewedAt);
assert(mastered.mastered === true, 'last known marks mastered');
assert(mastered.review_remaining_count === 0, 'mastered has no remaining reviews');

console.log('review logic ok');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
