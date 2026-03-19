import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

function verifyAdmin(request: Request): boolean {
  const adminPwd = process.env.ADMIN_PASSWORD
  if (!adminPwd) return false
  const pwd = request.headers.get("x-admin-password")
  return pwd === adminPwd
}

export async function GET(request: Request) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: "未授权" }, { status: 401 })
  }

  const users = await prisma.userApiConfig.findMany({
    select: {
      id: true,
      username: true,
      aiEndpoints: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  })

  const result = users.map(u => ({
    id: u.id,
    username: u.username,
    endpointCount: Array.isArray(u.aiEndpoints) ? (u.aiEndpoints as unknown[]).length : 0,
    createdAt: u.createdAt,
  }))

  return NextResponse.json(result)
}

export async function DELETE(request: Request) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: "未授权" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 })
  }

  await prisma.userApiConfig.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
