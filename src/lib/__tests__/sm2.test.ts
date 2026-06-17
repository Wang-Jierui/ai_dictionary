import { describe, expect, it } from "vitest"
import { REVIEW_GRADES } from "@/lib/constants"
import { scheduleSm2Review, SM2_MIN_EASE_FACTOR } from "@/lib/sm2"

const fixedNow = new Date("2026-06-17T00:00:00.000Z")

describe("SM-2 scheduler", () => {
  it("schedules Again from a fresh state", () => {
    const result = scheduleSm2Review({
      grade: REVIEW_GRADES.again,
      serverNow: fixedNow,
    })

    expect(result).toEqual({
      reviewEaseFactor: 2.3,
      reviewIntervalDays: 1,
      reviewRepetitionCount: 0,
      reviewLapses: 1,
      reviewDueAt: "2026-06-18T00:00:00.000Z",
      reviewLastReviewedAt: fixedNow.toISOString(),
    })
  })

  it("schedules Hard from a fresh state", () => {
    const result = scheduleSm2Review({
      grade: REVIEW_GRADES.hard,
      serverNow: fixedNow,
    })

    expect(result).toEqual({
      reviewEaseFactor: 2.4,
      reviewIntervalDays: 1,
      reviewRepetitionCount: 1,
      reviewLapses: 0,
      reviewDueAt: "2026-06-18T00:00:00.000Z",
      reviewLastReviewedAt: fixedNow.toISOString(),
    })
  })

  it("schedules Good on the first review", () => {
    const result = scheduleSm2Review({
      current: { repetitionCount: 0, intervalDays: 0, easeFactor: 2.5, lapses: 0 },
      grade: REVIEW_GRADES.good,
      serverNow: fixedNow,
    })

    expect(result).toEqual({
      reviewEaseFactor: 2.5,
      reviewIntervalDays: 1,
      reviewRepetitionCount: 1,
      reviewLapses: 0,
      reviewDueAt: "2026-06-18T00:00:00.000Z",
      reviewLastReviewedAt: fixedNow.toISOString(),
    })
  })

  it("schedules Good on the second review", () => {
    const result = scheduleSm2Review({
      current: { repetitionCount: 1, intervalDays: 1, easeFactor: 2.5, lapses: 0 },
      grade: REVIEW_GRADES.good,
      serverNow: fixedNow,
    })

    expect(result).toEqual({
      reviewEaseFactor: 2.5,
      reviewIntervalDays: 6,
      reviewRepetitionCount: 2,
      reviewLapses: 0,
      reviewDueAt: "2026-06-23T00:00:00.000Z",
      reviewLastReviewedAt: fixedNow.toISOString(),
    })
  })

  it("schedules Good on a mature review", () => {
    const result = scheduleSm2Review({
      current: { repetitionCount: 2, intervalDays: 6, easeFactor: 2.5, lapses: 0 },
      grade: REVIEW_GRADES.good,
      serverNow: fixedNow,
    })

    expect(result).toEqual({
      reviewEaseFactor: 2.5,
      reviewIntervalDays: 15,
      reviewRepetitionCount: 3,
      reviewLapses: 0,
      reviewDueAt: "2026-07-02T00:00:00.000Z",
      reviewLastReviewedAt: fixedNow.toISOString(),
    })
  })

  it("schedules Easy on the first review", () => {
    const result = scheduleSm2Review({
      current: { repetitionCount: 0, intervalDays: 0, easeFactor: 2.5, lapses: 0 },
      grade: REVIEW_GRADES.easy,
      serverNow: fixedNow,
    })

    expect(result).toEqual({
      reviewEaseFactor: 2.6,
      reviewIntervalDays: 4,
      reviewRepetitionCount: 1,
      reviewLapses: 0,
      reviewDueAt: "2026-06-21T00:00:00.000Z",
      reviewLastReviewedAt: fixedNow.toISOString(),
    })
  })

  it("schedules Easy on the second review", () => {
    const result = scheduleSm2Review({
      current: { repetitionCount: 1, intervalDays: 1, easeFactor: 2.5, lapses: 0 },
      grade: REVIEW_GRADES.easy,
      serverNow: fixedNow,
    })

    expect(result).toEqual({
      reviewEaseFactor: 2.6,
      reviewIntervalDays: 8,
      reviewRepetitionCount: 2,
      reviewLapses: 0,
      reviewDueAt: "2026-06-25T00:00:00.000Z",
      reviewLastReviewedAt: fixedNow.toISOString(),
    })
  })

  it("schedules Easy on a mature review", () => {
    const result = scheduleSm2Review({
      current: { repetitionCount: 3, intervalDays: 6, easeFactor: 2.5, lapses: 0 },
      grade: REVIEW_GRADES.easy,
      serverNow: fixedNow,
    })

    expect(result).toEqual({
      reviewEaseFactor: 2.6,
      reviewIntervalDays: 20,
      reviewRepetitionCount: 4,
      reviewLapses: 0,
      reviewDueAt: "2026-07-07T00:00:00.000Z",
      reviewLastReviewedAt: fixedNow.toISOString(),
    })
  })

  it("never drops below the minimum ease factor", () => {
    const result = scheduleSm2Review({
      current: { repetitionCount: 5, intervalDays: 30, easeFactor: 1.3, lapses: 2 },
      grade: REVIEW_GRADES.again,
      serverNow: fixedNow,
    })

    expect(result.reviewEaseFactor).toBe(SM2_MIN_EASE_FACTOR)
    expect(result.reviewLapses).toBe(3)
  })

  it("accepts an ISO string server time deterministically", () => {
    const result = scheduleSm2Review({
      current: {
        repetitionCount: 1,
        intervalDays: 1,
        easeFactor: 2.5,
        lapses: 0,
        dueAt: "2026-06-17T00:00:00.000Z",
        lastReviewedAt: null,
      },
      grade: REVIEW_GRADES.good,
      serverNow: "2026-06-17T00:00:00.000Z",
    })

    expect(result.reviewDueAt).toBe("2026-06-23T00:00:00.000Z")
    expect(result.reviewLastReviewedAt).toBe("2026-06-17T00:00:00.000Z")
  })
})
