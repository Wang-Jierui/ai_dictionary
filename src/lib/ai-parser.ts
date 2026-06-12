import { z } from "zod/v4"
import type { AIWordData } from "@/types/dictionary"

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

  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .map(item => ({
      meaning: toStringValue(item.meaning).trim(),
      usage: toStringValue(item.usage).trim(),
    }))
    .filter(item => item.meaning || item.usage)
}

function toSynonymBoundaries(value: unknown) {
  if (!Array.isArray(value)) return []

  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .map(item => ({
      synonym: toStringValue(item.synonym).trim(),
      difference: toStringValue(item.difference).trim(),
    }))
    .filter(item => item.synonym || item.difference)
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

export function coerceAiWordData(value: unknown): AIWordData | null {
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

export function extractFirstBalancedJsonObject(text: string) {
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

export function tryParseLookupJson(text: string) {
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
      const aiData = coerceAiWordData(parsed)
      if (aiData) return aiData
    } catch {
      continue
    }
  }

  return null
}

export function parseLookupResponse(text: string): AIWordData {
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
