import { streamText } from "ai"
import { getModelForTask, buildRoleplaySystemPrompt } from "@/lib/ai"
import { prisma } from "@/lib/prisma"

export async function POST(request: Request) {
  const { sessionId, messages, targetWord, scenario } = await request.json()

  if (!targetWord || !scenario) {
    return new Response("Missing targetWord or scenario", { status: 400 })
  }

  const model = await getModelForTask("roleplay")
  const systemPrompt = buildRoleplaySystemPrompt(targetWord, scenario)

  let session = sessionId
    ? await prisma.roleplaySession.findUnique({ where: { id: sessionId } })
    : null

  if (!session) {
    session = await prisma.roleplaySession.create({
      data: {
        targetWord,
        scenario,
        messages: JSON.stringify([]),
      },
    })
  }

  const allMessages = [
    { role: "system" as const, content: systemPrompt },
    ...messages,
  ]

  const result = streamText({
    model,
    messages: allMessages,
  })

  const response = result.toTextStreamResponse()

  result.text.then(async (text) => {
    const updatedMessages = [
      ...messages,
      { role: "assistant", content: text },
    ]
    await prisma.roleplaySession.update({
      where: { id: session.id },
      data: { messages: JSON.stringify(updatedMessages) },
    })
  })

  return response
}
