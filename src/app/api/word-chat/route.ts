import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const word = searchParams.get("word")

  if (!word) {
    return NextResponse.json({ error: "Missing word" }, { status: 400 })
  }

  const chat = await prisma.wordChat.findUnique({
    where: { word: word.toLowerCase() },
  })

  return NextResponse.json(chat)
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 })
  }

  await prisma.wordChat.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
