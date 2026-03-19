import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getCurrentUsername } from "@/lib/auth"

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
      ...(username ? {} : { aiEndpoints: body.aiEndpoints }),
    },
    create: {
      id: "default",
      interests: body.interests ?? [],
      customPrompt: body.customPrompt ?? "",
      aiEndpoints: body.aiEndpoints ?? JSON.stringify([]),
    },
  })

  return NextResponse.json(settings)
}
