import { REVIEW_GRADES, type ReviewGradeValue } from "@/lib/constants"

export const SM2_DEFAULT_EASE_FACTOR = 2.5
export const SM2_MIN_EASE_FACTOR = 1.3
export const SM2_DEFAULT_REPETITION_COUNT = 0
export const SM2_DEFAULT_INTERVAL_DAYS = 0
export const SM2_DAY_MS = 24 * 60 * 60 * 1000

export interface Sm2ReviewSnapshot {
  easeFactor?: number
  intervalDays?: number
  repetitionCount?: number
  lapses?: number
  dueAt?: string | Date | null
  lastReviewedAt?: string | Date | null
}

export interface Sm2ScheduleReviewInput {
  current?: Sm2ReviewSnapshot | null
  grade: ReviewGradeValue
  serverNow: string | Date
}

export interface Sm2ScheduledReviewState {
  reviewEaseFactor: number
  reviewIntervalDays: number
  reviewRepetitionCount: number
  reviewLapses: number
  reviewDueAt: string
  reviewLastReviewedAt: string
}

/**
 * Compute the next SM-2 review state from the current review snapshot.
 *
 * Public signature:
 * `scheduleSm2Review({ current, grade, serverNow })`
 *
 * - `current` accepts JSON-safe review state or DB-shaped values.
 * - `serverNow` must come from the server; output dates are ISO strings.
 */
export function scheduleSm2Review({
  current,
  grade,
  serverNow,
}: Sm2ScheduleReviewInput): Sm2ScheduledReviewState {
  const now = normalizeServerNow(serverNow)
  const easeFactor = normalizeNumber(current?.easeFactor, SM2_DEFAULT_EASE_FACTOR)
  const intervalDays = normalizeNumber(current?.intervalDays, SM2_DEFAULT_INTERVAL_DAYS)
  const repetitionCount = normalizeInteger(current?.repetitionCount, SM2_DEFAULT_REPETITION_COUNT)
  const lapses = normalizeInteger(current?.lapses, 0)

  const firstReview = repetitionCount === 0
  const secondReview = repetitionCount === 1

  let nextEaseFactor = easeFactor
  let nextIntervalDays = intervalDays
  let nextRepetitionCount = repetitionCount
  let nextLapses = lapses

  switch (grade) {
    case REVIEW_GRADES.again: {
      nextEaseFactor = clampMin(easeFactor - 0.2, SM2_MIN_EASE_FACTOR)
      nextIntervalDays = 1
      nextRepetitionCount = 0
      nextLapses = lapses + 1
      break
    }
    case REVIEW_GRADES.hard: {
      nextEaseFactor = clampMin(easeFactor - 0.15, SM2_MIN_EASE_FACTOR)
      nextIntervalDays = firstReview ? 1 : Math.max(1, Math.round(intervalDays * 1.2))
      nextRepetitionCount = repetitionCount + 1
      break
    }
    case REVIEW_GRADES.good: {
      nextIntervalDays = firstReview ? 1 : secondReview ? 6 : Math.round(intervalDays * easeFactor)
      nextRepetitionCount = repetitionCount + 1
      break
    }
    case REVIEW_GRADES.easy: {
      nextEaseFactor = easeFactor + 0.1
      nextIntervalDays = firstReview
        ? 4
        : secondReview
          ? 8
          : Math.round(intervalDays * easeFactor * 1.3)
      nextRepetitionCount = repetitionCount + 1
      break
    }
    default: {
      const exhaustiveCheck: never = grade
      return exhaustiveCheck
    }
  }

  return {
    reviewEaseFactor: roundToOneDecimal(nextEaseFactor),
    reviewIntervalDays: nextIntervalDays,
    reviewRepetitionCount: nextRepetitionCount,
    reviewLapses: nextLapses,
    reviewDueAt: addDays(now, nextIntervalDays),
    reviewLastReviewedAt: now.toISOString(),
  }
}

function normalizeServerNow(serverNow: string | Date): Date {
  const date = serverNow instanceof Date ? new Date(serverNow.getTime()) : new Date(serverNow)
  if (Number.isNaN(date.getTime())) {
    throw new Error("scheduleSm2Review requires a valid serverNow date")
  }
  return date
}

function normalizeNumber(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function normalizeInteger(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : fallback
}

function clampMin(value: number, min: number): number {
  return value < min ? min : value
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10
}

function addDays(date: Date, days: number): string {
  return new Date(date.getTime() + days * SM2_DAY_MS).toISOString()
}
