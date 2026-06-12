import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getCurrentUsername } from "@/lib/auth"

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.floor(value)))
}

export async function GET() {
  const settings = await prisma.settings.findFirst()
  if (!settings) {
    const created = await prisma.settings.create({
      data: {
        id: "default",
        interests: [],
        customPrompt: "",
        aiEndpoints: JSON.stringify([]),
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
        aiEndpoints: userConfig.aiEndpoints,
      })
    }
  }

  return NextResponse.json(settings)
}

export async function PUT(request: Request) {
  const body = await request.json()
  const batchMaxWords = clampInteger(body.batchMaxWords, 1, 100, 50)
  const batchConcurrency = clampInteger(body.batchConcurrency, 1, 5, 3)

  const username = await getCurrentUsername()
  if (username && body.aiEndpoints !== undefined) {
    await prisma.userApiConfig.update({
      where: { username },
      data: { aiEndpoints: body.aiEndpoints },
    })
  }

  const settings = await prisma.settings.upsert({
    where: { id: "default" },
    update: {
      interests: body.interests,
      customPrompt: body.customPrompt,
      batchMaxWords,
      batchConcurrency,
      ...(username ? {} : { aiEndpoints: body.aiEndpoints }),
    },
    create: {
      id: "default",
      interests: body.interests ?? [],
      customPrompt: body.customPrompt ?? "",
      batchMaxWords,
      batchConcurrency,
      aiEndpoints: body.aiEndpoints ?? JSON.stringify([]),
    },
  })

  return NextResponse.json(settings)
}
