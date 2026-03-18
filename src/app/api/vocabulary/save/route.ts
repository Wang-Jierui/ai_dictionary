import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(request: Request) {
  const { word, phonetic, briefDefinition, chineseDefinition, dictData, aiData, imageData, imageMode } = await request.json()

  if (!word) {
    return NextResponse.json({ error: "Missing word" }, { status: 400 })
  }

  const entry = await prisma.vocabulary.upsert({
    where: { word: word.toLowerCase() },
    update: {
      phonetic,
      briefDefinition: briefDefinition ?? "",
      chineseDefinition,
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
      dictData: dictData ?? undefined,
      aiData: aiData ?? undefined,
      imageData: imageData ?? undefined,
      imageMode: imageMode ?? undefined,
    },
  })

  return NextResponse.json(entry)
}
