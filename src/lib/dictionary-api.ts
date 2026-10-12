import { z } from "zod"
import { parse, parseFragment, type DefaultTreeAdapterMap } from "parse5"
import type { DictionaryEntry, DictionaryPhonetic } from "@/types/dictionary"

const BASE_URL = "https://en.wiktionary.org/api/rest_v1/page/definition"
const PAGE_HTML_URL = "https://en.wiktionary.org/w/rest.php/v1/page"
const DEFAULT_USER_AGENT = "AI-Dictionary/0.1 (self-hosted English vocabulary lookup)"
export const DICTIONARY_TIMEOUT_MS = 5000
export const PRONUNCIATION_TIMEOUT_MS = 3000
const CACHE_TTL_MS = 60 * 60 * 1000
const PRONUNCIATION_RETRY_MS = 5 * 60 * 1000
const MAX_CACHE_ENTRIES = 500

const wiktionaryResponseSchema = z.object({
  en: z.array(z.object({
    partOfSpeech: z.string().min(1),
    definitions: z.array(z.object({
      definition: z.string(),
      examples: z.array(z.string()).optional(),
      parsedExamples: z.array(z.object({ example: z.string() })).optional(),
    })),
  })).optional(),
}).catchall(z.array(z.unknown()))

type HtmlNode = DefaultTreeAdapterMap["node"]
type HtmlElement = DefaultTreeAdapterMap["element"]

function attribute(node: HtmlElement, name: string) {
  return node.attrs.find(attr => attr.name === name)?.value
}

function textContent(node: HtmlNode): string {
  if (node.nodeName === "#text") return (node as DefaultTreeAdapterMap["textNode"]).value
  if (!("childNodes" in node)) return ""
  if ("tagName" in node) {
    if (["script", "style", "template", "noscript"].includes(node.tagName)) return ""
    const classes = attribute(node, "class")?.split(/\s+/) ?? []
    if (classes.some(value => ["reference", "mw-editsection"].includes(value))) return ""
    if (node.tagName === "br") return " "
  }
  const text = node.childNodes.map(textContent).join("")
  return "tagName" in node && ["p", "div", "li", "dt", "dd"].includes(node.tagName) ? `${text} ` : text
}

function nodeText(node: HtmlNode) {
  return textContent(node).replace(/\s+/gu, " ").trim()
}

function htmlToText(html: string): string {
  return nodeText(parseFragment(html))
}

function* elements(node: HtmlNode): Generator<HtmlElement> {
  if ("tagName" in node) yield node
  if ("childNodes" in node) {
    for (const child of node.childNodes) yield* elements(child)
  }
}

function closestElement(node: HtmlElement, tagName: string): HtmlElement | undefined {
  let parent = node.parentNode
  while (parent) {
    if ("tagName" in parent && parent.tagName === tagName) return parent
    parent = "parentNode" in parent ? parent.parentNode : null
  }
}

function audioUrl(value: string | undefined): string | undefined {
  if (!value) return
  try {
    const url = new URL(value, "https://en.wiktionary.org")
    if (url.protocol !== "https:" || url.hostname !== "upload.wikimedia.org" || url.username || url.password) return
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("utm_")) url.searchParams.delete(key)
    }
    return url.href
  } catch {
    return
  }
}

function audioSourceUrl(node: HtmlElement, audio: string): string {
  const resource = attribute(node, "resource")
  if (resource) {
    try {
      const url = new URL(resource, "https://en.wiktionary.org/wiki/")
      if (url.protocol === "https:" && ["en.wiktionary.org", "commons.wikimedia.org"].includes(url.hostname)
        && url.pathname.startsWith("/wiki/File:") && !url.username && !url.password) return url.href
    } catch { /* Fall back to the recording's Commons file page. */ }
  }
  const path = new URL(audio).pathname.split("/")
  const fileName = path.includes("transcoded") ? path.at(-2) : path.at(-1)
  return `https://commons.wikimedia.org/wiki/File:${fileName}`
}

// The definition endpoint has no pronunciation fields. The page HTML REST
// endpoint includes IPA spans and audio sources inside language sections.
export function parseWiktionaryPronunciation(html: string): DictionaryPhonetic[] | null {
  let englishSection: HtmlElement | undefined
  for (const node of elements(parse(html))) {
    if (node.tagName === "h2" && [...elements(node)].some(child => attribute(child, "id") === "English")) {
      englishSection = closestElement(node, "section")
      break
    }
  }
  // A gateway/error page must not be mistaken for a word without pronunciation.
  if (!englishSection) return null

  const phonetics: DictionaryPhonetic[] = []
  const seenTexts = new Set<string>()
  const seenAudio = new Set<string>()
  for (const section of elements(englishSection)) {
    if (section.tagName !== "section") continue
    const heading = section.childNodes.find(child => "tagName" in child && /^h[3-6]$/.test(child.tagName))
    if (!heading || !/^Pronunciation(?:\s+\d+)?$/u.test(nodeText(heading))) continue

    for (const node of elements(section)) {
      if (attribute(node, "class")?.split(/\s+/).includes("IPA")) {
        const text = nodeText(node)
        // Rhymes also use the IPA class, but are not whole-word transcriptions.
        if (/^(?:\/.+\/|\[.+\])$/u.test(text) && !seenTexts.has(text)) {
          seenTexts.add(text)
          phonetics.push({ text })
        }
      }
      if (node.tagName !== "audio") continue
      const sources = [...new Set([...elements(node)].flatMap(source => {
        if (!["audio", "source"].includes(source.tagName)) return []
        const url = audioUrl(attribute(source, "src"))
        return url ? [url] : []
      }))]
      const audio = sources.find(url => new URL(url).pathname.endsWith(".mp3")) ?? sources[0]
      if (!audio) continue
      const sourceUrl = audioSourceUrl(node, audio)
      if (seenAudio.has(sourceUrl)) continue
      seenAudio.add(sourceUrl)
      const row = closestElement(node, "tr")
      const label = row ? nodeText(row).match(/^Audio\s*\((.+?)\)(?:\s*[:;]|$)/u)?.[1] : undefined
      // Keep recordings separate from IPA rather than pairing different accents.
      const audioAlternatives = sources.filter(url => url !== audio)
      phonetics.push({ audio, sourceUrl, ...(label && { label }), ...(audioAlternatives.length && { audioAlternatives }) })
    }
  }
  return phonetics
}

export function parseWiktionaryEntry(word: string, data: unknown): DictionaryEntry | null {
  const response = wiktionaryResponseSchema.parse(data)
  const meanings = (response.en ?? []).map(meaning => ({
    partOfSpeech: htmlToText(meaning.partOfSpeech).toLowerCase(),
    definitions: meaning.definitions.flatMap(item => {
      const definition = htmlToText(item.definition)
      // The API can include empty placeholder definitions before real senses.
      if (!definition) return []
      const example = [
        ...(item.parsedExamples ?? []).map(parsed => parsed.example),
        ...(item.examples ?? []),
      ].map(htmlToText).find(Boolean)
      return [{ definition, ...(example && { example }), synonyms: [], antonyms: [] }]
    }),
    synonyms: [],
    antonyms: [],
  })).filter(meaning => meaning.partOfSpeech && meaning.definitions.length > 0)

  if (meanings.length === 0) return null
  return {
    word,
    phonetics: [],
    meanings,
    source: {
      name: "Wiktionary",
      url: `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}#English`,
      license: { name: "CC BY-SA 4.0", url: "https://creativecommons.org/licenses/by-sa/4.0/" },
    },
  }
}

export type DictionaryLookupResult =
  | { ok: true; entry: DictionaryEntry }
  | {
    ok: false
    code: "INVALID_WORD" | "NOT_FOUND" | "TIMEOUT" | "RATE_LIMITED" | "UPSTREAM_ERROR" | "INVALID_RESPONSE" | "NETWORK_ERROR"
    error: string
    status: number
  }

type DictionaryState = {
  version: 2
  cache: Map<string, { entry: DictionaryEntry; expiresAt: number }>
  pending: Map<string, Promise<DictionaryLookupResult>>
}

// Next.js can bundle the two route handlers separately. Share requests and
// successful responses across those bundles within the same server process.
const globalForDictionary = globalThis as typeof globalThis & { aiWiktionaryState?: DictionaryState }
const state = globalForDictionary.aiWiktionaryState?.version === 2
  ? globalForDictionary.aiWiktionaryState
  : globalForDictionary.aiWiktionaryState = { version: 2, cache: new Map(), pending: new Map() }

export async function lookupDictionary(word: string): Promise<DictionaryLookupResult> {
  const normalizedWord = word.trim().toLowerCase()
  if (!normalizedWord) {
    return { ok: false, code: "INVALID_WORD", error: "Missing word parameter", status: 400 }
  }

  const cached = state.cache.get(normalizedWord)
  if (cached && cached.expiresAt > Date.now()) return { ok: true, entry: cached.entry }
  state.cache.delete(normalizedWord)

  const pending = state.pending.get(normalizedWord)
  if (pending) return pending

  const request = requestDictionary(normalizedWord)
  state.pending.set(normalizedWord, request)
  try {
    const result = await request
    if (result.ok) {
      if (state.cache.size >= MAX_CACHE_ENTRIES) {
        state.cache.delete(state.cache.keys().next().value!)
      }
      const ttl = result.entry.pronunciationCheckedAt ? CACHE_TTL_MS : PRONUNCIATION_RETRY_MS
      state.cache.set(normalizedWord, { entry: result.entry, expiresAt: Date.now() + ttl })
    }
    return result
  } finally {
    state.pending.delete(normalizedWord)
  }
}

async function fetchPronunciation(word: string, parentSignal: AbortSignal) {
  const controller = new AbortController()
  const signal = AbortSignal.any([parentSignal, controller.signal])
  const timeout = setTimeout(() => controller.abort(), PRONUNCIATION_TIMEOUT_MS)
  let upstreamStatus: number | undefined
  try {
    const response = await fetch(`${PAGE_HTML_URL}/${encodeURIComponent(word)}/html`, {
      signal,
      cache: "no-store",
      headers: {
        Accept: "text/html",
        "User-Agent": process.env.WIKTIONARY_USER_AGENT?.trim() || DEFAULT_USER_AGENT,
      },
    })
    upstreamStatus = response.status
    if (!response.ok) {
      await response.body?.cancel()
      throw new Error("Pronunciation page unavailable")
    }
    const phonetics = parseWiktionaryPronunciation(await response.text())
    if (!phonetics) throw new Error("English pronunciation section unavailable")
    return {
      phonetics,
      phonetic: phonetics.find(item => item.text)?.text,
      pronunciationCheckedAt: new Date().toISOString(),
    }
  } catch {
    console.warn("[dictionary-api] Pronunciation unavailable", {
      source: "Wiktionary", word, code: signal.aborted ? "TIMEOUT" : "UPSTREAM_ERROR", upstreamStatus,
    })
    return null
  } finally {
    clearTimeout(timeout)
  }
}

async function requestDictionary(word: string): Promise<DictionaryLookupResult> {
  const controller = new AbortController()
  const startedAt = Date.now()
  // Keep the deadline active until the response body has also been read.
  const timeout = setTimeout(() => controller.abort(), DICTIONARY_TIMEOUT_MS)
  let upstreamStatus: number | undefined

  try {
    const response = await fetch(`${BASE_URL}/${encodeURIComponent(word)}`, {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": process.env.WIKTIONARY_USER_AGENT?.trim() || DEFAULT_USER_AGENT,
      },
    })
    upstreamStatus = response.status
    if (!response.ok) await response.body?.cancel()
    if (response.status === 404) {
      return { ok: false, code: "NOT_FOUND", error: "Word not found", status: 404 }
    }

    let failure: Extract<DictionaryLookupResult, { ok: false }>
    if (response.status === 429) {
      failure = { ok: false, code: "RATE_LIMITED", error: "Dictionary API rate limit exceeded", status: 503 }
    } else if (!response.ok) {
      failure = { ok: false, code: "UPSTREAM_ERROR", error: "Dictionary API unavailable", status: 502 }
    } else {
      const data: unknown = await response.json()
      const entry = parseWiktionaryEntry(word, data)
      if (entry) {
        const pronunciation = await fetchPronunciation(word, controller.signal)
        return { ok: true, entry: pronunciation ? { ...entry, ...pronunciation } : entry }
      }
      return { ok: false, code: "NOT_FOUND", error: "No English definitions found", status: 404 }
    }

    console.warn("[dictionary-api] Lookup failed", {
      source: "Wiktionary", word, code: failure.code, upstreamStatus, elapsedMs: Date.now() - startedAt,
    })
    return failure
  } catch (error) {
    const code = controller.signal.aborted ? "TIMEOUT" : error instanceof SyntaxError || error instanceof z.ZodError ? "INVALID_RESPONSE" : "NETWORK_ERROR"
    const failure: Extract<DictionaryLookupResult, { ok: false }> = {
      ok: false,
      code,
      error: code === "TIMEOUT" ? "Dictionary API timed out" : code === "INVALID_RESPONSE" ? "Invalid dictionary API response" : "Dictionary API connection failed",
      status: code === "TIMEOUT" ? 504 : 502,
    }
    const cause = error instanceof Error ? (error.cause as { code?: string } | undefined)?.code : undefined
    console.warn("[dictionary-api] Lookup failed", {
      source: "Wiktionary", word, code, upstreamStatus, elapsedMs: Date.now() - startedAt, cause,
    })
    return failure
  } finally {
    clearTimeout(timeout)
  }
}

// Dictionary outages must not prevent an otherwise successful AI lookup.
export async function lookupWord(word: string): Promise<DictionaryEntry | null> {
  const result = await lookupDictionary(word)
  return result.ok ? result.entry : null
}
