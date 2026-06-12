import { NextResponse } from "next/server"
import { findCachedLookup, getLookupSettings, normalizeLookupWord, recordSearchHistory, streamAiLookup } from "@/lib/lookup-service"

export async function POST(request: Request) {
  const { word } = await request.json()

  if (!word || typeof word !== "string") {
    return new Response("Missing word", { status: 400 })
  }

  const wordLower = normalizeLookupWord(word)

  const cached = await findCachedLookup(wordLower)
  if (cached) {
    await recordSearchHistory([wordLower])
    return NextResponse.json({
      cached: true,
      dictData: cached.dictData,
      aiData: cached.aiData,
    })
  }

  await recordSearchHistory([wordLower])

  const settings = await getLookupSettings()
  const result = await streamAiLookup(word, settings)
  return result.toTextStreamResponse()
}
