import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let lookupDictionary: typeof import("./dictionary-api").lookupDictionary
let lookupWord: typeof import("./dictionary-api").lookupWord
let parsePronunciation: typeof import("./dictionary-api").parseWiktionaryPronunciation
let timeoutMs: number
let pronunciationTimeoutMs: number
const fetchMock = vi.fn<typeof fetch>()

function englishPage(content = "") {
  return `<section><h2 id="English">English</h2><section><h3>Pronunciation</h3>${content}</section></section>`
}

function pronunciationResponse(content = "") {
  return new Response(englishPage(content), { headers: { "Content-Type": "text/html" } })
}

function dictionaryResponse(word = "apple") {
  return Response.json({ en: [{
    partOfSpeech: "Noun", language: "English",
    definitions: [{ definition: `<a href="/wiki/${word}">a round fruit</a>` }],
  }] })
}

beforeEach(async () => {
  vi.resetModules()
  vi.stubGlobal("aiWiktionaryState", undefined)
  vi.stubGlobal("fetch", fetchMock)
  vi.spyOn(console, "warn").mockImplementation(() => {})
  fetchMock.mockReset()
  fetchMock.mockImplementation(async () => pronunciationResponse())
  const api = await import("./dictionary-api")
  lookupDictionary = api.lookupDictionary
  lookupWord = api.lookupWord
  parsePronunciation = api.parseWiktionaryPronunciation
  timeoutMs = api.DICTIONARY_TIMEOUT_MS
  pronunciationTimeoutMs = api.PRONUNCIATION_TIMEOUT_MS
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("dictionary API requests", () => {
  it("normalizes and URL-encodes words and fills optional arrays used by the UI", async () => {
    fetchMock.mockResolvedValueOnce(dictionaryResponse("ice cream"))
    const result = await lookupDictionary(" Ice Cream ")

    expect(fetchMock).toHaveBeenCalledWith(
      "https://en.wiktionary.org/api/rest_v1/page/definition/ice%20cream",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        headers: expect.objectContaining({ Accept: "application/json", "User-Agent": expect.stringContaining("AI-Dictionary") }),
      }),
    )
    expect(result).toMatchObject({
      ok: true,
      entry: {
        word: "ice cream", phonetics: [],
        meanings: [{ synonyms: [], antonyms: [], definitions: [{ synonyms: [], antonyms: [] }] }],
      },
    })
  })

  it("does not send an upstream request for an empty word", async () => {
    expect(await lookupDictionary("  ")).toMatchObject({ ok: false, code: "INVALID_WORD", status: 400 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("sends the configured application contact in the User-Agent", async () => {
    vi.stubEnv("WIKTIONARY_USER_AGENT", "AI-Dictionary/0.1 (https://dictionary.example/contact)")
    fetchMock.mockResolvedValueOnce(dictionaryResponse())
    await lookupDictionary("apple")

    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      headers: expect.objectContaining({ "User-Agent": "AI-Dictionary/0.1 (https://dictionary.example/contact)" }),
    }))
  })

  it("only returns English senses and keeps all English parts of speech", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({
      en: [
        { partOfSpeech: "Interjection", definitions: [{ definition: "A <a>greeting</a>." }] },
        { partOfSpeech: "Verb", definitions: [{ definition: "To greet someone." }] },
      ],
      fr: [{ partOfSpeech: "Interjection", definitions: [{ definition: "French greeting." }] }],
    }))

    const result = await lookupDictionary("hello")
    expect(result).toMatchObject({
      ok: true,
      entry: { meanings: [
        { partOfSpeech: "interjection", definitions: [{ definition: "A greeting." }] },
        { partOfSpeech: "verb", definitions: [{ definition: "To greet someone." }] },
      ] },
    })
    if (result.ok) expect(result.entry.meanings).toHaveLength(2)
  })

  it("decodes entities, removes scripts, styles and footnotes, and keeps text safe to render", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ en: [{
      partOfSpeech: "Noun",
      definitions: [{
        definition: '<style>.defdate{display:none}</style><script>bad()</script><div>A &amp; B&nbsp;&#x1F34E;</div><p>&lt;tag&gt; &quot;fruit&quot;<sup class="reference">[1]</sup></p>',
        examples: ['<b>Apple</b><br> &amp; pear.'],
      }],
    }] }))

    expect(await lookupDictionary("apple")).toMatchObject({
      ok: true,
      entry: { meanings: [{ definitions: [{ definition: 'A & B 🍎 <tag> "fruit"', example: "Apple & pear." }] }] },
    })
  })

  it("skips empty placeholders without discarding the remaining definitions", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ en: [
      { partOfSpeech: "Noun", definitions: [{ definition: "" }, { definition: "<style>css</style>" }, { definition: "A reference work." }] },
      { partOfSpeech: "Verb", definitions: [] },
    ] }))
    const result = await lookupDictionary("dictionary")

    expect(result).toMatchObject({ ok: true, entry: { meanings: [{ definitions: [{ definition: "A reference work." }] }] } })
    if (result.ok) expect(result.entry.meanings).toHaveLength(1)
  })

  it("prefers structured examples and falls back to legacy examples if they are empty", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ en: [{
      partOfSpeech: "Noun",
      definitions: [
        { definition: "A fruit.", parsedExamples: [{ example: "<b>Eat</b> an apple." }], examples: ["Older example."] },
        { definition: "Another sense.", parsedExamples: [{ example: "<span></span>" }], examples: ["<i>Legacy</i> example."] },
      ],
    }] }))

    expect(await lookupDictionary("apple")).toMatchObject({
      ok: true,
      entry: { meanings: [{ definitions: [
        { example: "Eat an apple." }, { example: "Legacy example." },
      ] }] },
    })
  })

  it.each([
    {},
    { en: [] },
    { en: [{ partOfSpeech: "Noun", definitions: [{ definition: "" }] }] },
    { fr: [{ partOfSpeech: "Noun", definitions: [{ definition: "A French-only term." }] }] },
  ])("returns NOT_FOUND when there are no usable English senses (%j)", async body => {
    fetchMock.mockResolvedValue(Response.json(body))
    expect(await lookupDictionary("bonjour")).toMatchObject({ ok: false, code: "NOT_FOUND", status: 404 })
  })

  it("attaches the English source page and license without inventing pronunciation data", async () => {
    fetchMock.mockResolvedValueOnce(dictionaryResponse("ice cream"))
    expect(await lookupWord("ice cream")).toMatchObject({
      phonetics: [],
      source: {
        name: "Wiktionary", url: "https://en.wiktionary.org/wiki/ice%20cream#English",
        license: { name: "CC BY-SA 4.0", url: "https://creativecommons.org/licenses/by-sa/4.0/" },
      },
    })
  })

  it("shares simultaneous dictionary and AI lookups and caches successful results", async () => {
    fetchMock.mockResolvedValueOnce(dictionaryResponse())
    const [result, entry] = await Promise.all([lookupDictionary(" APPLE "), lookupWord("apple")])

    expect(result).toEqual({ ok: true, entry })
    expect(await lookupWord("apple")).toEqual(entry)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("shares requests even when Next.js loads a separate copy of the module", async () => {
    fetchMock.mockResolvedValueOnce(dictionaryResponse())
    const pending = lookupDictionary("apple")
    vi.resetModules()
    const separateModule = await import("./dictionary-api")

    await Promise.all([pending, separateModule.lookupWord("apple")])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("refreshes successful entries after the cache expires", async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(async url => String(url).includes("/html") ? pronunciationResponse() : dictionaryResponse())
    await lookupDictionary("apple")
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
    await lookupDictionary("apple")

    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([
    [404, "NOT_FOUND", 404],
    [429, "RATE_LIMITED", 503],
    [500, "UPSTREAM_ERROR", 502],
    [503, "UPSTREAM_ERROR", 502],
  ])("distinguishes upstream HTTP %i from other failures", async (upstreamStatus, code, status) => {
    fetchMock.mockResolvedValue(new Response("upstream error", { status: upstreamStatus }))
    expect(await lookupDictionary("apple")).toMatchObject({ ok: false, code, status })
  })

  it("does not cache failures, so a subsequent lookup can recover", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }))
    fetchMock.mockResolvedValueOnce(dictionaryResponse())

    expect(await lookupWord("apple")).toBeNull()
    expect(await lookupWord("apple")).toMatchObject({ word: "apple" })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it.each([
    { body: [] },
    { body: { en: [{ definitions: [] }] } },
    { body: { title: "No Definitions Found" } },
  ])(
    "rejects malformed successful response $body",
    async ({ body }) => {
      fetchMock.mockResolvedValue(Response.json(body))
      expect(await lookupDictionary("apple")).toMatchObject({ ok: false, code: "INVALID_RESPONSE", status: 502 })
    },
  )

  it("reports HTML instead of JSON as an invalid response", async () => {
    fetchMock.mockResolvedValue(new Response("<html>Gateway error</html>"))
    expect(await lookupDictionary("apple")).toMatchObject({ ok: false, code: "INVALID_RESPONSE", status: 502 })
  })

  it("records network error codes while allowing AI callers to continue without dictionary data", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed", { cause: { code: "ENOTFOUND" } }))

    expect(await lookupWord("apple")).toBeNull()
    expect(console.warn).toHaveBeenCalledWith("[dictionary-api] Lookup failed", expect.objectContaining({
      word: "apple", code: "NETWORK_ERROR", cause: "ENOTFOUND",
    }))
  })

  it("aborts requests that never return headers and permits a retry", async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true })
    }))
    const pending = lookupDictionary("apple")
    await vi.advanceTimersByTimeAsync(timeoutMs)

    expect(await pending).toMatchObject({ ok: false, code: "TIMEOUT", status: 504 })
    fetchMock.mockResolvedValueOnce(dictionaryResponse())
    expect(await lookupWord("apple")).toMatchObject({ word: "apple" })
    expect(vi.getTimerCount()).toBe(0)
  })

  it("applies the same deadline to a stalled response body", async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementationOnce(async (_url, init) => {
      await new Promise(resolve => setTimeout(resolve, 2000))
      return new Response(new ReadableStream({
        start(controller) {
          init!.signal!.addEventListener("abort", () => controller.error(init!.signal!.reason), { once: true })
        },
      }))
    })
    const pending = lookupDictionary("apple")
    await vi.advanceTimersByTimeAsync(timeoutMs)

    expect(await pending).toMatchObject({ ok: false, code: "TIMEOUT", status: 504 })
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe("Wiktionary pronunciation parsing", () => {
  it("keeps English pronunciation, ignores rhymes and other sections, and deduplicates formats", () => {
    const audio = `<tr><td>Audio (UK):</td><td><audio resource="./File:En-uk-hello.ogg">
      <source src="//upload.wikimedia.org/wikipedia/commons/4/48/En-uk-hello.ogg?utm_source=en.wiktionary.org" type="audio/ogg">
      <source src="//upload.wikimedia.org/wikipedia/commons/transcoded/4/48/En-uk-hello.ogg/En-uk-hello.ogg.mp3" type="audio/mpeg">
    </audio></td></tr>`
    const html = `<section><h2 id="French">French</h2><section><h3>Pronunciation</h3>
      <span class="IPA">/french/</span><audio src="//upload.wikimedia.org/french.ogg"></audio></section></section>
      ${englishPage(`<ul><li>IPA: <span class="IPA nowrap">/həˈləʊ/</span>, <span class="IPA">[həˈləʊ]</span>
      <span class="IPA">/həˈləʊ/</span></li><li>Rhymes: <span class="IPA">-əʊ</span></li></ul>
      <table>${audio}${audio}</table>`)}
      <section><h2 id="German">German</h2><section><h3>Pronunciation</h3><span class="IPA">/german/</span></section></section>`

    expect(parsePronunciation(html)).toEqual([
      { text: "/həˈləʊ/" }, { text: "[həˈləʊ]" },
      {
        audio: "https://upload.wikimedia.org/wikipedia/commons/transcoded/4/48/En-uk-hello.ogg/En-uk-hello.ogg.mp3",
        audioAlternatives: ["https://upload.wikimedia.org/wikipedia/commons/4/48/En-uk-hello.ogg"],
        sourceUrl: "https://en.wiktionary.org/wiki/File:En-uk-hello.ogg", label: "UK",
      },
    ])
    expect(parsePronunciation(`<section><h2 id="English">English</h2>
      <section><h3>Etymology</h3><span class="IPA">/another-word/</span></section></section>`)).toEqual([])
  })

  it("collects pronunciation sections under multiple English etymologies", () => {
    expect(parsePronunciation(`<section><h2><span id="English">English</span></h2>
      <section><h3>Etymology 1</h3><section><h4>Pronunciation 1</h4><span class="IPA">/one/</span></section></section>
      <section><h3>Etymology 2</h3><section><h4>Pronunciation 2</h4><span class="IPA">/two/</span></section></section>
    </section>`)).toEqual([{ text: "/one/" }, { text: "/two/" }])
  })

  it("keeps an IPA-only entry without inventing audio", () => {
    expect(parsePronunciation(englishPage('<span class="IPA">/ˈæpəl/</span>'))).toEqual([{ text: "/ˈæpəl/" }])
  })

  it("keeps an audio-only entry with its accent and source, including nested parentheses", () => {
    expect(parsePronunciation(englishPage(`<table><tr><td>Audio (US (Midwest)):</td><td>
      <audio src="//upload.wikimedia.org/wikipedia/commons/a/ab/English.ogg?utm_campaign=rest"></audio>
    </td></tr></table>`))).toEqual([{
      audio: "https://upload.wikimedia.org/wikipedia/commons/a/ab/English.ogg",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:English.ogg", label: "US (Midwest)",
    }])
  })

  it.each([
    "javascript:alert(1)", "data:audio/ogg;base64,AAAA", "https://unrelated.example/audio.mp3",
    "http://upload.wikimedia.org/audio.mp3", "https://user:pass@upload.wikimedia.org/audio.mp3",
  ])("ignores untrusted audio URLs (%s)", url => {
    expect(parsePronunciation(englishPage(`<audio src="${url}"></audio>`))).toEqual([])
  })

  it("distinguishes a page with no pronunciation from a non-English or gateway page", () => {
    expect(parsePronunciation(englishPage())).toEqual([])
    expect(parsePronunciation("<h1>Gateway unavailable</h1>")).toBeNull()
    expect(parsePronunciation('<section><h2 id="French">French</h2><span class="IPA">/fr/</span></section>')).toBeNull()
  })
})

describe("optional pronunciation requests", () => {
  it("supplements structured definitions with IPA and records a successful page check", async () => {
    fetchMock.mockResolvedValueOnce(dictionaryResponse("ice cream"))
    fetchMock.mockResolvedValueOnce(pronunciationResponse('<span class="IPA">/ˌaɪs ˈkɹiːm/</span>'))

    expect(await lookupWord("ice cream")).toMatchObject({
      phonetic: "/ˌaɪs ˈkɹiːm/", phonetics: [{ text: "/ˌaɪs ˈkɹiːm/" }], pronunciationCheckedAt: expect.any(String),
    })
    expect(fetchMock).toHaveBeenLastCalledWith("https://en.wiktionary.org/w/rest.php/v1/page/ice%20cream/html", expect.objectContaining({
      signal: expect.any(AbortSignal), headers: expect.objectContaining({ Accept: "text/html" }),
    }))
  })

  it.each([404, 429, 503])("returns definitions even when the pronunciation page returns HTTP %i", async status => {
    fetchMock.mockResolvedValueOnce(dictionaryResponse())
    fetchMock.mockResolvedValueOnce(new Response(null, { status }))
    const result = await lookupDictionary("apple")

    expect(result).toMatchObject({ ok: true, entry: { word: "apple", phonetics: [] } })
    if (result.ok) expect(result.entry.pronunciationCheckedAt).toBeUndefined()
  })

  it("keeps definitions when pronunciation has a network error or invalid HTML", async () => {
    fetchMock.mockResolvedValueOnce(dictionaryResponse())
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"))
    expect(await lookupWord("apple")).toMatchObject({ word: "apple", phonetics: [] })

    fetchMock.mockResolvedValueOnce(dictionaryResponse("pear"))
    fetchMock.mockResolvedValueOnce(new Response("<html>Gateway error</html>"))
    expect(await lookupWord("pear")).toMatchObject({ word: "pear", phonetics: [] })
  })

  it("does not look for pronunciation when no English definitions are available", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ fr: [] }))
    expect(await lookupWord("bonjour")).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("times out optional pronunciation, preserves definitions, and retries after a short cache period", async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValueOnce(dictionaryResponse())
    fetchMock.mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true })
    }))
    const pending = lookupDictionary("apple")
    await vi.advanceTimersByTimeAsync(pronunciationTimeoutMs)
    expect(await pending).toMatchObject({ ok: true, entry: { word: "apple", phonetics: [] } })
    expect(vi.getTimerCount()).toBe(0)
    await lookupDictionary("apple")
    expect(fetchMock).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    fetchMock.mockResolvedValueOnce(dictionaryResponse())
    fetchMock.mockResolvedValueOnce(pronunciationResponse('<span class="IPA">/ˈæpəl/</span>'))
    expect(await lookupWord("apple")).toMatchObject({ phonetic: "/ˈæpəl/", pronunciationCheckedAt: expect.any(String) })
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("includes a stalled pronunciation body in the optional deadline", async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValueOnce(dictionaryResponse())
    fetchMock.mockImplementationOnce(async (_url, init) => new Response(new ReadableStream({
      start(controller) {
        init!.signal!.addEventListener("abort", () => controller.error(init!.signal!.reason), { once: true })
      },
    })))
    const pending = lookupDictionary("apple")
    await vi.advanceTimersByTimeAsync(pronunciationTimeoutMs)

    expect(await pending).toMatchObject({ ok: true, entry: { word: "apple" } })
    expect(vi.getTimerCount()).toBe(0)
  })

  it("keeps the overall deadline when the definitions used most of the available time", async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementationOnce(async () => {
      await new Promise(resolve => setTimeout(resolve, timeoutMs - 1000))
      return dictionaryResponse()
    })
    fetchMock.mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true })
    }))
    const pending = lookupDictionary("apple")
    await vi.advanceTimersByTimeAsync(timeoutMs)

    expect(await pending).toMatchObject({ ok: true, entry: { word: "apple" } })
    expect(vi.getTimerCount()).toBe(0)
  })
})
