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

const DEFAULT_REVIEW_PLAN_ID = "default"
const DEFAULT_REVIEW_PLAN_NAME = "默认复习计划"

const LIST_SELECT = {
  id: true,
  word: true,
  phonetic: true,
  briefDefinition: true,
  chineseDefinition: true,
  notes: true,
  reviewEnabled: true,
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
  reviewEnabled: boolean
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
  const review = searchParams.get("review") ?? "all"
  const planId = searchParams.get("planId")?.trim() || null
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

  if (!isValidEnum(["all", "enabled", "disabled"] as const, review)) {
    return NextResponse.json(
      { error: "Invalid review. Must be one of: all, enabled, disabled." },
      { status: 400 },
    )
  }

  const where = buildListWhere(filter, search, review, planId)
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

  const entry = await prisma.vocabulary.upsert({
    where: { word: word.toLowerCase() },
    update: { phonetic, briefDefinition, notes },
    create: {
      word: word.toLowerCase(),
      phonetic,
      briefDefinition,
      notes,
      reviewEnabled: false,
      reviewDueAt: null,
      reviewLastReviewedAt: null,
      reviewRepetitionCount: 0,
      reviewIntervalDays: 0,
      reviewEaseFactor: 2.5,
      reviewLapses: 0,
    },
  })

  return NextResponse.json(entry)
}

export async function PATCH(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 })
  }

  if (!isRecord(body)) {
    return NextResponse.json({ error: "Expected JSON object" }, { status: 400 })
  }

  const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0) : []
  const reviewEnabled = body.reviewEnabled
  const planId = typeof body.planId === "string" && body.planId.trim().length > 0 ? body.planId.trim() : null

  if (ids.length === 0) {
    return NextResponse.json({ error: "Missing ids" }, { status: 400 })
  }

  if (typeof reviewEnabled !== "boolean") {
    return NextResponse.json({ error: "Missing or invalid reviewEnabled" }, { status: 400 })
  }

  if (reviewEnabled) {
    const targetPlanId = planId ?? DEFAULT_REVIEW_PLAN_ID
    await ensureDefaultReviewPlan()
    await prisma.reviewPlanWord.createMany({
      data: ids.map(id => ({ reviewPlanId: targetPlanId, vocabularyId: id })),
      skipDuplicates: true,
    })
    await prisma.vocabulary.updateMany({
      where: { id: { in: ids } },
      data: { reviewEnabled: true },
    })
  } else if (planId) {
    await prisma.reviewPlanWord.deleteMany({
      where: { reviewPlanId: planId, vocabularyId: { in: ids } },
    })
    await syncReviewEnabledFromMembership(ids)
  } else {
    await prisma.reviewPlanWord.deleteMany({
      where: { vocabularyId: { in: ids } },
    })
    await prisma.vocabulary.updateMany({
      where: { id: { in: ids } },
      data: { reviewEnabled: false },
    })
  }

  const entries = await prisma.vocabulary.findMany({
    where: { id: { in: ids } },
    select: LIST_SELECT,
  })

  return NextResponse.json(entries.map(toListRow))
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function getDefaultRandomSeed(): string {
  return new Date().toISOString().slice(0, 10)
}

function buildListWhere(filter: VocabularyFilterId, search: string, review: "all" | "enabled" | "disabled", planId: string | null): Record<string, unknown> {
  const conditions: Record<string, unknown>[] = []

  if (planId) conditions.push(reviewPlanCondition(planId))
  else if (review === "enabled") conditions.push({ reviewEnabled: true })
  else if (review === "disabled") conditions.push({ reviewEnabled: false })

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
      conditions.push(reviewMembershipCondition(planId))
      conditions.push({ OR: [{ reviewDueAt: null }, { reviewDueAt: { lte: now } }] })
      break
    case "new":
      conditions.push(reviewMembershipCondition(planId))
      conditions.push({ reviewRepetitionCount: 0, reviewLastReviewedAt: null })
      break
    case "learning":
      conditions.push(reviewMembershipCondition(planId))
      conditions.push({
        AND: [
          { NOT: { reviewRepetitionCount: 0, reviewLastReviewedAt: null } },
          { NOT: { reviewRepetitionCount: { gte: 5 }, reviewIntervalDays: { gte: 21 } } },
        ],
      })
      break
    case "mastered":
      conditions.push(reviewMembershipCondition(planId))
      conditions.push({ reviewRepetitionCount: { gte: 5 }, reviewIntervalDays: { gte: 21 } })
      break
    case "all":
    default:
      break
  }

  return conditions.length > 0 ? { AND: conditions } : {}
}

function reviewMembershipCondition(planId: string | null): Record<string, unknown> {
  return planId ? reviewPlanCondition(planId) : { reviewEnabled: true }
}

function reviewPlanCondition(planId: string): Record<string, unknown> {
  return { reviewPlans: { some: { reviewPlanId: planId } } }
}

async function ensureDefaultReviewPlan() {
  await prisma.reviewPlan.upsert({
    where: { id: DEFAULT_REVIEW_PLAN_ID },
    update: {},
    create: { id: DEFAULT_REVIEW_PLAN_ID, name: DEFAULT_REVIEW_PLAN_NAME, isDefault: true },
  })
}

async function syncReviewEnabledFromMembership(ids: string[]) {
  await Promise.all(ids.map(async id => {
    const membershipCount = await prisma.reviewPlanWord.count({ where: { vocabularyId: id } })
    await prisma.vocabulary.update({
      where: { id },
      data: { reviewEnabled: membershipCount > 0 },
    })
  }))
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
    reviewEnabled: entry.reviewEnabled,
    review,
    createdAt: entry.createdAt.toISOString(),
  }
}
