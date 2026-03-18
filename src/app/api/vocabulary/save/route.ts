import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(request: Request) {
  const { word, phonetic, briefDefinition, chineseDefinition, dictData, aiData } = await request.json()

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
    },
    create: {
      word: word.toLowerCase(),
      phonetic,
      briefDefinition: briefDefinition ?? "",
      chineseDefinition,
      dictData: dictData ?? undefined,
      aiData: aiData ?? undefined,
    },
  })

  return NextResponse.json(entry)
}
