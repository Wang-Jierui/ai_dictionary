import { streamText } from "ai"
import { getModelForTask, buildRoleplaySystemPrompt } from "@/lib/ai"
import { prisma } from "@/lib/prisma"

type RoleplayMessage = {
  role: "user" | "assistant"
  content: string
}

function isRoleplayMessage(value: unknown): value is RoleplayMessage {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    ((value as RoleplayMessage).role === "user" || (value as RoleplayMessage).role === "assistant") &&
    typeof (value as RoleplayMessage).content === "string",
  )
}

export async function POST(request: Request) {
  let body: unknown

  try {
    body = await request.json()
  } catch {
    return new Response("Malformed JSON body", { status: 400 })
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return new Response("Expected JSON body", { status: 400 })
  }

  const { sessionId, messages, targetWord, scenario } = body as Record<string, unknown>

  if (typeof targetWord !== "string" || !targetWord.trim() || typeof scenario !== "string" || !scenario.trim()) {
    return new Response("Missing targetWord or scenario", { status: 400 })
  }

  if (!Array.isArray(messages) || !messages.every(isRoleplayMessage)) {
    return new Response("Expected messages array", { status: 400 })
  }

  const model = await getModelForTask("roleplay")
  const systemPrompt = buildRoleplaySystemPrompt(targetWord, scenario)

  let session = typeof sessionId === "string" && sessionId
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

  ;(async () => {
    try {
      const text = await result.text
      const updatedMessages = [
        ...messages,
        { role: "assistant", content: text },
      ]
      await prisma.roleplaySession.update({
        where: { id: session.id },
        data: { messages: JSON.stringify(updatedMessages) },
      })
    } catch {
      // ignore
    }
  })()

  return new Response(response.body, {
    headers: {
      ...Object.fromEntries(response.headers.entries()),
      "X-Session-Id": session.id,
    },
  })
}
