import { describe, expect, it, vi, beforeEach } from "vitest"
import { GET } from "./route"
import { prisma } from "@/lib/prisma"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    vocabulary: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}))

const mockVocab = [
  {
    id: "1",
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
  },
  {
    id: "2",
    word: "banana",
    phonetic: "bəˈnæn.ə",
    briefDefinition: "a long yellow fruit",
    chineseDefinition: "香蕉",
    notes: null,
    reviewEnabled: true,
    reviewEaseFactor: 2.5,
    reviewIntervalDays: 21,
    reviewRepetitionCount: 5,
    reviewLapses: 0,
    reviewDueAt: new Date("2026-06-15T00:00:00.000Z"),
    reviewLastReviewedAt: new Date("2026-06-14T00:00:00.000Z"),
    createdAt: new Date("2026-06-11T00:00:00.000Z"),
  },
  {
    id: "3",
    word: "cherry",
    phonetic: "ˈtʃer.i",
    briefDefinition: "a small red fruit",
    chineseDefinition: "樱桃",
    notes: null,
    reviewEnabled: true,
    reviewEaseFactor: 2.5,
    reviewIntervalDays: 10,
    reviewRepetitionCount: 2,
    reviewLapses: 1,
    reviewDueAt: null,
    reviewLastReviewedAt: new Date("2026-06-13T00:00:00.000Z"),
    createdAt: new Date("2026-06-12T00:00:00.000Z"),
  },
]

describe("GET /api/vocabulary list", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns compact rows with review fields and ISO date strings", async () => {
    vi.mocked(prisma.vocabulary.findMany).mockResolvedValue([mockVocab[0] as never])

    const response = await GET(new Request("http://localhost/api/vocabulary"))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toHaveLength(1)
    expect(data[0]).toEqual({
      id: "1",
      word: "apple",
      phonetic: "ˈæp.əl",
      briefDefinition: "a round fruit",
      chineseDefinition: "苹果",
      notes: null,
      reviewEnabled: true,
      review: {
        easeFactor: 2.5,
        intervalDays: 0,
        repetitionCount: 0,
        lapses: 0,
        dueAt: null,
        lastReviewedAt: null,
      },
      createdAt: "2026-06-10T00:00:00.000Z",
    })
  })

  it("sorts alphabetically ascending", async () => {
    vi.mocked(prisma.vocabulary.findMany).mockResolvedValue([...mockVocab] as never)

    const response = await GET(new Request("http://localhost/api/vocabulary?sort=alpha&order=asc"))
    const data = await response.json()

    expect(data.map((item: { word: string }) => item.word)).toEqual(["apple", "banana", "cherry"])
  })

  it("sorts by due date ascending with nulls last", async () => {
    vi.mocked(prisma.vocabulary.findMany).mockResolvedValue([...mockVocab] as never)

    const response = await GET(new Request("http://localhost/api/vocabulary?sort=due&order=asc"))
    const data = await response.json()

    expect(data.map((item: { word: string }) => item.word)).toEqual(["banana", "apple", "cherry"])
  })

  it("filters new items", async () => {
    vi.mocked(prisma.vocabulary.findMany).mockResolvedValue([mockVocab[0] as never])

    const response = await GET(new Request("http://localhost/api/vocabulary?filter=new"))
    const data = await response.json()

    expect(data.map((item: { word: string }) => item.word)).toEqual(["apple"])
    expect(prisma.vocabulary.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({ reviewEnabled: true }),
            expect.objectContaining({ reviewRepetitionCount: 0, reviewLastReviewedAt: null }),
          ]),
        }),
      }),
    )
  })

  it("filters mastered items", async () => {
    vi.mocked(prisma.vocabulary.findMany).mockResolvedValue([mockVocab[1] as never])

    const response = await GET(new Request("http://localhost/api/vocabulary?filter=mastered"))
    const data = await response.json()

    expect(data.map((item: { word: string }) => item.word)).toEqual(["banana"])
    expect(prisma.vocabulary.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({ reviewEnabled: true }),
            expect.objectContaining({
              reviewRepetitionCount: { gte: 5 },
              reviewIntervalDays: { gte: 21 },
            }),
          ]),
        }),
      }),
    )
  })

  it("filters learning items", async () => {
    vi.mocked(prisma.vocabulary.findMany).mockResolvedValue([mockVocab[2] as never])

    const response = await GET(new Request("http://localhost/api/vocabulary?filter=learning"))
    const data = await response.json()

    expect(data.map((item: { word: string }) => item.word)).toEqual(["cherry"])
  })

  it("filters review-disabled library items", async () => {
    vi.mocked(prisma.vocabulary.findMany).mockResolvedValue([{ ...mockVocab[0], reviewEnabled: false } as never])

    const response = await GET(new Request("http://localhost/api/vocabulary?review=disabled"))
    const data = await response.json()

    expect(data.map((item: { word: string }) => item.word)).toEqual(["apple"])
    expect(prisma.vocabulary.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({ reviewEnabled: false }),
          ]),
        }),
      }),
    )
  })

  it("filters due items", async () => {
    vi.mocked(prisma.vocabulary.findMany).mockResolvedValue([mockVocab[0], mockVocab[2], mockVocab[1]] as never)

    const response = await GET(new Request("http://localhost/api/vocabulary?filter=due"))
    const data = await response.json()

    expect(data.map((item: { word: string }) => item.word)).toEqual(["cherry", "banana", "apple"])
  })

  it("searches across text fields", async () => {
    vi.mocked(prisma.vocabulary.findMany).mockResolvedValue([mockVocab[1] as never])

    const response = await GET(new Request("http://localhost/api/vocabulary?search=yellow"))
    const data = await response.json()

    expect(data.map((item: { word: string }) => item.word)).toEqual(["banana"])
    expect(prisma.vocabulary.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([
                expect.objectContaining({ word: { contains: "yellow", mode: "insensitive" } }),
              ]),
            }),
          ]),
        }),
      }),
    )
  })

  it("returns stable random order for the same seed", async () => {
    vi.mocked(prisma.vocabulary.findMany).mockResolvedValue([...mockVocab] as never)

    const seed = "test-seed-1"
    const response1 = await GET(new Request(`http://localhost/api/vocabulary?sort=random&randomSeed=${seed}`))
    const response2 = await GET(new Request(`http://localhost/api/vocabulary?sort=random&randomSeed=${seed}`))
    const data1 = await response1.json()
    const data2 = await response2.json()

    expect(data1.map((item: { word: string }) => item.word)).toEqual(data2.map((item: { word: string }) => item.word))
  })

  it("returns different random order for different seeds", async () => {
    vi.mocked(prisma.vocabulary.findMany).mockResolvedValue([...mockVocab] as never)

    const response1 = await GET(new Request("http://localhost/api/vocabulary?sort=random&randomSeed=seed-a"))
    const response2 = await GET(new Request("http://localhost/api/vocabulary?sort=random&randomSeed=seed-b"))
    const data1 = await response1.json()
    const data2 = await response2.json()

    expect(data1.map((item: { word: string }) => item.word)).not.toEqual(data2.map((item: { word: string }) => item.word))
  })

  it("returns 400 for invalid sort", async () => {
    const response = await GET(new Request("http://localhost/api/vocabulary?sort=invalid"))
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toContain("Invalid sort")
  })

  it("returns 400 for invalid order", async () => {
    const response = await GET(new Request("http://localhost/api/vocabulary?order=invalid"))
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toContain("Invalid order")
  })

  it("returns 400 for invalid filter", async () => {
    const response = await GET(new Request("http://localhost/api/vocabulary?filter=invalid"))
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toContain("Invalid filter")
  })

  it("returns 400 for invalid review filter", async () => {
    const response = await GET(new Request("http://localhost/api/vocabulary?review=invalid"))
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toContain("Invalid review")
  })
})
