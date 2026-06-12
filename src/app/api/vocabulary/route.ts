import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const vocabulary = await prisma.vocabulary.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      word: true,
      phonetic: true,
      briefDefinition: true,
      chineseDefinition: true,
      notes: true,
      createdAt: true,
    }
  })
  return NextResponse.json(vocabulary)
}

export async function POST(request: Request) {
  const { word, phonetic, briefDefinition, notes } = await request.json()

  if (!word || !briefDefinition) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  const entry = await prisma.vocabulary.upsert({
    where: { word: word.toLowerCase() },
    update: { phonetic, briefDefinition, notes },
    create: {
      word: word.toLowerCase(),
      phonetic,
      briefDefinition,
      notes,
    },
  })

  return NextResponse.json(entry)
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  const word = searchParams.get("word")?.trim().toLowerCase()

  if (!id && !word) {
    return NextResponse.json({ error: "Missing id or word" }, { status: 400 })
  }

  const entry = id
    ? await prisma.vocabulary.findUnique({ where: { id }, select: { id: true, word: true } })
    : word
      ? await prisma.vocabulary.findUnique({ where: { word }, select: { id: true, word: true } })
      : null

  if (!entry) {
    return NextResponse.json({ error: "Vocabulary entry not found" }, { status: 404 })
  }

  await prisma.vocabulary.delete({ where: { id: entry.id } })

  await prisma.wordChat.deleteMany({ where: { word: entry.word } })

  return NextResponse.json({ success: true })
}
