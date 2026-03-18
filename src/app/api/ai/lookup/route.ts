import { streamText, Output } from "ai"
import { getModelForTask, buildLookupPrompt } from "@/lib/ai"
import { prisma } from "@/lib/prisma"
import { z } from "zod/v4"
import { NextResponse } from "next/server"

const aiWordSchema = z.object({
  chineseDefinition: z.string(),
  personalizedExamples: z.array(z.string()),
  nuanceAnalysis: z.string(),
  etymologyStory: z.string(),
  mnemonicHook: z.string(),
})

export async function POST(request: Request) {
  const { word } = await request.json()

  if (!word || typeof word !== "string") {
    return new Response("Missing word", { status: 400 })
  }

  const wordLower = word.trim().toLowerCase()

  const cached = await prisma.vocabulary.findUnique({ where: { word: wordLower } })
  if (cached?.aiData) {
    await prisma.searchHistory.create({ data: { word: wordLower } })
    return NextResponse.json({
      cached: true,
      dictData: cached.dictData,
      aiData: cached.aiData,
    })
  }

  const settings = await prisma.settings.findFirst()
  const interests = settings?.interests ?? []
  const customPrompt = settings?.customPrompt ?? ""

  await prisma.searchHistory.create({ data: { word: wordLower } })

  const model = await getModelForTask("lookup")
  const prompt = buildLookupPrompt(word, interests as string[], customPrompt)

  const result = streamText({
    model,
    output: Output.object({ schema: aiWordSchema }),
    prompt,
  })

  return result.toTextStreamResponse()
}
