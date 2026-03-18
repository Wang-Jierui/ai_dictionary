import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const history = await prisma.sceneHistory.findMany({
    orderBy: { createdAt: "desc" },
  })
  return NextResponse.json(history)
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 })
  }

  await prisma.sceneHistory.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
