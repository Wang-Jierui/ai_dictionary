import { streamText } from "ai"
import { getModelForTask, buildAutoScenarioPrompt } from "@/lib/ai"

export async function POST(request: Request) {
  const { word } = await request.json()

  if (!word || typeof word !== "string") {
    return new Response("Missing word", { status: 400 })
  }

  const model = await getModelForTask("roleplay")
  const result = streamText({
    model,
    prompt: buildAutoScenarioPrompt(word),
  })

  return result.toTextStreamResponse()
}
