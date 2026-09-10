import { generateText } from "ai"
import { NextResponse } from "next/server"
import { getModelForTask } from "@/lib/ai"
import { prisma } from "@/lib/prisma"
import { buildSentenceChatPrompt, sentenceExplanationSchema, sentenceMessageSchema, sentenceQuestionSchema } from "@/lib/sentence"
import type { SentenceMessage } from "@/types/sentence"

export async function POST(request: Request) {
  const input = sentenceQuestionSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) return NextResponse.json({ error: "追问内容无效或过长，请修改后重试。" }, { status: 400 })

  try {
    const { id, question, fragment, version } = input.data
    const record = await prisma.sentenceAnalysis.findUnique({ where: { id } })
    if (!record) return NextResponse.json({ error: "这条解析已不存在，请重新解析。" }, { status: 404 })
    if (record.version !== version) return NextResponse.json({ error: "记录已在其他页面更新，请从历史重新打开后继续。" }, { status: 409 })
    if (fragment && !record.sentence.includes(fragment)) {
      return NextResponse.json({ error: "引用的片段不在原句中，请重新选择。" }, { status: 400 })
    }

    const messages = sentenceMessageSchema.array().parse(record.messages)
    if (messages.length + 2 > 200) return NextResponse.json({ error: "本条解析的追问较多，请重新解析后继续。" }, { status: 409 })
    const analysis = sentenceExplanationSchema.parse(record.analysis)
    const userMessage: SentenceMessage = {
      id: crypto.randomUUID(), role: "user", content: question, fragment, createdAt: new Date().toISOString(),
    }
    const model = await getModelForTask("sentence")
    const { text } = await generateText({
      model,
      system: buildSentenceChatPrompt(record.sentence, record.context, analysis),
      messages: [...messages.slice(-20), userMessage].map(message => ({
        role: message.role,
        content: message.fragment ? `引用原句片段：${message.fragment}\n\n${message.content}` : message.content,
      })),
      abortSignal: AbortSignal.any([request.signal, AbortSignal.timeout(90000)]),
    })
    if (!text.trim() || text.length > 20000) {
      return NextResponse.json({ error: "AI 未返回有效回答，请重试。" }, { status: 502 })
    }
    const nextMessages = [...messages, userMessage, {
      id: crypto.randomUUID(), role: "assistant" as const, content: text.trim(), createdAt: new Date().toISOString(),
    }]
    // Compare-and-swap prevents simultaneous tabs from overwriting a saved conversation.
    const updated = await prisma.sentenceAnalysis.updateMany({
      where: { id, version },
      data: { messages: JSON.parse(JSON.stringify(nextMessages)), version: { increment: 1 } },
    })
    if (updated.count !== 1) return NextResponse.json({ error: "记录已更新，请从历史重新打开后重试。" }, { status: 409 })
    return NextResponse.json({ messages: nextMessages, version: version + 1 })
  } catch {
    return NextResponse.json({ error: "追问或保存失败，你的问题已保留，请重试。" }, { status: 502 })
  }
}
