import { describe, expect, it, vi, beforeEach } from "vitest"
import { POST } from "./route"

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
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    },
    searchHistory: {
      create: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({}),
    },
    settings: {
      findFirst: vi.fn().mockResolvedValue({ batchMaxWords: 50, batchConcurrency: 3 }),
    },
  },
}))

import { generateText } from "ai"

describe("POST /api/ai/batch-lookup", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns per-item status error with PARSE_ERROR code when a word fails strict parsing", async () => {
    let callIndex = 0
    vi.mocked(generateText).mockImplementation(async () => {
      callIndex += 1
      return { text: callIndex === 1 ? validAiJson : malformedAiText } as never
    })

    const response = await POST(new Request("http://localhost/api/ai/batch-lookup", {
      method: "POST",
      body: JSON.stringify({ words: ["apple", "banana"] }),
    }))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.results).toHaveLength(2)

    const appleResult = data.results.find((item: { word: string }) => item.word === "apple")
    const bananaResult = data.results.find((item: { word: string }) => item.word === "banana")

    expect(appleResult.status).toBe("success")
    expect(appleResult.aiData).toBeDefined()

    expect(bananaResult.status).toBe("error")
    expect(bananaResult.code).toBe("PARSE_ERROR")
    expect(bananaResult.aiData).toBeNull()
  })

  it("returns empty error for empty normalized words", async () => {
    const response = await POST(new Request("http://localhost/api/ai/batch-lookup", {
      method: "POST",
      body: JSON.stringify({ words: ["   ", "apple"] }),
    }))
    const data = await response.json()

    expect(response.status).toBe(200)
    const emptyResult = data.results.find((item: { word: string }) => item.word === "")
    expect(emptyResult.status).toBe("error")
  })

  it("returns 400 for invalid body", async () => {
    const response = await POST(new Request("http://localhost/api/ai/batch-lookup", {
      method: "POST",
      body: JSON.stringify({}),
    }))

    expect(response.status).toBe(400)
  })
})
