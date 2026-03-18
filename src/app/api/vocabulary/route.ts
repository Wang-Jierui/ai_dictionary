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

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 })
  }

  await prisma.vocabulary.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
