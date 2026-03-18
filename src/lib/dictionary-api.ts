import type { DictionaryEntry } from "@/types/dictionary"

const BASE_URL = "https://api.dictionaryapi.dev/api/v2/entries/en"

export async function lookupWord(word: string): Promise<DictionaryEntry | null> {
  try {
    const res = await fetch(`${BASE_URL}/${encodeURIComponent(word.trim().toLowerCase())}`)
    if (!res.ok) return null
    const data: DictionaryEntry[] = await res.json()
    return data[0] ?? null
  } catch {
    return null
  }
}
