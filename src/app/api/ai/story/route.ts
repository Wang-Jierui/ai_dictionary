import { streamText } from "ai"
import { getModelForTask, buildStoryPrompt } from "@/lib/ai"

export async function POST(request: Request) {
  const { words } = await request.json()

  if (!words || !Array.isArray(words) || words.length === 0) {
    return new Response("Missing words array", { status: 400 })
  }

  const model = await getModelForTask("story")
  const result = streamText({
    model,
    prompt: buildStoryPrompt(words),
  })

  return result.toTextStreamResponse()
}
