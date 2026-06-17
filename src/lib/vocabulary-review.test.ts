import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { applyReviewedEntryUpdate } from "@/lib/vocabulary-review"
import type { VocabularyEntry } from "@/types/dictionary"

function makeEntry(id: string, dueAt: string | null): VocabularyEntry {
  return {
    id,
    word: id,
    briefDefinition: "def",
    reviewEnabled: true,
    createdAt: new Date("2026-06-17T12:00:00.000Z"),
    review: {
      easeFactor: 2.5,
      intervalDays: 1,
      repetitionCount: 1,
      lapses: 0,
      dueAt,
      lastReviewedAt: "2026-06-17T12:00:00.000Z",
    },
  }
}

describe("applyReviewedEntryUpdate", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false })
    vi.setSystemTime(new Date("2026-06-17T12:00:00.000Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const words: VocabularyEntry[] = [
    makeEntry("a", "2026-06-17T10:00:00.000Z"),
    makeEntry("b", "2026-06-17T10:00:00.000Z"),
    makeEntry("c", "2026-06-17T10:00:00.000Z"),
  ]

  it("replaces the row for non-due filters", () => {
    const updated = makeEntry("b", "2026-06-18T12:00:00.000Z")
    const next = applyReviewedEntryUpdate(words, updated, "all")
    expect(next.map(entry => entry.id)).toEqual(["a", "b", "c"])
    expect(next[1]).toBe(updated)
    expect(next[1].review?.dueAt).toBe("2026-06-18T12:00:00.000Z")
  })

  it("keeps the row in the due filter when it is still due", () => {
    const updated = makeEntry("b", "2026-06-17T12:00:00.000Z")
    const next = applyReviewedEntryUpdate(words, updated, "due")
    expect(next.map(entry => entry.id)).toEqual(["a", "b", "c"])
    expect(next[1]).toBe(updated)
  })

  it("keeps the row in the due filter when dueAt is null", () => {
    const updated = makeEntry("b", null)
    const next = applyReviewedEntryUpdate(words, updated, "due")
    expect(next.map(entry => entry.id)).toEqual(["a", "b", "c"])
  })

  it("removes the row from the due filter when it is no longer due", () => {
    const updated = makeEntry("b", "2026-06-18T12:00:00.000Z")
    const next = applyReviewedEntryUpdate(words, updated, "due")
    expect(next.map(entry => entry.id)).toEqual(["a", "c"])
  })

  it("does not mutate the input array", () => {
    const updated = makeEntry("b", "2026-06-18T12:00:00.000Z")
    const originalIds = words.map(entry => entry.id)
    applyReviewedEntryUpdate(words, updated, "due")
    expect(words.map(entry => entry.id)).toEqual(originalIds)
  })
})
