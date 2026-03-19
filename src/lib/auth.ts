import { cookies } from "next/headers"
import { prisma } from "./prisma"

const COOKIE_NAME = "ai-dict-user"

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hash = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("")
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const computed = await hashPassword(password)
  return computed === hash
}

export async function getCurrentUsername(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(COOKIE_NAME)?.value ?? null
}

export async function getUserEndpoints(username: string) {
  const user = await prisma.userApiConfig.findUnique({ where: { username } })
  if (!user) return null
  return user.aiEndpoints
}

export { COOKIE_NAME }
