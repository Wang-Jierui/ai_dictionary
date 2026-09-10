export type ReadingMode = "auto" | "word" | "sentence"

export const SENTENCE_MAX_LENGTH = 4000
export const CONTEXT_MAX_LENGTH = 6000
export const SOURCE_MAX_LENGTH = 1000
export const QUESTION_MAX_LENGTH = 2000

export function detectReadingMode(text: string): "word" | "sentence" {
  return /^[a-z]+(?:['’\-][a-z]+)*[.!?]?$/i.test(text.trim()) ? "word" : "sentence"
}

export function normalizeReadingWord(text: string) {
  return text.trim().replace(/[.!?]$/, "")
}
