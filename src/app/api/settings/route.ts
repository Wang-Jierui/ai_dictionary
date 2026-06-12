import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getCurrentUsername } from "@/lib/auth"

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.floor(value)))
}

function minInteger(value: unknown, min: number, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.floor(value))
}

function normalizeAiEndpoints(value: unknown) {
  if (Array.isArray(value)) return value

  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  return []
}

export async function GET() {
  const settings = await prisma.settings.findFirst()
  if (!settings) {
    const created = await prisma.settings.create({
      data: {
        id: "default",
        interests: [],
        customPrompt: "",
        aiEndpoints: [],
      },
    })
    return NextResponse.json({ ...created, aiEndpoints: [] })
  }

  const username = await getCurrentUsername()
  if (username) {
    const userConfig = await prisma.userApiConfig.findUnique({ where: { username } })
    if (userConfig) {
      return NextResponse.json({
        ...settings,
        aiEndpoints: normalizeAiEndpoints(userConfig.aiEndpoints),
      })
    }
  }

  return NextResponse.json({
    ...settings,
    aiEndpoints: normalizeAiEndpoints(settings.aiEndpoints),
  })
}

export async function PUT(request: Request) {
  const body = await request.json()
  const batchMaxWords = clampInteger(body.batchMaxWords, 1, 1000, 50)
  const batchConcurrency = minInteger(body.batchConcurrency, 1, 3)
  const aiEndpoints = body.aiEndpoints === undefined ? undefined : normalizeAiEndpoints(body.aiEndpoints)

  const username = await getCurrentUsername()
  if (username && aiEndpoints !== undefined) {
    await prisma.userApiConfig.update({
      where: { username },
      data: { aiEndpoints },
    })
  }

  const settings = await prisma.settings.upsert({
    where: { id: "default" },
    update: {
      interests: body.interests,
      customPrompt: body.customPrompt,
      batchMaxWords,
      batchConcurrency,
      ...(username || aiEndpoints === undefined ? {} : { aiEndpoints }),
    },
    create: {
      id: "default",
      interests: body.interests ?? [],
      customPrompt: body.customPrompt ?? "",
      batchMaxWords,
      batchConcurrency,
      aiEndpoints: aiEndpoints ?? [],
    },
  })

  const userConfig = username
    ? await prisma.userApiConfig.findUnique({
      where: { username },
      select: { aiEndpoints: true },
    })
    : null

  return NextResponse.json({
    ...settings,
    aiEndpoints: username
      ? normalizeAiEndpoints(aiEndpoints ?? userConfig?.aiEndpoints)
      : normalizeAiEndpoints(settings.aiEndpoints),
  })
}
