import { describe, expect, it } from "vitest"
import {
  AI_SECTION_IDS,
  REVIEW_GRADES,
  SORT_ORDERS,
  VOCABULARY_FILTER_IDS,
  VOCABULARY_SORT_IDS,
} from "@/lib/constants"

describe("shared constants", () => {
  it("has canonical AI section IDs", () => {
    expect(AI_SECTION_IDS).toContain("coreImage")
    expect(AI_SECTION_IDS).toContain("senseMap")
    expect(AI_SECTION_IDS).toContain("collocations")
    expect(AI_SECTION_IDS).toContain("synonymBoundaries")
    expect(AI_SECTION_IDS).toContain("commonMistakes")
    expect(AI_SECTION_IDS).toContain("personalizedExamples")
    expect(AI_SECTION_IDS).toContain("nuanceAnalysis")
    expect(AI_SECTION_IDS).toContain("etymologyStory")
    expect(AI_SECTION_IDS).toContain("mnemonicHook")
    expect(AI_SECTION_IDS).toContain("multiHookMemory")
    expect(AI_SECTION_IDS).toContain("activeRecall")
    expect(AI_SECTION_IDS).toContain("practiceTask")
  })

  it("has vocabulary sort, filter, and order options", () => {
    expect(VOCABULARY_SORT_IDS).toEqual(["created", "alpha", "random", "due"])
    expect(VOCABULARY_FILTER_IDS).toEqual([
      "all",
      "due",
      "new",
      "learning",
      "mastered",
    ])
    expect(SORT_ORDERS).toEqual(["asc", "desc"])
  })

  it("has SM-2 review grades", () => {
    expect(REVIEW_GRADES).toEqual({
      again: 0,
      hard: 3,
      good: 4,
      easy: 5,
    })
  })
})
