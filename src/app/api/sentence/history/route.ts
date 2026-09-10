import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const id = params.get("id")
  try {
    if (id) {
      const entry = await prisma.sentenceAnalysis.findUnique({ where: { id } })
      return entry ? NextResponse.json(entry) : NextResponse.json({ error: "解析记录不存在。" }, { status: 404 })
    }
    const offset = Number(params.get("offset") ?? 0)
    const query = (params.get("q") ?? "").trim()
    if (!Number.isInteger(offset) || offset < 0 || offset > 100000 || query.length > 200) {
      return NextResponse.json({ error: "历史查询参数无效。" }, { status: 400 })
    }
    const rows = await prisma.sentenceAnalysis.findMany({
      where: query ? { OR: [
        { sentence: { contains: query, mode: "insensitive" } },
        { source: { contains: query, mode: "insensitive" } },
      ] } : undefined,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: offset, take: 21,
      select: { id: true, sentence: true, context: true, source: true, createdAt: true, updatedAt: true },
    })
    return NextResponse.json({ items: rows.slice(0, 20), nextOffset: rows.length > 20 ? offset + 20 : null })
  } catch {
    return NextResponse.json({ error: "解析历史加载失败，请稍后重试。" }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id")
  if (!id) return NextResponse.json({ error: "缺少解析记录 ID。" }, { status: 400 })
  try {
    await prisma.sentenceAnalysis.deleteMany({ where: { id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "删除失败，请重试。" }, { status: 500 })
  }
}
