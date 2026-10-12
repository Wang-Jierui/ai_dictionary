import { NextResponse } from "next/server"
import { lookupDictionary } from "@/lib/dictionary-api"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const word = searchParams.get("word")

  if (!word?.trim()) {
    return NextResponse.json({ error: "Missing word parameter" }, { status: 400 })
  }

  const result = await lookupDictionary(word)
  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: result.status })
  }

  return NextResponse.json(result.entry)
}
