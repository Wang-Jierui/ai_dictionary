import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  VOCABULARY_SORT_IDS,
  VOCABULARY_FILTER_IDS,
  SORT_ORDERS,
  type VocabularySortId,
  type VocabularyFilterId,
  type SortOrder,
} from "@/lib/constants"
import type { VocabularyReviewState } from "@/types/dictionary"

const LIST_SELECT = {
  id: true,
  word: true,
  phonetic: true,
  briefDefinition: true,
  chineseDefinition: true,
  notes: true,
  reviewEaseFactor: true,
  reviewIntervalDays: true,
  reviewRepetitionCount: true,
  reviewLapses: true,
  reviewDueAt: true,
  reviewLastReviewedAt: true,
  createdAt: true,
}

type ListEntry = {
  id: string
  word: string
  phonetic: string | null
  briefDefinition: string
  chineseDefinition: string | null
  notes: string | null
  reviewEaseFactor: number
  reviewIntervalDays: number
  reviewRepetitionCount: number
  reviewLapses: number
  reviewDueAt: Date | null
  reviewLastReviewedAt: Date | null
  createdAt: Date
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const word = searchParams.get("word")?.trim().toLowerCase()
  const id = searchParams.get("id")

  if (word || id) {
    const entry = await prisma.vocabulary.findFirst({
      where: id ? { id } : { word },
    })
    if (!entry) {
      return NextResponse.json({ error: "Vocabulary entry not found" }, { status: 404 })
    }
    return NextResponse.json(entry)
  }

  const sort = searchParams.get("sort") ?? "created"
  const order = searchParams.get("order") ?? "desc"
  const filter = searchParams.get("filter") ?? "all"
  const search = searchParams.get("search")?.trim() ?? ""
  const randomSeed = searchParams.get("randomSeed") ?? getDefaultRandomSeed()

  if (!isValidEnum(VOCABULARY_SORT_IDS, sort)) {
    return NextResponse.json(
      { error: `Invalid sort. Must be one of: ${VOCABULARY_SORT_IDS.join(", ")}.` },
      { status: 400 },
    )
  }

  if (!isValidEnum(SORT_ORDERS, order)) {
    return NextResponse.json(
      { error: `Invalid order. Must be one of: ${SORT_ORDERS.join(", ")}.` },
      { status: 400 },
    )
  }

  if (!isValidEnum(VOCABULARY_FILTER_IDS, filter)) {
    return NextResponse.json(
      { error: `Invalid filter. Must be one of: ${VOCABULARY_FILTER_IDS.join(", ")}.` },
      { status: 400 },
    )
  }

  const where = buildListWhere(filter, search)
  const entries = await prisma.vocabulary.findMany({
    where,
    select: LIST_SELECT,
  })

  const sorted = sortListEntries(entries, sort, order, randomSeed)
  return NextResponse.json(sorted.map(toListRow))
}

export async function POST(request: Request) {
  const { word, phonetic, briefDefinition, notes } = await request.json()

  if (!word || !briefDefinition) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  const now = new Date()

  const entry = await prisma.vocabulary.upsert({
    where: { word: word.toLowerCase() },
    update: { phonetic, briefDefinition, notes },
    create: {
      word: word.toLowerCase(),
      phonetic,
      briefDefinition,
      notes,
      reviewDueAt: now,
      reviewLastReviewedAt: null,
      reviewRepetitionCount: 0,
      reviewIntervalDays: 0,
      reviewEaseFactor: 2.5,
      reviewLapses: 0,
    },
  })

  return NextResponse.json(entry)
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  const word = searchParams.get("word")?.trim().toLowerCase()

  if (!id && !word) {
    return NextResponse.json({ error: "Missing id or word" }, { status: 400 })
  }

  const entry = id
    ? await prisma.vocabulary.findUnique({ where: { id }, select: { id: true, word: true } })
    : word
      ? await prisma.vocabulary.findUnique({ where: { word }, select: { id: true, word: true } })
      : null

  if (!entry) {
    return NextResponse.json({ error: "Vocabulary entry not found" }, { status: 404 })
  }

  await prisma.vocabulary.delete({ where: { id: entry.id } })

  await prisma.wordChat.deleteMany({ where: { word: entry.word } })

  return NextResponse.json({ success: true })
}

function isValidEnum<T extends readonly string[]>(values: T, value: string): value is T[number] {
  return values.includes(value)
}

function getDefaultRandomSeed(): string {
  return new Date().toISOString().slice(0, 10)
}

function buildListWhere(filter: VocabularyFilterId, search: string): Record<string, unknown> {
  const conditions: Record<string, unknown>[] = []

  if (search) {
    conditions.push({
      OR: [
        { word: { contains: search, mode: "insensitive" } },
        { briefDefinition: { contains: search, mode: "insensitive" } },
        { chineseDefinition: { contains: search, mode: "insensitive" } },
        { notes: { contains: search, mode: "insensitive" } },
      ],
    })
  }

  const now = new Date()

  switch (filter) {
    case "due":
      conditions.push({ OR: [{ reviewDueAt: null }, { reviewDueAt: { lte: now } }] })
      break
    case "new":
      conditions.push({ reviewRepetitionCount: 0, reviewLastReviewedAt: null })
      break
    case "learning":
      conditions.push({
        AND: [
          { NOT: { reviewRepetitionCount: 0, reviewLastReviewedAt: null } },
          { NOT: { reviewRepetitionCount: { gte: 5 }, reviewIntervalDays: { gte: 21 } } },
        ],
      })
      break
    case "mastered":
      conditions.push({ reviewRepetitionCount: { gte: 5 }, reviewIntervalDays: { gte: 21 } })
      break
    case "all":
    default:
      break
  }

  return conditions.length > 0 ? { AND: conditions } : {}
}

function sortListEntries(
  entries: ListEntry[],
  sort: VocabularySortId,
  order: SortOrder,
  randomSeed: string,
) {
  if (sort === "random") {
    return seededShuffle(entries, randomSeed)
  }

  const sorted = [...entries].sort((a, b) => {
    switch (sort) {
      case "alpha":
        return a.word.localeCompare(b.word)
      case "due": {
        const aDue = a.reviewDueAt?.getTime() ?? Number.POSITIVE_INFINITY
        const bDue = b.reviewDueAt?.getTime() ?? Number.POSITIVE_INFINITY
        if (aDue !== bDue) return aDue - bDue
        break
      }
      case "created":
      default:
        break
    }

    return a.createdAt.getTime() - b.createdAt.getTime()
  })

  if (order === "desc") {
    sorted.reverse()
  }

  return sorted
}

function seededShuffle<T>(items: T[], seed: string): T[] {
  const copy = [...items]
  const state = hashStringToSeed(seed)
  const prng = mulberry32(state)

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const random = prng()
    const swapIndex = Math.floor(random * (index + 1))
    ;[copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]]
  }

  return copy
}

function hashStringToSeed(text: string): number {
  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charCodeAt(index)
    hash = (hash << 5) - hash + char
    hash |= 0
  }
  return hash === 0 ? 1 : hash
}

function mulberry32(seed: number) {
  let state = seed
  return function next() {
    let value = (state += 0x6D2B79F5)
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function toListRow(entry: ListEntry) {
  const review: VocabularyReviewState = {
    easeFactor: entry.reviewEaseFactor,
    intervalDays: entry.reviewIntervalDays,
    repetitionCount: entry.reviewRepetitionCount,
    lapses: entry.reviewLapses,
    dueAt: entry.reviewDueAt?.toISOString() ?? null,
    lastReviewedAt: entry.reviewLastReviewedAt?.toISOString() ?? null,
  }

  return {
    id: entry.id,
    word: entry.word,
    phonetic: entry.phonetic,
    briefDefinition: entry.briefDefinition,
    chineseDefinition: entry.chineseDefinition,
    notes: entry.notes,
    review,
    createdAt: entry.createdAt.toISOString(),
  }
}
