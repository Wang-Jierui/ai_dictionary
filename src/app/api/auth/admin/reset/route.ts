import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { hashPassword } from "@/lib/auth"

export async function POST(request: Request) {
  const adminPwd = process.env.ADMIN_PASSWORD
  if (!adminPwd) {
    return NextResponse.json({ error: "未配置管理密码" }, { status: 500 })
  }

  const pwd = request.headers.get("x-admin-password")
  if (pwd !== adminPwd) {
    return NextResponse.json({ error: "未授权" }, { status: 401 })
  }

  const { userId, newPassword } = await request.json()

  if (!userId || !newPassword) {
    return NextResponse.json({ error: "缺少参数" }, { status: 400 })
  }

  const passwordHash = await hashPassword(newPassword)
  await prisma.userApiConfig.update({
    where: { id: userId },
    data: { passwordHash },
  })

  return NextResponse.json({ success: true })
}
