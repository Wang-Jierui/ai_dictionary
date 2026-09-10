import { generateText } from "ai"
import { NextResponse } from "next/server"
import { getModelForTask } from "@/lib/ai"
import { prisma } from "@/lib/prisma"
import { buildSentencePrompt, parseSentenceExplanation, sentenceInputSchema } from "@/lib/sentence"

export async function POST(request: Request) {
  const input = sentenceInputSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) {
    return NextResponse.json({ error: "请输入有效的句子（最多 4000 字符），上下文最多 6000 字符。" }, { status: 400 })
  }

  try {
    const { sentence, context, source } = input.data
    const model = await getModelForTask("sentence")
    const { text } = await generateText({
      model,
      prompt: buildSentencePrompt(sentence, context),
      abortSignal: AbortSignal.any([request.signal, AbortSignal.timeout(90000)]),
    })

    let analysis
    try {
      analysis = parseSentenceExplanation(text)
    } catch {
      return NextResponse.json({ error: "AI 返回的解析格式不完整，请重试。", code: "PARSE_ERROR" }, { status: 422 })
    }

    const saved = await prisma.sentenceAnalysis.create({ data: { sentence, context, source, analysis: { ...analysis } } })
    return NextResponse.json(saved)
  } catch {
    return NextResponse.json({ error: "句子解析或保存失败，请检查模型配置、数据库连接后重试。" }, { status: 502 })
  }
}
