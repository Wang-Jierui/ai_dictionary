import { describe, expect, it, vi, beforeEach } from "vitest"
import { prisma } from "@/lib/prisma"
import { findCachedLookup, saveVocabularyLookup } from "@/lib/lookup-service"
import { lookupWord } from "@/lib/dictionary-api"
import type { AIWordData, DictionaryEntry } from "@/types/dictionary"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    vocabulary: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock("@/lib/dictionary-api", () => ({ lookupWord: vi.fn() }))

const cachedAi: AIWordData = {
  chineseDefinition: "苹果", personalizedExamples: [], nuanceAnalysis: "cached explanation",
  etymologyStory: "", mnemonicHook: "",
}
const legacyDictionary: DictionaryEntry = {
  word: "apple", phonetics: [], meanings: [{
    partOfSpeech: "noun", definitions: [{ definition: "old definition", synonyms: [], antonyms: [] }],
    synonyms: [], antonyms: [],
  }],
}
const wiktionaryDictionary: DictionaryEntry = {
  ...legacyDictionary,
  pronunciationCheckedAt: "2026-10-11T00:00:00.000Z",
  meanings: [{ ...legacyDictionary.meanings[0], definitions: [{ definition: "new definition", synonyms: [], antonyms: [] }] }],
  source: {
    name: "Wiktionary", url: "https://en.wiktionary.org/wiki/apple#English",
    license: { name: "CC BY-SA 4.0", url: "https://creativecommons.org/licenses/by-sa/4.0/" },
  },
}

describe("findCachedLookup dictionary source migration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(lookupWord).mockResolvedValue(wiktionaryDictionary)
    vi.mocked(prisma.vocabulary.update).mockResolvedValue({} as never)
  })

  it.each([legacyDictionary, null])("refreshes legacy or missing definitions and preserves cached learning data (%j)", async dictData => {
    vi.mocked(prisma.vocabulary.findUnique).mockResolvedValue({
      aiData: cachedAi, dictData, imageData: "saved-image", imageMode: "mood", notes: "saved-notes",
    } as never)

    expect(await findCachedLookup("apple")).toEqual({
      cached: true, aiData: cachedAi, dictData: wiktionaryDictionary,
      imageData: "saved-image", imageMode: "mood", notes: "saved-notes",
    })
    expect(prisma.vocabulary.update).toHaveBeenCalledWith({
      where: { word: "apple" },
      data: { dictData: wiktionaryDictionary, briefDefinition: "new definition", phonetic: undefined },
    })
    expect(prisma.vocabulary.upsert).not.toHaveBeenCalled()
  })

  it("uses current Wiktionary cache without another upstream request", async () => {
    vi.mocked(prisma.vocabulary.findUnique).mockResolvedValue({ aiData: cachedAi, dictData: wiktionaryDictionary } as never)
    expect(await findCachedLookup("apple")).toMatchObject({ dictData: wiktionaryDictionary })
    expect(lookupWord).not.toHaveBeenCalled()
    expect(prisma.vocabulary.update).not.toHaveBeenCalled()
  })

  it("backfills pronunciation in an older Wiktionary cache while reusing the AI data", async () => {
    const oldDictionary = { ...wiktionaryDictionary, pronunciationCheckedAt: undefined }
    const withPronunciation = {
      ...wiktionaryDictionary, phonetic: "/ˈæpəl/",
      phonetics: [{ text: "/ˈæpəl/" }, { audio: "https://upload.wikimedia.org/apple.mp3", label: "US" }],
    }
    vi.mocked(prisma.vocabulary.findUnique).mockResolvedValue({ aiData: cachedAi, dictData: oldDictionary } as never)
    vi.mocked(lookupWord).mockResolvedValue(withPronunciation)

    expect(await findCachedLookup("apple")).toMatchObject({ aiData: cachedAi, dictData: withPronunciation })
    expect(prisma.vocabulary.update).toHaveBeenCalledWith({
      where: { word: "apple" },
      data: { dictData: withPronunciation, briefDefinition: "new definition", phonetic: "/ˈæpəl/" },
    })
  })

  it("keeps existing Wiktionary pronunciation when checking the page fails", async () => {
    const oldDictionary = { ...wiktionaryDictionary, pronunciationCheckedAt: undefined, phonetic: "/ˈæpəl/" }
    vi.mocked(prisma.vocabulary.findUnique).mockResolvedValue({ aiData: cachedAi, dictData: oldDictionary } as never)
    vi.mocked(lookupWord).mockResolvedValue({ ...wiktionaryDictionary, pronunciationCheckedAt: undefined })

    expect(await findCachedLookup("apple")).toMatchObject({ aiData: cachedAi, dictData: oldDictionary })
    expect(prisma.vocabulary.update).not.toHaveBeenCalled()
  })

  it("keeps legacy definitions available when Wiktionary fails", async () => {
    vi.mocked(lookupWord).mockResolvedValue(null)
    vi.mocked(prisma.vocabulary.findUnique).mockResolvedValue({ aiData: cachedAi, dictData: legacyDictionary } as never)
    expect(await findCachedLookup("apple")).toMatchObject({ aiData: cachedAi, dictData: legacyDictionary })
    expect(prisma.vocabulary.update).not.toHaveBeenCalled()
  })

  it("still returns cached AI and fresh definitions if saving the refreshed dictionary fails", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.mocked(prisma.vocabulary.update).mockRejectedValueOnce(new Error("database unavailable"))
    vi.mocked(prisma.vocabulary.findUnique).mockResolvedValue({ aiData: cachedAi, dictData: legacyDictionary } as never)

    expect(await findCachedLookup("apple")).toMatchObject({ aiData: cachedAi, dictData: wiktionaryDictionary })
    expect(warning).toHaveBeenCalled()
    warning.mockRestore()
  })
})

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
