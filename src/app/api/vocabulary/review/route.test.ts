import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { POST } from "./route"
import { prisma } from "@/lib/prisma"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    vocabulary: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

const mockEntry = {
  id: "vocab-1",
  word: "apple",
  phonetic: "ˈæp.əl",
  briefDefinition: "a round fruit",
  chineseDefinition: "苹果",
  notes: null,
  reviewEnabled: true,
  reviewEaseFactor: 2.5,
  reviewIntervalDays: 0,
  reviewRepetitionCount: 0,
  reviewLapses: 0,
  reviewDueAt: null,
  reviewLastReviewedAt: null,
  createdAt: new Date("2026-06-10T00:00:00.000Z"),
}

describe("POST /api/vocabulary/review", () => {
  const mockNow = new Date("2026-06-17T12:00:00.000Z")

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false })
    vi.setSystemTime(mockNow)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("updates review state for a Good grade and returns compact row", async () => {
    vi.mocked(prisma.vocabulary.findUnique).mockResolvedValue(mockEntry as never)
    vi.mocked(prisma.vocabulary.update).mockResolvedValue({
      ...mockEntry,
      reviewIntervalDays: 1,
      reviewRepetitionCount: 1,
      reviewLastReviewedAt: mockNow,
      reviewDueAt: new Date("2026-06-18T12:00:00.000Z"),
    } as never)

    const response = await POST(
      new Request("http://localhost/api/vocabulary/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "vocab-1", grade: 4 }),
      }),
    )
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toMatchObject({
      id: "vocab-1",
      word: "apple",
      phonetic: "ˈæp.əl",
      briefDefinition: "a round fruit",
      chineseDefinition: "苹果",
      notes: null,
      reviewEnabled: true,
      review: {
        easeFactor: 2.5,
        intervalDays: 1,
        repetitionCount: 1,
        lapses: 0,
        dueAt: "2026-06-18T12:00:00.000Z",
        lastReviewedAt: "2026-06-17T12:00:00.000Z",
      },
      createdAt: "2026-06-10T00:00:00.000Z",
    })
    expect(prisma.vocabulary.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "vocab-1" },
        data: expect.objectContaining({
          reviewEaseFactor: 2.5,
          reviewIntervalDays: 1,
          reviewRepetitionCount: 1,
          reviewLapses: 0,
        }),
      }),
    )
  })

  it("updates review state for an Again grade", async () => {
    vi.mocked(prisma.vocabulary.findUnique).mockResolvedValue(mockEntry as never)
    vi.mocked(prisma.vocabulary.update).mockResolvedValue({
      ...mockEntry,
      reviewEaseFactor: 2.3,
      reviewIntervalDays: 1,
      reviewRepetitionCount: 0,
      reviewLapses: 1,
      reviewLastReviewedAt: mockNow,
      reviewDueAt: new Date("2026-06-18T12:00:00.000Z"),
    } as never)

    const response = await POST(
      new Request("http://localhost/api/vocabulary/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "vocab-1", grade: 0 }),
      }),
    )
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.review).toMatchObject({
      easeFactor: 2.3,
      intervalDays: 1,
      repetitionCount: 0,
      lapses: 1,
    })
  })

  it("returns 400 for an invalid grade", async () => {
    const response = await POST(
      new Request("http://localhost/api/vocabulary/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "vocab-1", grade: 2 }),
      }),
    )
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toContain("Invalid grade")
  })

  it("returns 404 for a missing vocabulary id", async () => {
    vi.mocked(prisma.vocabulary.findUnique).mockResolvedValue(null)

    const response = await POST(
      new Request("http://localhost/api/vocabulary/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "missing-id", grade: 4 }),
      }),
    )
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error).toContain("not found")
  })

  it("rejects entries that are not enabled for review", async () => {
    vi.mocked(prisma.vocabulary.findUnique).mockResolvedValue({ ...mockEntry, reviewEnabled: false } as never)

    const response = await POST(
      new Request("http://localhost/api/vocabulary/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "vocab-1", grade: 4 }),
      }),
    )
    const data = await response.json()

    expect(response.status).toBe(409)
    expect(data.error).toContain("not enabled")
    expect(prisma.vocabulary.update).not.toHaveBeenCalled()
  })

  it("returns 400 for malformed JSON body", async () => {
    const response = await POST(
      new Request("http://localhost/api/vocabulary/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      }),
    )
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toContain("Malformed JSON")
  })

  it("ignores client-provided review fields", async () => {
    vi.mocked(prisma.vocabulary.findUnique).mockResolvedValue(mockEntry as never)
    vi.mocked(prisma.vocabulary.update).mockResolvedValue({
      ...mockEntry,
      reviewIntervalDays: 1,
      reviewRepetitionCount: 1,
      reviewLastReviewedAt: mockNow,
      reviewDueAt: new Date("2026-06-18T12:00:00.000Z"),
    } as never)

    await POST(
      new Request("http://localhost/api/vocabulary/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "vocab-1",
          grade: 4,
          reviewEaseFactor: 99,
          reviewIntervalDays: 99,
          reviewRepetitionCount: 99,
          reviewLapses: 99,
          reviewDueAt: "2099-01-01T00:00:00.000Z",
          reviewLastReviewedAt: "2099-01-01T00:00:00.000Z",
        }),
      }),
    )

    expect(prisma.vocabulary.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          reviewEaseFactor: 99,
          reviewIntervalDays: 99,
          reviewRepetitionCount: 99,
          reviewLapses: 99,
        }),
      }),
    )
  })
})
