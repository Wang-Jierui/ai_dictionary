import { describe, expect, it } from "vitest"
import { AI_SECTION_IDS } from "@/lib/constants"
import { DEFAULT_SECTION_ORDER, sanitizeSectionOrder } from "@/lib/section-order"

describe("section-order sanitizer", () => {
  it("returns default order for undefined", () => {
    expect(sanitizeSectionOrder(undefined)).toEqual(DEFAULT_SECTION_ORDER)
  })

  it("returns default order for null", () => {
    expect(sanitizeSectionOrder(null)).toEqual(DEFAULT_SECTION_ORDER)
  })

  it("returns default order for non-array JSON", () => {
    expect(sanitizeSectionOrder({ coreImage: true })).toEqual(DEFAULT_SECTION_ORDER)
    expect(sanitizeSectionOrder(123)).toEqual(DEFAULT_SECTION_ORDER)
    expect(sanitizeSectionOrder("not-json")).toEqual(DEFAULT_SECTION_ORDER)
  })

  it("returns default order for invalid JSON string", () => {
    expect(sanitizeSectionOrder("{invalid")).toEqual(DEFAULT_SECTION_ORDER)
  })

  it("parses a valid JSON string array", () => {
    const input = JSON.stringify(["practiceTask", "coreImage"])
    expect(sanitizeSectionOrder(input)).toEqual([
      "practiceTask",
      "coreImage",
      ...DEFAULT_SECTION_ORDER.filter((id) => id !== "practiceTask" && id !== "coreImage"),
    ])
  })

  it("preserves a valid submitted order", () => {
    const input = ["practiceTask", "activeRecall", "coreImage"]
    const result = sanitizeSectionOrder(input)
    expect(result[0]).toBe("practiceTask")
    expect(result[1]).toBe("activeRecall")
    expect(result[2]).toBe("coreImage")
  })

  it("ignores unknown keys", () => {
    const input = ["unknownSection", "practiceTask", "anotherUnknown"]
    expect(sanitizeSectionOrder(input)[0]).toBe("practiceTask")
    expect(sanitizeSectionOrder(input)).not.toContain("unknownSection")
    expect(sanitizeSectionOrder(input)).not.toContain("anotherUnknown")
  })

  it("de-duplicates known keys keeping first occurrence", () => {
    const input = ["practiceTask", "coreImage", "practiceTask", "coreImage"]
    const result = sanitizeSectionOrder(input)
    const practiceIndices = result
      .map((id, index) => ({ id, index }))
      .filter(({ id }) => id === "practiceTask")
      .map(({ index }) => index)
    expect(practiceIndices).toEqual([0])
  })

  it("appends missing canonical IDs in default order", () => {
    const input = ["practiceTask"]
    const result = sanitizeSectionOrder(input)
    expect(result[0]).toBe("practiceTask")
    const tail = result.slice(1)
    expect(tail).toEqual(DEFAULT_SECTION_ORDER.filter((id) => id !== "practiceTask"))
  })

  it("ignores non-string items in submitted array", () => {
    const input = ["practiceTask", 123, null, "coreImage", true]
    const result = sanitizeSectionOrder(input)
    expect(result[0]).toBe("practiceTask")
    expect(result[1]).toBe("coreImage")
  })

  it("contains every canonical AI section exactly once", () => {
    expect(DEFAULT_SECTION_ORDER).toHaveLength(AI_SECTION_IDS.length)
    expect(new Set(DEFAULT_SECTION_ORDER)).toEqual(new Set(AI_SECTION_IDS))
    const result = sanitizeSectionOrder([])
    expect(result).toEqual(DEFAULT_SECTION_ORDER)
  })

  it("handles duplicates, unknowns, and missing IDs together", () => {
    const input = ["activeRecall", "unknown", "activeRecall", "coreImage", "unknown2"]
    const result = sanitizeSectionOrder(input)
    expect(result[0]).toBe("activeRecall")
    expect(result[1]).toBe("coreImage")
    const tail = result.slice(2)
    expect(tail).toEqual(DEFAULT_SECTION_ORDER.filter((id) => id !== "activeRecall" && id !== "coreImage"))
  })
})
