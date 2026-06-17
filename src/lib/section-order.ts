import { AI_SECTION_IDS, type AISectionId } from "@/lib/constants"

export const DEFAULT_SECTION_ORDER: AISectionId[] = [
  "coreImage",
  "senseMap",
  "nuanceAnalysis",
  "synonymBoundaries",
  "collocations",
  "personalizedExamples",
  "etymologyStory",
  "commonMistakes",
  "mnemonicHook",
  "multiHookMemory",
  "activeRecall",
  "practiceTask",
]

const KNOWN_SECTION_ID_SET = new Set<string>(AI_SECTION_IDS)

function parseSubmittedOrder(value: unknown): unknown[] {
  if (Array.isArray(value)) return value

  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed
    } catch {
      // Fall through to default empty order.
    }
  }

  return []
}

/**
 * Sanitize a submitted section order against the canonical registry.
 *
 * - Ignores unknown keys.
 * - De-duplicates known keys while preserving first occurrence.
 * - Preserves valid submitted order.
 * - Appends any missing canonical IDs in default order.
 */
export function sanitizeSectionOrder(value: unknown): AISectionId[] {
  const submitted = parseSubmittedOrder(value)

  const seen = new Set<AISectionId>()
  const result: AISectionId[] = []

  for (const item of submitted) {
    if (typeof item !== "string") continue
    if (!KNOWN_SECTION_ID_SET.has(item)) continue
    const id = item as AISectionId
    if (seen.has(id)) continue
    seen.add(id)
    result.push(id)
  }

  for (const id of DEFAULT_SECTION_ORDER) {
    if (!seen.has(id)) {
      result.push(id)
    }
  }

  return result
}
