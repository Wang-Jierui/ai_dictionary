import { generateText, streamText } from "ai"
import { z } from "zod/v4"
import { buildLookupPrompt, getModelForTask } from "@/lib/ai"
import { lookupWord } from "@/lib/dictionary-api"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/generated/prisma/client"
import type { AIWordData, DictionaryEntry } from "@/types/dictionary"

export const aiWordSchema = z.object({
  chineseDefinition: z.string(),
  personalizedExamples: z.array(z.string()),
  nuanceAnalysis: z.string(),
  etymologyStory: z.string(),
  mnemonicHook: z.string(),
  coreImage: z.string().optional(),
  senseMap: z.array(z.object({ meaning: z.string(), usage: z.string() })).optional(),
  collocations: z.array(z.string()).optional(),
  synonymBoundaries: z.array(z.object({ synonym: z.string(), difference: z.string() })).optional(),
  commonMistakes: z.array(z.string()).optional(),
  multiHookMemory: z.array(z.string()).optional(),
  activeRecall: z.object({ question: z.string(), answer: z.string() }).optional(),
  practiceTask: z.string().optional(),
})

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

export function clampLookupConcurrency(value: unknown, defaultConcurrency = 3, maxConcurrency = 5) {
  if (typeof value !== "number" || !Number.isFinite(value)) return defaultConcurrency
  return Math.min(maxConcurrency, Math.max(1, Math.floor(value)))
}

function toStringValue(value: unknown) {
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return ""
}

function toStringArray(value: unknown) {
  if (typeof value === "string") {
    const text = value.trim()
    return text ? [text] : []
  }

  if (!Array.isArray(value)) return []

  return value
    .map(item => toStringValue(item).trim())
    .filter(Boolean)
}

function toSenseMap(value: unknown) {
  if (!Array.isArray(value)) return []

  const entries = value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .map(item => ({
      meaning: toStringValue(item.meaning).trim(),
      usage: toStringValue(item.usage).trim(),
    }))
    .filter(item => item.meaning || item.usage)

  return entries
}

function toSynonymBoundaries(value: unknown) {
  if (!Array.isArray(value)) return []

  const entries = value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .map(item => ({
      synonym: toStringValue(item.synonym).trim(),
      difference: toStringValue(item.difference).trim(),
    }))
    .filter(item => item.synonym || item.difference)

  return entries
}

function toActiveRecall(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null

  const question = toStringValue((value as Record<string, unknown>).question).trim()
  const answer = toStringValue((value as Record<string, unknown>).answer).trim()

  if (!question && !answer) return null

  return { question, answer }
}

function hasMeaningfulLookupContent(data: AIWordData) {
  return Boolean(
    data.chineseDefinition.trim() ||
    data.personalizedExamples.length > 0 ||
    data.nuanceAnalysis.trim() ||
    data.etymologyStory.trim() ||
    data.mnemonicHook.trim() ||
    data.coreImage?.trim() ||
    data.senseMap?.some(item => item.meaning.trim() || item.usage.trim()) ||
    data.collocations?.length ||
    data.synonymBoundaries?.some(item => item.synonym.trim() || item.difference.trim()) ||
    data.commonMistakes?.length ||
    data.multiHookMemory?.length ||
    data.activeRecall?.question.trim() ||
    data.activeRecall?.answer.trim() ||
    data.practiceTask?.trim(),
  )
}

function coerceLookupAiWordData(value: unknown): AIWordData | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null

  const record = value as Record<string, unknown>
  const normalized: AIWordData = {
    chineseDefinition: toStringValue(record.chineseDefinition).trim(),
    personalizedExamples: toStringArray(record.personalizedExamples),
    nuanceAnalysis: toStringValue(record.nuanceAnalysis).trim(),
    etymologyStory: toStringValue(record.etymologyStory).trim(),
    mnemonicHook: toStringValue(record.mnemonicHook).trim(),
  }

  const coreImage = toStringValue(record.coreImage).trim()
  const senseMap = toSenseMap(record.senseMap)
  const collocations = toStringArray(record.collocations)
  const synonymBoundaries = toSynonymBoundaries(record.synonymBoundaries)
  const commonMistakes = toStringArray(record.commonMistakes)
  const multiHookMemory = toStringArray(record.multiHookMemory)
  const activeRecall = toActiveRecall(record.activeRecall)
  const practiceTask = toStringValue(record.practiceTask).trim()

  if (coreImage) normalized.coreImage = coreImage
  if (senseMap.length > 0) normalized.senseMap = senseMap
  if (collocations.length > 0) normalized.collocations = collocations
  if (synonymBoundaries.length > 0) normalized.synonymBoundaries = synonymBoundaries
  if (commonMistakes.length > 0) normalized.commonMistakes = commonMistakes
  if (multiHookMemory.length > 0) normalized.multiHookMemory = multiHookMemory
  if (activeRecall) normalized.activeRecall = activeRecall
  if (practiceTask) normalized.practiceTask = practiceTask

  if (!hasMeaningfulLookupContent(normalized)) return null

  const parsed = aiWordSchema.safeParse(normalized)
  return parsed.success ? parsed.data : null
}

function extractFirstBalancedJsonObject(text: string) {
  const startIndex = text.indexOf("{")
  if (startIndex < 0) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index]

    if (escaped) {
      escaped = false
      continue
    }

    if (char === "\\") {
      escaped = inString
      continue
    }

    if (char === '"') {
      inString = !inString
      continue
    }

    if (inString) continue

    if (char === "{") depth += 1
    if (char === "}") depth -= 1

    if (depth === 0) {
      return text.slice(startIndex, index + 1)
    }
  }

  return null
}

function tryParseLookupJson(text: string) {
  const candidates = [
    text.trim(),
    ...Array.from(text.matchAll(/```json\s*([\s\S]*?)```/gi), match => match[1].trim()),
    ...Array.from(text.matchAll(/```\s*([\s\S]*?)```/g), match => match[1].trim()),
  ]

  const balanced = extractFirstBalancedJsonObject(text)
  if (balanced) candidates.push(balanced)

  for (const candidate of candidates) {
    if (!candidate) continue

    try {
      const parsed = JSON.parse(candidate) as unknown
      const aiData = coerceLookupAiWordData(parsed)
      if (aiData) return aiData
    } catch {
      continue
    }
  }

  return null
}

function parseLookupResponse(text: string): AIWordData {
  const parsed = tryParseLookupJson(text)
  if (parsed) return parsed

  return {
    chineseDefinition: text.trim() || text,
    personalizedExamples: [],
    nuanceAnalysis: "",
    etymologyStory: "",
    mnemonicHook: "",
  }
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
