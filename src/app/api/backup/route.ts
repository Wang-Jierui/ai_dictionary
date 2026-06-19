import { NextResponse } from "next/server"
import { Prisma } from "@/generated/prisma/client"
import type { SettingsCreateManyInput } from "@/generated/prisma/models/Settings"
import type { SearchHistoryCreateManyInput } from "@/generated/prisma/models/SearchHistory"
import type { VocabularyCreateManyInput } from "@/generated/prisma/models/Vocabulary"
import type { ReviewPlanCreateManyInput } from "@/generated/prisma/models/ReviewPlan"
import type { ReviewPlanWordCreateManyInput } from "@/generated/prisma/models/ReviewPlanWord"
import type { RoleplaySessionCreateManyInput } from "@/generated/prisma/models/RoleplaySession"
import type { SceneHistoryCreateManyInput } from "@/generated/prisma/models/SceneHistory"
import type { WordChatCreateManyInput } from "@/generated/prisma/models/WordChat"
import { prisma } from "@/lib/prisma"

const APP_ID = "ai_dictionary"
const SCHEMA_VERSION = 1

const settingsSelect = {
  id: true,
  interests: true,
  customPrompt: true,
  sectionOrder: true,
  batchMaxWords: true,
  batchConcurrency: true,
  createdAt: true,
  updatedAt: true,
}

type JsonValue = Prisma.JsonValue

type RestoredSettings = {
  id?: string
  interests?: string[]
  customPrompt?: string
  sectionOrder?: JsonValue
  batchMaxWords?: number
  batchConcurrency?: number
  createdAt?: Date
  updatedAt?: Date
}

type RestoredSearchHistory = {
  id?: string
  word: string
  createdAt?: Date
}

type RestoredVocabulary = {
  id?: string
  word: string
  phonetic?: string | null
  briefDefinition: string
  chineseDefinition?: string | null
  notes?: string | null
  dictData?: JsonValue | null
  aiData?: JsonValue | null
  imageData?: string | null
  imageMode?: string | null
  reviewEnabled?: boolean
  reviewEaseFactor?: number
  reviewIntervalDays?: number
  reviewRepetitionCount?: number
  reviewLapses?: number
  reviewDueAt?: Date | null
  reviewLastReviewedAt?: Date | null
  createdAt?: Date
  updatedAt?: Date
}

type RestoredReviewPlan = {
  id?: string
  name: string
  isDefault?: boolean
  createdAt?: Date
  updatedAt?: Date
}

type RestoredReviewPlanWord = {
  reviewPlanId: string
  vocabularyId: string
  createdAt?: Date
}

type RestoredRoleplaySession = {
  id?: string
  targetWord: string
  scenario: string
  messages?: JsonValue
  createdAt?: Date
  updatedAt?: Date
}

type RestoredSceneHistory = {
  id?: string
  scene: string
  expressions: JsonValue
  dialogue: string
  culturalNotes?: string
  createdAt?: Date
}

type RestoredWordChat = {
  id?: string
  word: string
  messages?: JsonValue
  activeLeafId?: string | null
  createdAt?: Date
  updatedAt?: Date
}

type RestoredBackup = {
  settings: RestoredSettings[]
  searchHistory: RestoredSearchHistory[]
  vocabulary: RestoredVocabulary[]
  reviewPlans: RestoredReviewPlan[]
  reviewPlanWords: RestoredReviewPlanWord[]
  roleplaySessions: RestoredRoleplaySession[]
  sceneHistory: RestoredSceneHistory[]
  wordChats: RestoredWordChat[]
}

type ValidationResult =
  | { ok: true; backup: RestoredBackup }
  | { ok: false; error: string }

type RecordValue = Record<string, unknown>

class BackupValidationError extends Error {}

function verifyAdmin(request: Request) {
  const adminPassword = process.env.ADMIN_PASSWORD
  if (!adminPassword) return false
  return request.headers.get("x-admin-password") === adminPassword
}

export async function GET(request: Request) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: "未授权" }, { status: 401 })
  }

  const [
    settings,
    searchHistory,
    vocabulary,
    reviewPlans,
    reviewPlanWords,
    roleplaySessions,
    sceneHistory,
    wordChats,
  ] = await Promise.all([
    prisma.settings.findMany({ select: settingsSelect, orderBy: { id: "asc" } }),
    prisma.searchHistory.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.vocabulary.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.reviewPlan.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.reviewPlanWord.findMany({ orderBy: [{ reviewPlanId: "asc" }, { createdAt: "asc" }] }),
    prisma.roleplaySession.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.sceneHistory.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.wordChat.findMany({ orderBy: { createdAt: "asc" } }),
  ])

  const envelope = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    app: APP_ID,
    data: {
      settings,
      searchHistory,
      vocabulary,
      reviewPlans,
      reviewPlanWords,
      roleplaySessions,
      sceneHistory,
      wordChats,
    },
  }

  return new Response(JSON.stringify(envelope, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${APP_ID}_backup_${new Date().toISOString().slice(0, 10)}.json"`,
    },
  })
}

export async function POST(request: Request) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: "未授权" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown JSON parse error"
    return NextResponse.json({ error: `Malformed JSON body: ${message}` }, { status: 400 })
  }

  const parsed = validateBackupEnvelope(body)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  await prisma.$transaction(async tx => {
    const existingSettings = await tx.settings.findMany({ select: { id: true, aiEndpoints: true } })
    const existingAiEndpointsBySettingsId = new Map(existingSettings.map(row => [row.id, row.aiEndpoints]))

    await tx.reviewPlanWord.deleteMany()
    await tx.wordChat.deleteMany()
    await tx.sceneHistory.deleteMany()
    await tx.roleplaySession.deleteMany()
    await tx.reviewPlan.deleteMany()
    await tx.vocabulary.deleteMany()
    await tx.searchHistory.deleteMany()

    for (const row of parsed.backup.settings) {
      const id = row.id ?? "default"
      const data = toSettingsCreateManyInput(row, existingAiEndpointsBySettingsId.get(id) ?? [])
      await tx.settings.upsert({
        where: { id },
        update: data,
        create: { ...data, id },
      })
    }
    if (parsed.backup.searchHistory.length > 0) {
      await tx.searchHistory.createMany({ data: parsed.backup.searchHistory.map(toSearchHistoryCreateManyInput) })
    }
    if (parsed.backup.vocabulary.length > 0) {
      await tx.vocabulary.createMany({ data: parsed.backup.vocabulary.map(toVocabularyCreateManyInput) })
    }
    if (parsed.backup.reviewPlans.length > 0) {
      await tx.reviewPlan.createMany({ data: parsed.backup.reviewPlans.map(toReviewPlanCreateManyInput) })
    }
    if (parsed.backup.roleplaySessions.length > 0) {
      await tx.roleplaySession.createMany({ data: parsed.backup.roleplaySessions.map(toRoleplaySessionCreateManyInput) })
    }
    if (parsed.backup.sceneHistory.length > 0) {
      await tx.sceneHistory.createMany({ data: parsed.backup.sceneHistory.map(toSceneHistoryCreateManyInput) })
    }
    if (parsed.backup.wordChats.length > 0) {
      await tx.wordChat.createMany({ data: parsed.backup.wordChats.map(toWordChatCreateManyInput) })
    }
    if (parsed.backup.reviewPlanWords.length > 0) {
      await tx.reviewPlanWord.createMany({ data: parsed.backup.reviewPlanWords.map(toReviewPlanWordCreateManyInput) })
    }
  })

  return NextResponse.json({
    success: true,
    imported: {
      settings: parsed.backup.settings.length,
      searchHistory: parsed.backup.searchHistory.length,
      vocabulary: parsed.backup.vocabulary.length,
      reviewPlans: parsed.backup.reviewPlans.length,
      reviewPlanWords: parsed.backup.reviewPlanWords.length,
      roleplaySessions: parsed.backup.roleplaySessions.length,
      sceneHistory: parsed.backup.sceneHistory.length,
      wordChats: parsed.backup.wordChats.length,
    },
  })
}

function validateBackupEnvelope(value: unknown): ValidationResult {
  try {
    if (!isRecord(value)) throw new BackupValidationError("Backup must be a JSON object")
    if (value.schemaVersion !== SCHEMA_VERSION) throw new BackupValidationError("Unsupported backup schemaVersion")
    if (value.app !== APP_ID) throw new BackupValidationError("Backup app does not match ai_dictionary")
    const data = readRecord(value, "data")

    return {
      ok: true,
      backup: {
        settings: readArray(data, "settings").map(parseSettings),
        searchHistory: readArray(data, "searchHistory").map(parseSearchHistory),
        vocabulary: readArray(data, "vocabulary").map(parseVocabulary),
        reviewPlans: readArray(data, "reviewPlans").map(parseReviewPlan),
        reviewPlanWords: readArray(data, "reviewPlanWords").map(parseReviewPlanWord),
        roleplaySessions: readArray(data, "roleplaySessions").map(parseRoleplaySession),
        sceneHistory: readArray(data, "sceneHistory").map(parseSceneHistory),
        wordChats: readArray(data, "wordChats").map(parseWordChat),
      },
    }
  } catch (error) {
    const message = error instanceof BackupValidationError ? error.message : "Malformed backup data"
    return { ok: false, error: message }
  }
}

function parseSettings(record: RecordValue): RestoredSettings {
  return {
    id: optionalString(record, "id"),
    interests: optionalStringArray(record, "interests"),
    customPrompt: optionalString(record, "customPrompt"),
    sectionOrder: optionalJson(record, "sectionOrder"),
    batchMaxWords: optionalInteger(record, "batchMaxWords"),
    batchConcurrency: optionalInteger(record, "batchConcurrency"),
    createdAt: optionalDate(record, "createdAt"),
    updatedAt: optionalDate(record, "updatedAt"),
  }
}

function parseSearchHistory(record: RecordValue): RestoredSearchHistory {
  return {
    id: optionalString(record, "id"),
    word: requiredString(record, "word"),
    createdAt: optionalDate(record, "createdAt"),
  }
}

function parseVocabulary(record: RecordValue): RestoredVocabulary {
  return {
    id: optionalString(record, "id"),
    word: requiredString(record, "word"),
    phonetic: optionalNullableString(record, "phonetic"),
    briefDefinition: requiredString(record, "briefDefinition"),
    chineseDefinition: optionalNullableString(record, "chineseDefinition"),
    notes: optionalNullableString(record, "notes"),
    dictData: optionalNullableJson(record, "dictData"),
    aiData: optionalNullableJson(record, "aiData"),
    imageData: optionalNullableString(record, "imageData"),
    imageMode: optionalNullableString(record, "imageMode"),
    reviewEnabled: optionalBoolean(record, "reviewEnabled"),
    reviewEaseFactor: optionalNumber(record, "reviewEaseFactor"),
    reviewIntervalDays: optionalInteger(record, "reviewIntervalDays"),
    reviewRepetitionCount: optionalInteger(record, "reviewRepetitionCount"),
    reviewLapses: optionalInteger(record, "reviewLapses"),
    reviewDueAt: optionalNullableDate(record, "reviewDueAt"),
    reviewLastReviewedAt: optionalNullableDate(record, "reviewLastReviewedAt"),
    createdAt: optionalDate(record, "createdAt"),
    updatedAt: optionalDate(record, "updatedAt"),
  }
}

function parseReviewPlan(record: RecordValue): RestoredReviewPlan {
  return {
    id: optionalString(record, "id"),
    name: requiredString(record, "name"),
    isDefault: optionalBoolean(record, "isDefault"),
    createdAt: optionalDate(record, "createdAt"),
    updatedAt: optionalDate(record, "updatedAt"),
  }
}

function parseReviewPlanWord(record: RecordValue): RestoredReviewPlanWord {
  return {
    reviewPlanId: requiredString(record, "reviewPlanId"),
    vocabularyId: requiredString(record, "vocabularyId"),
    createdAt: optionalDate(record, "createdAt"),
  }
}

function parseRoleplaySession(record: RecordValue): RestoredRoleplaySession {
  return {
    id: optionalString(record, "id"),
    targetWord: requiredString(record, "targetWord"),
    scenario: requiredString(record, "scenario"),
    messages: optionalJson(record, "messages"),
    createdAt: optionalDate(record, "createdAt"),
    updatedAt: optionalDate(record, "updatedAt"),
  }
}

function parseSceneHistory(record: RecordValue): RestoredSceneHistory {
  return {
    id: optionalString(record, "id"),
    scene: requiredString(record, "scene"),
    expressions: requiredJson(record, "expressions"),
    dialogue: requiredString(record, "dialogue"),
    culturalNotes: optionalString(record, "culturalNotes"),
    createdAt: optionalDate(record, "createdAt"),
  }
}

function parseWordChat(record: RecordValue): RestoredWordChat {
  return {
    id: optionalString(record, "id"),
    word: requiredString(record, "word"),
    messages: optionalJson(record, "messages"),
    activeLeafId: optionalNullableString(record, "activeLeafId"),
    createdAt: optionalDate(record, "createdAt"),
    updatedAt: optionalDate(record, "updatedAt"),
  }
}

function toSettingsCreateManyInput(row: RestoredSettings, aiEndpoints: JsonValue): SettingsCreateManyInput {
  return withoutUndefined({
    id: row.id,
    interests: row.interests,
    customPrompt: row.customPrompt,
    aiEndpoints: toRequiredJsonInput(aiEndpoints),
    sectionOrder: row.sectionOrder === undefined ? undefined : toRequiredJsonInput(row.sectionOrder),
    batchMaxWords: row.batchMaxWords,
    batchConcurrency: row.batchConcurrency,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })
}

function toSearchHistoryCreateManyInput(row: RestoredSearchHistory): SearchHistoryCreateManyInput {
  return withoutUndefined({ id: row.id, word: row.word, createdAt: row.createdAt })
}

function toVocabularyCreateManyInput(row: RestoredVocabulary): VocabularyCreateManyInput {
  return withoutUndefined({
    id: row.id,
    word: row.word,
    phonetic: row.phonetic,
    briefDefinition: row.briefDefinition,
    chineseDefinition: row.chineseDefinition,
    notes: row.notes,
    dictData: row.dictData === undefined ? undefined : toNullableJsonInput(row.dictData),
    aiData: row.aiData === undefined ? undefined : toNullableJsonInput(row.aiData),
    imageData: row.imageData,
    imageMode: row.imageMode,
    reviewEnabled: row.reviewEnabled,
    reviewEaseFactor: row.reviewEaseFactor,
    reviewIntervalDays: row.reviewIntervalDays,
    reviewRepetitionCount: row.reviewRepetitionCount,
    reviewLapses: row.reviewLapses,
    reviewDueAt: row.reviewDueAt,
    reviewLastReviewedAt: row.reviewLastReviewedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })
}

function toReviewPlanCreateManyInput(row: RestoredReviewPlan): ReviewPlanCreateManyInput {
  return withoutUndefined({
    id: row.id,
    name: row.name,
    isDefault: row.isDefault,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })
}

function toReviewPlanWordCreateManyInput(row: RestoredReviewPlanWord): ReviewPlanWordCreateManyInput {
  return withoutUndefined({ reviewPlanId: row.reviewPlanId, vocabularyId: row.vocabularyId, createdAt: row.createdAt })
}

function toRoleplaySessionCreateManyInput(row: RestoredRoleplaySession): RoleplaySessionCreateManyInput {
  return withoutUndefined({
    id: row.id,
    targetWord: row.targetWord,
    scenario: row.scenario,
    messages: row.messages === undefined ? undefined : toRequiredJsonInput(row.messages),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })
}

function toSceneHistoryCreateManyInput(row: RestoredSceneHistory): SceneHistoryCreateManyInput {
  return withoutUndefined({
    id: row.id,
    scene: row.scene,
    expressions: toRequiredJsonInput(row.expressions),
    dialogue: row.dialogue,
    culturalNotes: row.culturalNotes,
    createdAt: row.createdAt,
  })
}

function toWordChatCreateManyInput(row: RestoredWordChat): WordChatCreateManyInput {
  return withoutUndefined({
    id: row.id,
    word: row.word,
    messages: row.messages === undefined ? undefined : toRequiredJsonInput(row.messages),
    activeLeafId: row.activeLeafId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  for (const key of Object.keys(value)) {
    if (value[key] === undefined) delete value[key]
  }
  return value
}

function toRequiredJsonInput(value: JsonValue): Prisma.JsonNullValueInput | Prisma.InputJsonValue {
  return value === null ? Prisma.JsonNull : value
}

function toNullableJsonInput(value: JsonValue | null): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue {
  return value === null ? Prisma.DbNull : value
}

function readRecord(record: RecordValue, key: string): RecordValue {
  const value = record[key]
  if (!isRecord(value)) throw new BackupValidationError(`${key} must be an object`)
  return value
}

function readArray(record: RecordValue, key: string): RecordValue[] {
  const value = record[key]
  if (!Array.isArray(value)) throw new BackupValidationError(`data.${key} must be an array`)
  return value.map((item, index) => {
    if (!isRecord(item)) throw new BackupValidationError(`data.${key}[${index}] must be an object`)
    return item
  })
}

function requiredString(record: RecordValue, key: string): string {
  const value = record[key]
  if (typeof value !== "string") throw new BackupValidationError(`${key} must be a string`)
  return value
}

function optionalString(record: RecordValue, key: string): string | undefined {
  const value = record[key]
  if (value === undefined) return undefined
  if (typeof value !== "string") throw new BackupValidationError(`${key} must be a string`)
  return value
}

function optionalNullableString(record: RecordValue, key: string): string | null | undefined {
  const value = record[key]
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== "string") throw new BackupValidationError(`${key} must be a string or null`)
  return value
}

function optionalStringArray(record: RecordValue, key: string): string[] | undefined {
  const value = record[key]
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.some(item => typeof item !== "string")) {
    throw new BackupValidationError(`${key} must be an array of strings`)
  }
  return value
}

function optionalBoolean(record: RecordValue, key: string): boolean | undefined {
  const value = record[key]
  if (value === undefined) return undefined
  if (typeof value !== "boolean") throw new BackupValidationError(`${key} must be a boolean`)
  return value
}

function optionalNumber(record: RecordValue, key: string): number | undefined {
  const value = record[key]
  if (value === undefined) return undefined
  if (typeof value !== "number" || !Number.isFinite(value)) throw new BackupValidationError(`${key} must be a finite number`)
  return value
}

function optionalInteger(record: RecordValue, key: string): number | undefined {
  const value = optionalNumber(record, key)
  if (value !== undefined && !Number.isInteger(value)) throw new BackupValidationError(`${key} must be an integer`)
  return value
}

function optionalDate(record: RecordValue, key: string): Date | undefined {
  const value = record[key]
  if (value === undefined) return undefined
  if (typeof value !== "string") throw new BackupValidationError(`${key} must be an ISO date string`)
  return parseDate(value, key)
}

function optionalNullableDate(record: RecordValue, key: string): Date | null | undefined {
  const value = record[key]
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== "string") throw new BackupValidationError(`${key} must be an ISO date string or null`)
  return parseDate(value, key)
}

function parseDate(value: string, key: string): Date {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new BackupValidationError(`${key} must be a valid date`)
  return date
}

function requiredJson(record: RecordValue, key: string): JsonValue {
  const value = record[key]
  if (!isJsonValue(value)) throw new BackupValidationError(`${key} must be valid JSON`)
  return value
}

function optionalJson(record: RecordValue, key: string): JsonValue | undefined {
  const value = record[key]
  if (value === undefined) return undefined
  if (!isJsonValue(value)) throw new BackupValidationError(`${key} must be valid JSON`)
  return value
}

function optionalNullableJson(record: RecordValue, key: string): JsonValue | null | undefined {
  const value = record[key]
  if (value === undefined) return undefined
  if (value === null) return null
  if (!isJsonValue(value)) throw new BackupValidationError(`${key} must be valid JSON or null`)
  return value
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true
  if (["string", "boolean"].includes(typeof value)) return true
  if (typeof value === "number") return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isJsonValue)
  if (!isRecord(value)) return false
  return Object.values(value).every(isJsonValue)
}
