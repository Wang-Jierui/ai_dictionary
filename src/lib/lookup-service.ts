import { generateText, streamText } from "ai"
import { buildLookupPrompt, getModelForTask } from "@/lib/ai"
import { parseLookupResponse } from "@/lib/ai-parser"
import { lookupWord } from "@/lib/dictionary-api"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/generated/prisma/client"
import type { AIWordData, DictionaryEntry } from "@/types/dictionary"

type CachedLookup = {
  cached: true
  dictData: DictionaryEntry | null
  aiData: AIWordData
}

type LookupSettings = {
  interests: string[]
  customPrompt: string
  batchMaxWords: number
  batchConcurrency: number
}

export type FreshLookup = {
  cached: false
  dictData: DictionaryEntry | null
  aiData: AIWordData
}

export type BatchLookupSuccess = {
  index: number
  word: string
  status: "cached" | "success"
  cached: boolean
  dictData: DictionaryEntry | null
  aiData: AIWordData
}

export type BatchLookupFailure = {
  index: number
  word: string
  status: "error"
  cached: false
  dictData: DictionaryEntry | null
  aiData: null
  error: string
}

export type BatchLookupResult = BatchLookupSuccess | BatchLookupFailure

export function normalizeLookupWord(word: string) {
  return word.trim().toLowerCase()
}

export function clampLookupConcurrency(value: unknown, defaultConcurrency = 3) {
  if (typeof value !== "number" || !Number.isFinite(value)) return defaultConcurrency
  return Math.max(1, Math.floor(value))
}

export async function findCachedLookup(word: string): Promise<CachedLookup | null> {
  const cached = await prisma.vocabulary.findUnique({ where: { word } })

  if (!cached?.aiData) return null

  return {
    cached: true,
    dictData: cached.dictData ? (cached.dictData as unknown as DictionaryEntry) : null,
    aiData: cached.aiData as unknown as AIWordData,
  }
}

export async function recordSearchHistory(words: string[]) {
  const normalizedWords = words.map(normalizeLookupWord).filter(Boolean)
  if (normalizedWords.length === 0) return

  if (normalizedWords.length === 1) {
    await prisma.searchHistory.create({ data: { word: normalizedWords[0] } })
    return
  }

  await prisma.searchHistory.createMany({
    data: normalizedWords.map(word => ({ word })),
  })
}

export async function getLookupSettings(): Promise<LookupSettings> {
  const settings = await prisma.settings.findFirst()
  return {
    interests: settings?.interests ?? [],
    customPrompt: settings?.customPrompt ?? "",
    batchMaxWords: settings?.batchMaxWords ?? 50,
    batchConcurrency: settings?.batchConcurrency ?? 3,
  }
}

export function streamAiLookup(word: string, settings: LookupSettings) {
  return getModelForTask("lookup").then(model => streamText({
    model,
    prompt: buildLookupPrompt(word, settings.interests, settings.customPrompt),
  }))
}

export async function fetchDictionaryEntry(word: string) {
  return lookupWord(word)
}

export async function generateAiLookup(word: string, settings: LookupSettings): Promise<AIWordData> {
  const model = await getModelForTask("lookup")
  const { text } = await generateText({
    model,
    prompt: buildLookupPrompt(word, settings.interests, settings.customPrompt),
  })

  return parseLookupResponse(text)
}

function firstBriefDefinition(dictData: DictionaryEntry | null) {
  return dictData?.meanings[0]?.definitions[0]?.definition ?? ""
}

function firstPhonetic(dictData: DictionaryEntry | null) {
  return dictData?.phonetic ?? dictData?.phonetics.find(phonetic => phonetic.text)?.text
}

function toJsonInput(value: DictionaryEntry | AIWordData): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

export async function saveVocabularyLookup(word: string, dictData: DictionaryEntry | null, aiData: AIWordData) {
  const dictJson = dictData ? toJsonInput(dictData) : undefined
  const aiJson = toJsonInput(aiData)

  return prisma.vocabulary.upsert({
    where: { word },
    update: {
      phonetic: firstPhonetic(dictData),
      briefDefinition: firstBriefDefinition(dictData),
      chineseDefinition: aiData.chineseDefinition,
      dictData: dictJson,
      aiData: aiJson,
    },
    create: {
      word,
      phonetic: firstPhonetic(dictData),
      briefDefinition: firstBriefDefinition(dictData),
      chineseDefinition: aiData.chineseDefinition,
      dictData: dictJson,
      aiData: aiJson,
    },
  })
}

export async function lookupWordFully(word: string, settings: LookupSettings): Promise<CachedLookup | FreshLookup> {
  const cached = await findCachedLookup(word)
  if (cached) return cached

  const [dictData, aiData] = await Promise.all([
    fetchDictionaryEntry(word),
    generateAiLookup(word, settings),
  ])

  await saveVocabularyLookup(word, dictData, aiData)

  return {
    cached: false,
    dictData,
    aiData,
  }
}

export async function runWorkerPool<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length)
  let nextIndex = 0

  async function runWorker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await worker(items[currentIndex])
    }
  }

  const workerCount = Math.min(concurrency, items.length)
  await Promise.all(Array.from({ length: workerCount }, runWorker))
  return results
}
