import { NextResponse } from "next/server"

const BASE_URL = "https://api.dictionaryapi.dev/api/v2/entries/en"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const word = searchParams.get("word")

  if (!word) {
    return NextResponse.json({ error: "Missing word parameter" }, { status: 400 })
  }

  try {
    const res = await fetch(`${BASE_URL}/${encodeURIComponent(word.trim().toLowerCase())}`)
    if (!res.ok) {
      return NextResponse.json({ error: "Word not found" }, { status: 404 })
    }
    const data = await res.json()
    return NextResponse.json(data[0])
  } catch {
    return NextResponse.json({ error: "Dictionary API error" }, { status: 500 })
  }
}
