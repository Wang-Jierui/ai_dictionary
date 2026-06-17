import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(request: Request) {
  const { word, phonetic, briefDefinition, chineseDefinition, notes, dictData, aiData, imageData, imageMode } = await request.json()

  if (!word) {
    return NextResponse.json({ error: "Missing word" }, { status: 400 })
  }

  const entry = await prisma.vocabulary.upsert({
    where: { word: word.toLowerCase() },
    update: {
      ...(phonetic !== undefined && { phonetic }),
      ...(briefDefinition !== undefined && { briefDefinition }),
      ...(chineseDefinition !== undefined && { chineseDefinition }),
      ...(notes !== undefined && { notes }),
      dictData: dictData ?? undefined,
      aiData: aiData ?? undefined,
      ...(imageData !== undefined && { imageData }),
      ...(imageMode !== undefined && { imageMode }),
    },
    create: {
      word: word.toLowerCase(),
      phonetic,
      briefDefinition: briefDefinition ?? "",
      chineseDefinition,
      notes,
      dictData: dictData ?? undefined,
      aiData: aiData ?? undefined,
      imageData: imageData ?? undefined,
      imageMode: imageMode ?? undefined,
      reviewEnabled: false,
      reviewDueAt: null,
      reviewLastReviewedAt: null,
      reviewRepetitionCount: 0,
      reviewIntervalDays: 0,
      reviewEaseFactor: 2.5,
      reviewLapses: 0,
    },
  })

  return NextResponse.json(entry)
}
