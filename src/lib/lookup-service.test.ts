import { describe, expect, it, vi, beforeEach } from "vitest"
import { prisma } from "@/lib/prisma"
import { saveVocabularyLookup } from "@/lib/lookup-service"
import type { AIWordData, DictionaryEntry } from "@/types/dictionary"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    vocabulary: {
      upsert: vi.fn(),
    },
  },
}))

describe("saveVocabularyLookup", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("creates lookup rows as library-only with SM-2 defaults preserved", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false })
    vi.setSystemTime(new Date("2026-06-17T12:00:00.000Z"))
    vi.mocked(prisma.vocabulary.upsert).mockResolvedValue({} as never)

    const aiData: AIWordData = {
      chineseDefinition: "苹果",
      nuanceAnalysis: "",
      etymologyStory: "",
      mnemonicHook: "",
      personalizedExamples: [],
    }

    await saveVocabularyLookup("apple", null, aiData)

    const args = vi.mocked(prisma.vocabulary.upsert).mock.calls[0][0]
    expect(args.create).toMatchObject({
      word: "apple",
      reviewEnabled: false,
      reviewDueAt: null,
      reviewLastReviewedAt: null,
      reviewRepetitionCount: 0,
      reviewIntervalDays: 0,
      reviewEaseFactor: 2.5,
      reviewLapses: 0,
    })
    expect(args.update).not.toHaveProperty("reviewDueAt")
    expect(args.update).not.toHaveProperty("reviewEnabled")
    expect(args.update).not.toHaveProperty("reviewRepetitionCount")
    expect(args.update).not.toHaveProperty("reviewEaseFactor")

    vi.useRealTimers()
  })

  it("does not touch review fields on update", async () => {
    vi.mocked(prisma.vocabulary.upsert).mockResolvedValue({} as never)

    const dictData: DictionaryEntry = {
      word: "apple",
      phonetic: "ˈæp.əl",
      phonetics: [],
      meanings: [{ partOfSpeech: "noun", definitions: [{ definition: "a round fruit", synonyms: [], antonyms: [] }], synonyms: [], antonyms: [] }],
    }
    const aiData: AIWordData = {
      chineseDefinition: "苹果",
      nuanceAnalysis: "",
      etymologyStory: "",
      mnemonicHook: "",
      personalizedExamples: [],
    }

    await saveVocabularyLookup("apple", dictData, aiData)

    const args = vi.mocked(prisma.vocabulary.upsert).mock.calls[0][0]
    expect(args.update).toEqual({
      phonetic: "ˈæp.əl",
      briefDefinition: "a round fruit",
      chineseDefinition: "苹果",
      dictData: expect.anything(),
      aiData: expect.anything(),
    })
    expect(args.update).not.toHaveProperty("reviewDueAt")
  })
})
