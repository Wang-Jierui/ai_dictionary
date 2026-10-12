import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { POST as lookup } from "./route"
import { POST as batchLookup } from "../batch-lookup/route"
import { GET as dictionaryLookup } from "../../dictionary/route"
import { generateText } from "ai"
import { prisma } from "@/lib/prisma"
import { DICTIONARY_TIMEOUT_MS } from "@/lib/dictionary-api"

vi.mock("ai", () => ({ generateText: vi.fn(), streamText: vi.fn() }))
vi.mock("@/lib/ai", () => ({
  getModelForTask: vi.fn().mockResolvedValue("mock-model"),
  buildLookupPrompt: vi.fn().mockReturnValue("mock-prompt"),
}))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    vocabulary: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({ imageData: null, imageMode: null, notes: null }),
    },
    searchHistory: {
      create: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({}),
    },
    settings: { findFirst: vi.fn().mockResolvedValue(null) },
  },
}))

describe("dictionary outage across lookup routes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("shares the stalled request and returns saved AI results after the dictionary deadline", async () => {
    vi.mocked(generateText).mockResolvedValue({ text: JSON.stringify({
      chineseDefinition: "苹果", personalizedExamples: [], nuanceAnalysis: "",
      etymologyStory: "", mnemonicHook: "",
    }) } as never)
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true })
    }))
    vi.stubGlobal("fetch", fetchMock)
    const responses = Promise.all([
      lookup(new Request("http://localhost/api/ai/lookup", {
        method: "POST", body: JSON.stringify({ word: "apple" }),
      })),
      batchLookup(new Request("http://localhost/api/ai/batch-lookup", {
        method: "POST", body: JSON.stringify({ words: ["apple"] }),
      })),
      dictionaryLookup(new Request("http://localhost/api/dictionary?word=apple")),
    ])

    await vi.advanceTimersByTimeAsync(DICTIONARY_TIMEOUT_MS - 1)
    expect(generateText).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    const [singleResponse, batchResponse, dictionaryResponse] = await responses

    expect(singleResponse.status).toBe(200)
    expect(await singleResponse.json()).toMatchObject({ dictData: null, aiData: { chineseDefinition: "苹果" } })
    expect(batchResponse.status).toBe(200)
    expect(await batchResponse.json()).toMatchObject({
      results: [{ status: "success", dictData: null, aiData: { chineseDefinition: "苹果" } }],
    })
    expect(dictionaryResponse.status).toBe(504)
    expect(await dictionaryResponse.json()).toMatchObject({ code: "TIMEOUT" })
    expect(prisma.vocabulary.upsert).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })
})
