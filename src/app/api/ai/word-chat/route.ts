import { streamText } from "ai"
import { getModelForTask, buildWordChatSystemPrompt } from "@/lib/ai"
import { prisma } from "@/lib/prisma"

interface ChatMessage {
  id: string
  parentId: string | null
  role: "user" | "assistant"
  content: string
  createdAt: string
}

function getPathToRoot(messages: ChatMessage[], leafId: string): ChatMessage[] {
  const map = new Map(messages.map(m => [m.id, m]))
  const path: ChatMessage[] = []
  let current = map.get(leafId)
  while (current) {
    path.unshift(current)
    current = current.parentId ? map.get(current.parentId) : undefined
  }
  return path
}

export async function POST(request: Request) {
  const { word, content, parentId, dictData, aiData } = await request.json()

  if (!word || !content) {
    return new Response("Missing word or content", { status: 400 })
  }

  const wordLower = word.toLowerCase()
  const model = await getModelForTask("lookup")
  const systemPrompt = buildWordChatSystemPrompt(word, dictData, aiData)

  const chat = await prisma.wordChat.findUnique({ where: { word: wordLower } })
  const existingMessages: ChatMessage[] = chat
    ? (chat.messages as unknown as ChatMessage[])
    : []

  const userMsgId = crypto.randomUUID()
  const userMsg: ChatMessage = {
    id: userMsgId,
    parentId: parentId ?? null,
    role: "user",
    content,
    createdAt: new Date().toISOString(),
  }

  const updatedMessages = [...existingMessages, userMsg]
  const conversationPath = getPathToRoot(updatedMessages, userMsgId)

  const allMessages = [
    { role: "system" as const, content: systemPrompt },
    ...conversationPath.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
  ]

  const result = streamText({ model, messages: allMessages })
  const response = result.toTextStreamResponse()

  result.text.then(async (text) => {
    const assistantMsgId = crypto.randomUUID()
    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      parentId: userMsgId,
      role: "assistant",
      content: text,
      createdAt: new Date().toISOString(),
    }

    const finalMessages = [...updatedMessages, assistantMsg]

    if (chat) {
      await prisma.wordChat.update({
        where: { word: wordLower },
        data: {
          messages: JSON.parse(JSON.stringify(finalMessages)),
          activeLeafId: assistantMsgId,
        },
      })
    } else {
      await prisma.wordChat.create({
        data: {
          word: wordLower,
          messages: JSON.parse(JSON.stringify(finalMessages)),
          activeLeafId: assistantMsgId,
        },
      })
    }
  })

  return new Response(response.body, {
    headers: {
      ...Object.fromEntries(response.headers.entries()),
      "X-User-Message-Id": userMsgId,
    },
  })
}
