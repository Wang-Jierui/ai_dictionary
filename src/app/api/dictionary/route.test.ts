import { beforeEach, describe, expect, it, vi } from "vitest"
import { GET } from "./route"
import { lookupDictionary } from "@/lib/dictionary-api"
import type { DictionaryLookupResult } from "@/lib/dictionary-api"

vi.mock("@/lib/dictionary-api", () => ({ lookupDictionary: vi.fn() }))

describe("GET /api/dictionary", () => {
  beforeEach(() => vi.clearAllMocks())

  it.each(["", "?word=", "?word=%20%20"])("rejects missing or blank words (%s)", async query => {
    const response = await GET(new Request(`http://localhost/api/dictionary${query}`))
    expect(response.status).toBe(400)
    expect(lookupDictionary).not.toHaveBeenCalled()
  })

  it("keeps the successful entry response compatible with the lookup page", async () => {
    const entry = { word: "apple", phonetics: [], meanings: [] }
    vi.mocked(lookupDictionary).mockResolvedValue({ ok: true, entry })

    const response = await GET(new Request("http://localhost/api/dictionary?word=apple"))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(entry)
  })

  it.each([
    { code: "NOT_FOUND", status: 404 },
    { code: "TIMEOUT", status: 504 },
    { code: "RATE_LIMITED", status: 503 },
    { code: "UPSTREAM_ERROR", status: 502 },
    { code: "INVALID_RESPONSE", status: 502 },
    { code: "NETWORK_ERROR", status: 502 },
  ] as const)("preserves $code instead of reporting every failure as a missing word", async ({ code, status }) => {
    const failure: DictionaryLookupResult = { ok: false, code, status, error: "Dictionary failure" }
    vi.mocked(lookupDictionary).mockResolvedValue(failure)

    const response = await GET(new Request("http://localhost/api/dictionary?word=apple"))
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ error: "Dictionary failure", code })
  })
})
