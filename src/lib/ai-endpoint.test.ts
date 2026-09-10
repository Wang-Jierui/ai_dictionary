import { beforeEach, describe, expect, it, vi } from "vitest"
import { getEndpointForTask } from "./ai"
import type { AIEndpointConfig } from "@/types/dictionary"

const mocks = vi.hoisted(() => ({ username: vi.fn(), user: vi.fn(), settings: vi.fn() }))
vi.mock("./auth", () => ({ getCurrentUsername: mocks.username }))
vi.mock("./prisma", () => ({ prisma: { userApiConfig: { findUnique: mocks.user }, settings: { findFirst: mocks.settings } } }))

const endpoint = (id: string, tasks: AIEndpointConfig["tasks"]): AIEndpointConfig => ({
  id, tasks, name: id, baseURL: "https://example.test/v1", apiKey: "test-key", model: id,
})
const image = endpoint("image-model", ["image"])
const lookup = endpoint("lookup-model", ["lookup"])
const sentence = endpoint("sentence-model", ["sentence"])

describe("sentence model configuration", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.username.mockResolvedValue(null)
  })
  it("prefers an explicitly assigned sentence model", async () => {
    mocks.settings.mockResolvedValue({ aiEndpoints: [image, lookup, sentence] })
    expect(await getEndpointForTask("sentence")).toEqual(sentence)
  })
  it("uses the existing lookup model when the new task has not been configured", async () => {
    mocks.settings.mockResolvedValue({ aiEndpoints: [image, lookup] })
    expect(await getEndpointForTask("sentence")).toEqual(lookup)
  })
  it("keeps personal endpoint selection separate from global endpoints", async () => {
    mocks.username.mockResolvedValue("reader")
    mocks.user.mockResolvedValue({ aiEndpoints: [image, lookup] })
    mocks.settings.mockResolvedValue({ aiEndpoints: [sentence] })
    expect(await getEndpointForTask("sentence")).toEqual(lookup)
    expect(mocks.settings).not.toHaveBeenCalled()
  })
  it("preserves the first-endpoint fallback for existing tasks", async () => {
    mocks.settings.mockResolvedValue({ aiEndpoints: [image, lookup] })
    expect(await getEndpointForTask("story")).toEqual(image)
  })
  it("returns null when no endpoint is configured", async () => {
    mocks.settings.mockResolvedValue({ aiEndpoints: [] })
    expect(await getEndpointForTask("sentence")).toBeNull()
  })
})
