import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

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
    return NextResponse.json(created)
  }
  return NextResponse.json(settings)
}

export async function PUT(request: Request) {
  const body = await request.json()

  const settings = await prisma.settings.upsert({
    where: { id: "default" },
    update: {
      interests: body.interests,
      customPrompt: body.customPrompt,
      aiEndpoints: body.aiEndpoints,
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
