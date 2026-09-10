import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST as analyze } from "./route"
import { POST as ask } from "../sentence-chat/route"
import { GET as history, DELETE as remove } from "../../sentence/history/route"

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(), getModelForTask: vi.fn(),
  sentenceAnalysis: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
}))
vi.mock("ai", () => ({ generateText: mocks.generateText }))
vi.mock("@/lib/ai", () => ({ getModelForTask: mocks.getModelForTask }))
vi.mock("@/lib/prisma", () => ({ prisma: { sentenceAnalysis: mocks.sentenceAnalysis } }))

const analysis = {
  translation: "直到回来我才意识到。", overview: "描述事后意识到某事。",
  chunks: [{ text: "I came back", explanation: "我回来了" }],
  difficulties: [], structure: "时间状语从句", contextNote: "",
}
const saved = {
  id: "sentence-1", sentence: "I didn't realize it until I came back.", context: "An old hometown.", source: "Book p. 12",
  analysis, messages: [], version: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
}
const post = (body: unknown) => new Request("http://localhost/api/ai/sentence", { method: "POST", body: JSON.stringify(body) })

describe("sentence analysis, follow-ups and history", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.getModelForTask.mockResolvedValue("sentence-model")
    mocks.generateText.mockResolvedValue({ text: JSON.stringify(analysis) })
    mocks.sentenceAnalysis.create.mockResolvedValue(saved)
    mocks.sentenceAnalysis.findUnique.mockResolvedValue(saved)
    mocks.sentenceAnalysis.updateMany.mockResolvedValue({ count: 1 })
  })

  it("saves complete explanations, original context and source before reporting success", async () => {
    const response = await analyze(post({ sentence: saved.sentence, context: saved.context, source: saved.source }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(saved)
    expect(mocks.getModelForTask).toHaveBeenCalledWith("sentence")
    expect(mocks.sentenceAnalysis.create).toHaveBeenCalledWith({ data: {
      sentence: saved.sentence, context: saved.context, source: saved.source, analysis,
    } })
    expect(mocks.generateText.mock.calls[0][0].prompt).toContain(saved.context)
  })
  it("does not call the model on blank or malformed input", async () => {
    expect((await analyze(post({ sentence: "  " }))).status).toBe(400)
    expect((await analyze(new Request("http://localhost", { method: "POST", body: "{" }))).status).toBe(400)
    expect(mocks.generateText).not.toHaveBeenCalled()
  })
  it("does not persist partial model responses", async () => {
    mocks.generateText.mockResolvedValue({ text: '{"translation":"only translation"}' })
    expect((await analyze(post({ sentence: saved.sentence }))).status).toBe(422)
    expect(mocks.sentenceAnalysis.create).not.toHaveBeenCalled()
  })
  it("reports persistence failure instead of claiming the history was saved", async () => {
    mocks.sentenceAnalysis.create.mockRejectedValue(new Error("database unavailable"))
    expect((await analyze(post({ sentence: saved.sentence }))).status).toBe(502)
  })
  it("answers with stored context, quoted fragment and prior conversation, saving both turns", async () => {
    const previous = [{ id: "m1", role: "user", content: "it refers to my hometown", createdAt: saved.createdAt }]
    mocks.sentenceAnalysis.findUnique.mockResolvedValue({ ...saved, messages: previous })
    mocks.generateText.mockResolvedValue({ text: "这里 until 与否定连用。" })
    const response = await ask(post({ id: saved.id, question: "为什么用 until？", fragment: "until", version: 0 }))
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.version).toBe(1)
    expect(data.messages).toHaveLength(3)
    expect(data.messages[1]).toMatchObject({ role: "user", fragment: "until", content: "为什么用 until？" })
    expect(data.messages[2]).toMatchObject({ role: "assistant", content: "这里 until 与否定连用。" })
    expect(mocks.generateText.mock.calls[0][0]).toMatchObject({
      system: expect.stringContaining(saved.sentence),
      messages: [{ role: "user", content: previous[0].content }, { role: "user", content: expect.stringContaining("引用原句片段：until") }],
    })
    expect(mocks.sentenceAnalysis.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: saved.id, version: 0 } }))
  })
  it("rejects stale tabs and fragments not in the original sentence before generating", async () => {
    expect((await ask(post({ id: saved.id, question: "why?", version: 4 }))).status).toBe(409)
    expect((await ask(post({ id: saved.id, question: "why?", fragment: "invented phrase", version: 0 }))).status).toBe(400)
    expect(mocks.generateText).not.toHaveBeenCalled()
  })
  it("does not overwrite a conversation changed while a reply was generating", async () => {
    mocks.generateText.mockResolvedValue({ text: "answer" })
    mocks.sentenceAnalysis.updateMany.mockResolvedValue({ count: 0 })
    expect((await ask(post({ id: saved.id, question: "why?", version: 0 }))).status).toBe(409)
  })
  it("keeps failed and empty replies out of saved messages", async () => {
    mocks.generateText.mockRejectedValueOnce(new Error("provider failed")).mockResolvedValueOnce({ text: " " })
    expect((await ask(post({ id: saved.id, question: "why?", version: 0 }))).status).toBe(502)
    expect((await ask(post({ id: saved.id, question: "why?", version: 0 }))).status).toBe(502)
    expect(mocks.sentenceAnalysis.updateMany).not.toHaveBeenCalled()
  })
  it("restores history with its conversation and paginates compact list rows", async () => {
    expect(await (await history(new Request(`http://localhost/api/sentence/history?id=${saved.id}`))).json()).toEqual(saved)
    mocks.sentenceAnalysis.findMany.mockResolvedValue(Array.from({ length: 21 }, (_, i) => ({ ...saved, id: String(i) })))
    const response = await history(new Request("http://localhost/api/sentence/history?q=Book&offset=20"))
    const data = await response.json()
    expect(data.items).toHaveLength(20)
    expect(data.nextOffset).toBe(40)
    expect(mocks.sentenceAnalysis.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 21, select: expect.not.objectContaining({ analysis: true, messages: true }) }))
  })
  it("validates list pagination and handles deleted history gracefully", async () => {
    expect((await history(new Request("http://localhost/api/sentence/history?offset=-1"))).status).toBe(400)
    mocks.sentenceAnalysis.findUnique.mockResolvedValue(null)
    expect((await history(new Request("http://localhost/api/sentence/history?id=gone"))).status).toBe(404)
    expect((await ask(post({ id: "gone", question: "why?", version: 0 }))).status).toBe(404)
    expect((await remove(new Request("http://localhost/api/sentence/history"))).status).toBe(400)
    expect((await remove(new Request("http://localhost/api/sentence/history?id=gone"))).status).toBe(200)
  })
})
