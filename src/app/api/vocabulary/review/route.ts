import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { REVIEW_GRADES, type ReviewGradeValue } from "@/lib/constants"
import { scheduleSm2Review } from "@/lib/sm2"
import type { VocabularyReviewState } from "@/types/dictionary"

const REVIEW_GRADE_VALUES = Object.values(REVIEW_GRADES) as ReviewGradeValue[]

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 })
  }

  if (!isRecord(body)) {
    return NextResponse.json({ error: "Expected JSON object" }, { status: 400 })
  }

  const { id, grade } = body

  if (typeof id !== "string" || id.trim().length === 0) {
    return NextResponse.json({ error: "Missing or invalid id" }, { status: 400 })
  }

  if (!isValidReviewGrade(grade)) {
    return NextResponse.json(
      { error: `Invalid grade. Must be one of: ${REVIEW_GRADE_VALUES.join(", ")}.` },
      { status: 400 },
    )
  }

  const entry = await prisma.vocabulary.findUnique({
    where: { id },
  })

  if (!entry) {
    return NextResponse.json({ error: "Vocabulary entry not found" }, { status: 404 })
  }

  if (!entry.reviewEnabled) {
    return NextResponse.json({ error: "Vocabulary entry is not enabled for review" }, { status: 409 })
  }

  const current: VocabularyReviewState = {
    easeFactor: entry.reviewEaseFactor,
    intervalDays: entry.reviewIntervalDays,
    repetitionCount: entry.reviewRepetitionCount,
    lapses: entry.reviewLapses,
    dueAt: entry.reviewDueAt?.toISOString() ?? null,
    lastReviewedAt: entry.reviewLastReviewedAt?.toISOString() ?? null,
  }

  const scheduled = scheduleSm2Review({ current, grade, serverNow: new Date() })

  const updated = await prisma.vocabulary.update({
    where: { id },
    data: {
      reviewEaseFactor: scheduled.reviewEaseFactor,
      reviewIntervalDays: scheduled.reviewIntervalDays,
      reviewRepetitionCount: scheduled.reviewRepetitionCount,
      reviewLapses: scheduled.reviewLapses,
      reviewDueAt: new Date(scheduled.reviewDueAt),
      reviewLastReviewedAt: new Date(scheduled.reviewLastReviewedAt),
    },
    select: {
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
    },
  })

  return NextResponse.json(toCompactRow(updated))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isValidReviewGrade(value: unknown): value is ReviewGradeValue {
  return typeof value === "number" && REVIEW_GRADE_VALUES.includes(value as ReviewGradeValue)
}

function toCompactRow(entry: {
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
}) {
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
