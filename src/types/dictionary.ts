// Free Dictionary API response types
export interface DictionaryPhonetic {
  text?: string
  audio?: string
  sourceUrl?: string
}

export interface DictionaryDefinition {
  definition: string
  example?: string
  synonyms: string[]
  antonyms: string[]
}

export interface DictionaryMeaning {
  partOfSpeech: string
  definitions: DictionaryDefinition[]
  synonyms: string[]
  antonyms: string[]
}

export interface DictionaryEntry {
  word: string
  phonetic?: string
  phonetics: DictionaryPhonetic[]
  origin?: string
  meanings: DictionaryMeaning[]
}

// AI-enhanced word data
export interface AIWordData {
  personalizedExamples: string[]
  nuanceAnalysis: string
  etymologyStory: string
  mnemonicHook: string
  chineseDefinition: string

  // Richer structured learning-card fields
  coreImage?: string
  senseMap?: { meaning: string; usage: string }[]
  collocations?: string[]
  synonymBoundaries?: { synonym: string; difference: string }[]
  commonMistakes?: string[]
  multiHookMemory?: string[]
  activeRecall?: { question: string; answer: string }
  practiceTask?: string
}

// JSON-safe SM-2 review state for a vocabulary entry.
export interface VocabularyReviewState {
  easeFactor: number
  intervalDays: number
  repetitionCount: number
  lapses: number
  dueAt: string | null
  lastReviewedAt: string | null
}

// Combined word result
export interface WordResult {
  dictionary: DictionaryEntry | null
  ai?: AIWordData
  error?: string
}

// User settings
export interface UserSettings {
  interests: string[]
  customPrompt: string
  aiEndpoints: AIEndpointConfig[]
  activeEndpointId: string
  sectionOrder: string[]
}

export interface AIEndpointConfig {
  id: string
  name: string
  baseURL: string
  apiKey: string
  model: string
  // Which tasks this endpoint handles
  tasks: AITask[]
}

export type AITask = 
  | "lookup"
  | "story"
  | "roleplay"
  | "image"
  | "scene"

// Vocabulary book entry
export interface VocabularyEntry {
  id: string
  word: string
  phonetic?: string
  briefDefinition: string
  chineseDefinition?: string
  notes?: string
  dictData?: DictionaryEntry | null
  aiData?: AIWordData | null
  imageData?: string | null
  imageMode?: "mood" | "meme" | null
  reviewEnabled: boolean
  review?: VocabularyReviewState | null
  createdAt: Date
}

// Roleplay session
export interface RoleplayMessage {
  role: "user" | "assistant" | "system"
  content: string
}

export interface RoleplayScenario {
  title: string
  description: string
  targetWord: string
  systemPrompt: string
}
