import { NextResponse } from "next/server"
import {
  clampLookupConcurrency,
  getLookupSettings,
  lookupWordFully,
  normalizeLookupWord,
  recordSearchHistory,
  runWorkerPool,
  type BatchLookupResult,
  type BatchLookupSuccess,
  type BatchLookupFailure,
} from "@/lib/lookup-service"

const MAX_BATCH_WORDS = 100
const MAX_UNIQUE_LOOKUP_WORDS = 50
const MAX_WORD_LENGTH = 64

type UniqueWordLookup = {
  word: string
}

type UniqueLookupResult = Omit<BatchLookupSuccess, "index"> | Omit<BatchLookupFailure, "index">

type ValidBatchWord = {
  index: number
  word: string
}

type PreparedBatchWord =
  | (ValidBatchWord & { kind: "lookup" })
  | (ValidBatchWord & { kind: "empty"; error: string })
  | (ValidBatchWord & { kind: "tooLong"; error: string })

export async function POST(request: Request) {
  let body: unknown

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 })
  }

  if (!isBatchLookupBody(body)) {
    return NextResponse.json({ error: "Expected JSON body { words: string[], concurrency?: number }" }, { status: 400 })
  }

  const settings = await getLookupSettings()
  const maxUniqueWords = Math.min(MAX_UNIQUE_LOOKUP_WORDS, Math.max(1, Math.floor(settings.batchMaxWords)))

  if (body.words.length > MAX_BATCH_WORDS) {
    return NextResponse.json(
      { error: `Too many words submitted. Maximum is ${MAX_BATCH_WORDS}.` },
      { status: 413 },
    )
  }

  const requestedWords: PreparedBatchWord[] = body.words.map((word, index) => {
    const normalizedWord = normalizeLookupWord(word)

    if (!normalizedWord) {
      return {
        index,
        word: normalizedWord,
        kind: "empty",
        error: "Word is empty after normalization",
      }
    }

    if (normalizedWord.length > MAX_WORD_LENGTH) {
      return {
        index,
        word: normalizedWord,
        kind: "tooLong",
        error: `Word exceeds maximum length of ${MAX_WORD_LENGTH}`,
      }
    }

    return {
      index,
      word: normalizedWord,
      kind: "lookup",
    }
  })

  if (requestedWords.length === 0) {
    return NextResponse.json({ results: [] })
  }

  const lookupWords = requestedWords.filter((item): item is ValidBatchWord & { kind: "lookup" } => item.kind === "lookup")

  if (lookupWords.length === 0) {
    return NextResponse.json({
      results: requestedWords.map(item => toErrorResult(item.index, item.word, item.kind === "tooLong" ? item.error : "Word is empty after normalization")),
    })
  }

  const uniqueWords = Array.from(new Set(lookupWords.map(item => item.word)))

  if (uniqueWords.length > maxUniqueWords) {
    return NextResponse.json(
      { error: `Too many unique lookup words. Maximum is ${maxUniqueWords}.` },
      { status: 413 },
    )
  }

  await recordSearchHistory(uniqueWords)

  const uniqueLookupItems = uniqueWords.map(word => ({ word }))
  const maxConcurrency = 5
  const defaultConcurrency = clampLookupConcurrency(settings.batchConcurrency, 3, maxConcurrency)
  const concurrency = clampLookupConcurrency(body.concurrency, defaultConcurrency, maxConcurrency)

  const uniqueResults = await runWorkerPool(uniqueLookupItems, concurrency, item => lookupUniqueWord(item, settings))
  const resultsByWord = new Map(uniqueResults.map(result => [result.word, result]))

  const results: BatchLookupResult[] = requestedWords.map(item => {
    if (item.kind === "empty" || item.kind === "tooLong") {
      return toErrorResult(item.index, item.word, item.error)
    }

    const { index, word } = item
    const result = resultsByWord.get(word)
    if (!result) {
      return toErrorResult(index, word, "Lookup result missing")
    }

    return { ...result, index }
  })

  return NextResponse.json({ results })
}

function isBatchLookupBody(body: unknown): body is { words: string[]; concurrency?: number } {
  if (!body || typeof body !== "object") return false
  if (!("words" in body) || !Array.isArray(body.words)) return false
  if (!body.words.every(word => typeof word === "string")) return false
  return !("concurrency" in body) || body.concurrency === undefined || typeof body.concurrency === "number"
}

function toErrorResult(index: number, word: string, error: string): BatchLookupResult {
  return {
    index,
    word,
    status: "error",
    cached: false,
    dictData: null,
    aiData: null,
    error,
  }
}

async function lookupUniqueWord(item: UniqueWordLookup, settings: Awaited<ReturnType<typeof getLookupSettings>>): Promise<UniqueLookupResult> {
  try {
    const result = await lookupWordFully(item.word, settings)
    return {
      word: item.word,
      status: result.cached ? "cached" : "success",
      cached: result.cached,
      dictData: result.dictData,
      aiData: result.aiData,
    }
  } catch {
    return {
      word: item.word,
      status: "error",
      cached: false,
      dictData: null,
      aiData: null,
      error: "Lookup failed",
    }
  }
}
