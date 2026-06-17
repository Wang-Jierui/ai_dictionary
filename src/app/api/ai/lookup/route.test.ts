import { describe, expect, it, vi, beforeEach } from "vitest"
import { POST } from "./route"
import { prisma } from "@/lib/prisma"

const validAiJson = JSON.stringify({
  chineseDefinition: "苹果",
  personalizedExamples: ["I eat an apple every day."],
  nuanceAnalysis: "A common fruit.",
  etymologyStory: "From Old English æppel.",
  mnemonicHook: "Apple sounds like 'a pull'.",
})

const malformedAiText = "This is not valid JSON"

vi.mock("ai", () => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
}))

vi.mock("@/lib/ai", () => ({
  getModelForTask: vi.fn().mockResolvedValue("mock-model"),
  buildLookupPrompt: vi.fn().mockReturnValue("mock-prompt"),
}))

vi.mock("@/lib/dictionary-api", () => ({
  lookupWord: vi.fn().mockResolvedValue(null),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    vocabulary: {
      findUnique: vi.fn(),
      upsert: vi.fn().mockResolvedValue({}),
    },
    searchHistory: {
      create: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({}),
    },
    settings: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
}))

import { generateText } from "ai"

describe("POST /api/ai/lookup", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns validated JSON for fresh lookups", async () => {
    vi.mocked(generateText).mockResolvedValue({ text: validAiJson } as never)
    vi.mocked(prisma.vocabulary.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.vocabulary.upsert).mockResolvedValue({ imageData: null, imageMode: null, notes: null } as never)

    const response = await POST(new Request("http://localhost/api/ai/lookup", {
      method: "POST",
      body: JSON.stringify({ word: "apple" }),
    }))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.cached).toBe(false)
    expect(data.aiData.chineseDefinition).toBe("苹果")
    expect(data.imageData).toBeNull()
    expect(data.imageMode).toBeNull()
    expect(data.notes).toBeNull()
    expect(prisma.vocabulary.upsert).toHaveBeenCalled()
  })

  it("returns cached lookup as JSON without re-parsing", async () => {
    const cached = {
      aiData: {
        chineseDefinition: "_cached_",
        personalizedExamples: [],
        nuanceAnalysis: "",
        etymologyStory: "",
        mnemonicHook: "",
      },
      dictData: null,
      imageData: "cached-image",
      imageMode: "mood",
      notes: "cached note",
    }
    vi.mocked(prisma.vocabulary.findUnique).mockResolvedValue(cached as never)

    const response = await POST(new Request("http://localhost/api/ai/lookup", {
      method: "POST",
      body: JSON.stringify({ word: "apple" }),
    }))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.cached).toBe(true)
    expect(data.aiData.chineseDefinition).toBe("_cached_")
    expect(data.imageData).toBe("cached-image")
    expect(data.imageMode).toBe("mood")
    expect(data.notes).toBe("cached note")
    expect(generateText).not.toHaveBeenCalled()
  })

  it("returns JSON error and does not save when AI response cannot be parsed", async () => {
    vi.mocked(generateText).mockResolvedValue({ text: malformedAiText } as never)
    vi.mocked(prisma.vocabulary.findUnique).mockResolvedValue(null)

    const response = await POST(new Request("http://localhost/api/ai/lookup", {
      method: "POST",
      body: JSON.stringify({ word: "apple" }),
    }))
    const data = await response.json()

    expect(response.status).toBe(422)
    expect(data.code).toBe("PARSE_ERROR")
    expect(prisma.vocabulary.upsert).not.toHaveBeenCalled()
  })

  it("returns 400 for missing word", async () => {
    const response = await POST(new Request("http://localhost/api/ai/lookup", {
      method: "POST",
      body: JSON.stringify({}),
    }))

    expect(response.status).toBe(400)
  })
})
