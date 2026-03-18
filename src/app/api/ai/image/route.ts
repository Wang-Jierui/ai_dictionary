import { NextResponse } from "next/server"
import { generateImage } from "ai"
import { getEndpointForTask, createProvider, buildImagePrompt } from "@/lib/ai"

export async function POST(request: Request) {
  const { word, meaning, mode = "mood" } = await request.json()

  if (!word || typeof word !== "string") {
    return NextResponse.json({ error: "Missing word" }, { status: 400 })
  }

  const endpoint = await getEndpointForTask("image")
  if (!endpoint) {
    return NextResponse.json(
      { error: "No AI endpoint configured for image generation. Please set up in Settings." },
      { status: 400 }
    )
  }

  const provider = createProvider(endpoint)
  const model = provider.image(endpoint.model)

  try {
    const { image } = await generateImage({
      model,
      prompt: buildImagePrompt(word, meaning || word, mode as "mood" | "meme"),
      size: "1024x1024",
    })

    return NextResponse.json({ base64: image.base64 })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Image generation failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
