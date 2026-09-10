export interface SentenceExplanation {
  translation: string
  overview: string
  chunks: { text: string; explanation: string }[]
  difficulties: { fragment: string; explanation: string }[]
  structure: string
  contextNote: string
}

export interface SentenceMessage {
  id: string
  role: "user" | "assistant"
  content: string
  fragment?: string
  createdAt: string
}

export interface SentenceHistoryItem {
  id: string
  sentence: string
  context: string
  source: string
  createdAt: string
  updatedAt: string
}

export interface SavedSentence extends SentenceHistoryItem {
  analysis: SentenceExplanation
  messages: SentenceMessage[]
  version: number
}
