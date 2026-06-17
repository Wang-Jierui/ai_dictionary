import { describe, expect, it, vi, beforeEach } from "vitest"
import { POST } from "./route"
import { prisma } from "@/lib/prisma"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    vocabulary: {
      upsert: vi.fn(),
    },
  },
}))

describe("POST /api/vocabulary/save", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("initializes review defaults when creating a new vocabulary row", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false })
    vi.setSystemTime(new Date("2026-06-17T12:00:00.000Z"))
    vi.mocked(prisma.vocabulary.upsert).mockResolvedValue({ id: "v-1" } as never)

    const response = await POST(
      new Request("http://localhost/api/vocabulary/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word: "apple",
          phonetic: "ˈæp.əl",
          briefDefinition: "a round fruit",
          chineseDefinition: "苹果",
        }),
      }),
    )

    const data = await response.json()
    expect(response.status).toBe(200)
    expect(data).toMatchObject({ id: "v-1" })

    const args = vi.mocked(prisma.vocabulary.upsert).mock.calls[0][0]
    expect(args.create).toMatchObject({
      word: "apple",
      reviewDueAt: new Date("2026-06-17T12:00:00.000Z"),
      reviewLastReviewedAt: null,
      reviewRepetitionCount: 0,
      reviewIntervalDays: 0,
      reviewEaseFactor: 2.5,
      reviewLapses: 0,
    })
    expect(args.update).not.toHaveProperty("reviewDueAt")

    vi.useRealTimers()
  })

  it("does not overwrite review fields when updating an existing row", async () => {
    vi.mocked(prisma.vocabulary.upsert).mockResolvedValue({ id: "v-1" } as never)

    const response = await POST(
      new Request("http://localhost/api/vocabulary/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word: "apple",
          notes: "updated note",
          briefDefinition: "a round fruit",
        }),
      }),
    )

    expect(response.status).toBe(200)

    const args = vi.mocked(prisma.vocabulary.upsert).mock.calls[0][0]
    expect(args.update).toMatchObject({ notes: "updated note" })
    expect(args.update).not.toHaveProperty("reviewDueAt")
    expect(args.update).not.toHaveProperty("reviewRepetitionCount")
    expect(args.update).not.toHaveProperty("reviewEaseFactor")
  })

  it("returns 400 when word is missing", async () => {
    const response = await POST(
      new Request("http://localhost/api/vocabulary/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ briefDefinition: "a round fruit" }),
      }),
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: "Missing word" })
  })
})
