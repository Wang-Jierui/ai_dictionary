import { beforeEach, describe, expect, it, vi } from "vitest"
import { GET, POST } from "./route"

const mockPrisma = vi.hoisted(() => {
  const table = () => ({
    findMany: vi.fn(),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
    upsert: vi.fn().mockResolvedValue({}),
  })

  return {
    settings: table(),
    searchHistory: table(),
    vocabulary: table(),
    reviewPlan: table(),
    reviewPlanWord: table(),
    roleplaySession: table(),
    sceneHistory: table(),
    wordChat: table(),
    userApiConfig: table(),
    $transaction: vi.fn(),
  }
})

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}))

type TransactionCallback = (client: typeof mockPrisma) => Promise<unknown>

const backupEnvelope = {
  schemaVersion: 1,
  exportedAt: "2026-06-18T00:00:00.000Z",
  app: "ai_dictionary",
  data: {
    settings: [
      {
        id: "default",
        interests: ["编程"],
        customPrompt: "short",
        aiEndpoints: [{ apiKey: "must-not-import" }],
        sectionOrder: ["coreImage"],
        batchMaxWords: 100,
        batchConcurrency: 2,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z",
      },
    ],
    searchHistory: [
      { id: "history-1", word: "apple", createdAt: "2026-06-03T00:00:00.000Z" },
    ],
    vocabulary: [
      {
        id: "vocab-1",
        word: "apple",
        phonetic: "ˈæp.əl",
        briefDefinition: "a round fruit",
        chineseDefinition: "苹果",
        notes: "note",
        dictData: { source: "dict" },
        aiData: { chineseDefinition: "苹果" },
        imageData: null,
        imageMode: null,
        reviewEnabled: true,
        reviewEaseFactor: 2.5,
        reviewIntervalDays: 3,
        reviewRepetitionCount: 2,
        reviewLapses: 0,
        reviewDueAt: "2026-06-20T00:00:00.000Z",
        reviewLastReviewedAt: "2026-06-17T00:00:00.000Z",
        createdAt: "2026-06-04T00:00:00.000Z",
        updatedAt: "2026-06-05T00:00:00.000Z",
      },
    ],
    reviewPlans: [
      {
        id: "plan-1",
        name: "默认复习计划",
        isDefault: true,
        createdAt: "2026-06-06T00:00:00.000Z",
        updatedAt: "2026-06-07T00:00:00.000Z",
      },
    ],
    reviewPlanWords: [
      { reviewPlanId: "plan-1", vocabularyId: "vocab-1", createdAt: "2026-06-08T00:00:00.000Z" },
    ],
    roleplaySessions: [
      {
        id: "roleplay-1",
        targetWord: "apple",
        scenario: "market",
        messages: [{ role: "user", content: "hi" }],
        createdAt: "2026-06-09T00:00:00.000Z",
        updatedAt: "2026-06-10T00:00:00.000Z",
      },
    ],
    sceneHistory: [
      {
        id: "scene-1",
        scene: "airport",
        expressions: [{ text: "check in" }],
        dialogue: "hello",
        culturalNotes: "notes",
        createdAt: "2026-06-11T00:00:00.000Z",
      },
    ],
    wordChats: [
      {
        id: "chat-1",
        word: "apple",
        messages: [{ id: "m1" }],
        activeLeafId: "m1",
        createdAt: "2026-06-12T00:00:00.000Z",
        updatedAt: "2026-06-13T00:00:00.000Z",
      },
    ],
  },
}

describe("/api/backup", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ADMIN_PASSWORD = "admin-secret"
    mockPrisma.$transaction.mockImplementation((callback: TransactionCallback) => callback(mockPrisma))
  })

  it("exports all non-sensitive datasets without API endpoints or user configs", async () => {
    mockPrisma.settings.findMany.mockResolvedValue([
      {
        id: "default",
        interests: ["编程"],
        customPrompt: "short",
        sectionOrder: ["coreImage"],
        batchMaxWords: 50,
        batchConcurrency: 3,
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
        updatedAt: new Date("2026-06-02T00:00:00.000Z"),
      },
    ])
    mockPrisma.searchHistory.findMany.mockResolvedValue([{ id: "history-1", word: "apple", createdAt: new Date("2026-06-03T00:00:00.000Z") }])
    mockPrisma.vocabulary.findMany.mockResolvedValue([{ id: "vocab-1", word: "apple", briefDefinition: "fruit" }])
    mockPrisma.reviewPlan.findMany.mockResolvedValue([{ id: "plan-1", name: "default" }])
    mockPrisma.reviewPlanWord.findMany.mockResolvedValue([{ reviewPlanId: "plan-1", vocabularyId: "vocab-1" }])
    mockPrisma.roleplaySession.findMany.mockResolvedValue([{ id: "roleplay-1", targetWord: "apple" }])
    mockPrisma.sceneHistory.findMany.mockResolvedValue([{ id: "scene-1", scene: "airport" }])
    mockPrisma.wordChat.findMany.mockResolvedValue([{ id: "chat-1", word: "apple" }])

    const response = await GET(new Request("http://localhost/api/backup", {
      headers: { "x-admin-password": "admin-secret" },
    }))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Disposition")).toContain("attachment")
    expect(response.headers.get("Content-Type")).toContain("application/json")
    expect(data).toMatchObject({ schemaVersion: 1, app: "ai_dictionary" })
    expect(data.data).toMatchObject({
      settings: expect.any(Array),
      searchHistory: expect.any(Array),
      vocabulary: expect.any(Array),
      reviewPlans: expect.any(Array),
      reviewPlanWords: expect.any(Array),
      roleplaySessions: expect.any(Array),
      sceneHistory: expect.any(Array),
      wordChats: expect.any(Array),
    })
    expect(data.data.settings[0]).not.toHaveProperty("aiEndpoints")
    expect(data.data).not.toHaveProperty("userApiConfig")
    expect(mockPrisma.settings.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.not.objectContaining({ aiEndpoints: true }),
    }))
    expect(mockPrisma.userApiConfig.findMany).not.toHaveBeenCalled()
  })

  it("imports through a transaction, replaces included tables, excludes user configs, preserves API endpoints, and creates relations last", async () => {
    mockPrisma.settings.findMany.mockResolvedValue([
      {
        id: "default",
        aiEndpoints: [{ id: "local-endpoint", apiKey: "keep-local-key" }],
      },
    ])

    const response = await POST(new Request("http://localhost/api/backup", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": "admin-secret" },
      body: JSON.stringify(backupEnvelope),
    }))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)

    expect(mockPrisma.reviewPlanWord.deleteMany).toHaveBeenCalled()
    expect(mockPrisma.wordChat.deleteMany).toHaveBeenCalled()
    expect(mockPrisma.sceneHistory.deleteMany).toHaveBeenCalled()
    expect(mockPrisma.roleplaySession.deleteMany).toHaveBeenCalled()
    expect(mockPrisma.reviewPlan.deleteMany).toHaveBeenCalled()
    expect(mockPrisma.vocabulary.deleteMany).toHaveBeenCalled()
    expect(mockPrisma.searchHistory.deleteMany).toHaveBeenCalled()
    expect(mockPrisma.settings.deleteMany).not.toHaveBeenCalled()
    expect(mockPrisma.userApiConfig.deleteMany).not.toHaveBeenCalled()
    expect(mockPrisma.userApiConfig.createMany).not.toHaveBeenCalled()

    expect(mockPrisma.settings.upsert).toHaveBeenCalledWith({
      where: { id: "default" },
      update: expect.objectContaining({
        interests: ["编程"],
        customPrompt: "short",
        aiEndpoints: [{ id: "local-endpoint", apiKey: "keep-local-key" }],
        sectionOrder: ["coreImage"],
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
        updatedAt: new Date("2026-06-02T00:00:00.000Z"),
      }),
      create: expect.objectContaining({
        id: "default",
        aiEndpoints: [{ id: "local-endpoint", apiKey: "keep-local-key" }],
      }),
    })

    expect(mockPrisma.vocabulary.createMany.mock.invocationCallOrder[0]).toBeLessThan(mockPrisma.reviewPlanWord.createMany.mock.invocationCallOrder[0])
    expect(mockPrisma.reviewPlan.createMany.mock.invocationCallOrder[0]).toBeLessThan(mockPrisma.reviewPlanWord.createMany.mock.invocationCallOrder[0])
    expect(mockPrisma.reviewPlanWord.createMany).toHaveBeenCalledWith({
      data: [{ reviewPlanId: "plan-1", vocabularyId: "vocab-1", createdAt: new Date("2026-06-08T00:00:00.000Z") }],
    })
  })

  it("returns 400 for malformed import payloads", async () => {
    const response = await POST(new Request("http://localhost/api/backup", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": "admin-secret" },
      body: JSON.stringify({ schemaVersion: 1, app: "ai_dictionary", data: { settings: {} } }),
    }))
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toContain("must be an array")
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it("requires admin authorization for export and import", async () => {
    const exportResponse = await GET(new Request("http://localhost/api/backup"))
    const importResponse = await POST(new Request("http://localhost/api/backup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(backupEnvelope),
    }))

    expect(exportResponse.status).toBe(401)
    expect(importResponse.status).toBe(401)
    expect(mockPrisma.settings.findMany).not.toHaveBeenCalled()
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })
})
