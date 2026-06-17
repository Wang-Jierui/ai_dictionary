import { NextResponse } from "next/server"
import { LookupParseError } from "@/lib/ai-parser"
import { fetchDictionaryEntry, findCachedLookup, generateAiLookup, getLookupSettings, normalizeLookupWord, recordSearchHistory, saveVocabularyLookup } from "@/lib/lookup-service"

export async function POST(request: Request) {
  let body: unknown

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 })
  }

  if (!body || typeof body !== "object" || !("word" in body) || typeof body.word !== "string") {
    return NextResponse.json({ error: "Missing word" }, { status: 400 })
  }

  const { word, forceRefresh } = body as { word: string; forceRefresh?: unknown }
  const wordLower = normalizeLookupWord(word)

  const cached = forceRefresh ? null : await findCachedLookup(wordLower)
  if (cached) {
    await recordSearchHistory([wordLower])
    return NextResponse.json({
      cached: true,
      dictData: cached.dictData,
      aiData: cached.aiData,
      imageData: cached.imageData,
      imageMode: cached.imageMode,
      notes: cached.notes,
    })
  }

  await recordSearchHistory([wordLower])

  const settings = await getLookupSettings()

  try {
    const [dictData, aiData] = await Promise.all([
      fetchDictionaryEntry(wordLower),
      generateAiLookup(wordLower, settings),
    ])

    const saved = await saveVocabularyLookup(wordLower, dictData, aiData)

    return NextResponse.json({
      cached: false,
      dictData,
      aiData,
      imageData: saved.imageData,
      imageMode: saved.imageMode,
      notes: saved.notes,
    })
  } catch (error) {
    if (error instanceof LookupParseError) {
      return NextResponse.json(
        { error: "Lookup response could not be parsed as valid word data", code: "PARSE_ERROR" },
        { status: 422 },
      )
    }

    const message = error instanceof Error ? error.message : "Lookup failed"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
