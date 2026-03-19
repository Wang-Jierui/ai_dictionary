import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"
import { hashPassword, verifyPassword, getCurrentUsername, COOKIE_NAME } from "@/lib/auth"

export async function GET() {
  const username = await getCurrentUsername()
  if (!username) {
    return NextResponse.json({ username: null })
  }
  const user = await prisma.userApiConfig.findUnique({ where: { username } })
  if (!user) {
    return NextResponse.json({ username: null })
  }
  return NextResponse.json({ username: user.username })
}

export async function POST(request: Request) {
  const { username, password, action } = await request.json()

  if (!username || !password) {
    return NextResponse.json({ error: "用户名和密码不能为空" }, { status: 400 })
  }

  const trimmedUsername = username.trim().toLowerCase()

  if (action === "register") {
    const existing = await prisma.userApiConfig.findUnique({ where: { username: trimmedUsername } })
    if (existing) {
      return NextResponse.json({ error: "用户名已存在" }, { status: 409 })
    }

    const passwordHash = await hashPassword(password)
    await prisma.userApiConfig.create({
      data: {
        username: trimmedUsername,
        passwordHash,
        aiEndpoints: JSON.parse("[]"),
      },
    })

    const cookieStore = await cookies()
    cookieStore.set(COOKIE_NAME, trimmedUsername, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    })

    return NextResponse.json({ username: trimmedUsername })
  }

  const user = await prisma.userApiConfig.findUnique({ where: { username: trimmedUsername } })
  if (!user) {
    return NextResponse.json({ error: "用户不存在" }, { status: 404 })
  }

  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) {
    return NextResponse.json({ error: "密码错误" }, { status: 401 })
  }

  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, trimmedUsername, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  })

  return NextResponse.json({ username: trimmedUsername })
}

export async function DELETE() {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
  return NextResponse.json({ success: true })
}
