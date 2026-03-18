import { streamText, Output } from "ai"
import { getModelForTask, buildSceneExpressionPrompt } from "@/lib/ai"
import { prisma } from "@/lib/prisma"
import { z } from "zod/v4"

const sceneSchema = z.object({
  expressions: z.array(z.object({
    english: z.string(),
    chinese: z.string(),
    context: z.string(),
  })),
  dialogue: z.string(),
  culturalNotes: z.string(),
})

export async function POST(request: Request) {
  const { scene } = await request.json()

  if (!scene || typeof scene !== "string") {
    return new Response("Missing scene", { status: 400 })
  }

  const model = await getModelForTask("scene")
  const result = streamText({
    model,
    output: Output.object({ schema: sceneSchema }),
    prompt: buildSceneExpressionPrompt(scene),
    async onFinish({ text }) {
      try {
        const parsed = JSON.parse(text)
        await prisma.sceneHistory.create({
          data: {
            scene: scene.trim(),
            expressions: parsed.expressions,
            dialogue: parsed.dialogue,
            culturalNotes: parsed.culturalNotes ?? "",
          },
        })
      } catch {
        // parse failed — don't save incomplete results
      }
    },
  })

  return result.toTextStreamResponse()
}
