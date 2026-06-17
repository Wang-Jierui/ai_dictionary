import type { VocabularyFilterId } from "@/lib/constants"
import type { VocabularyEntry } from "@/types/dictionary"

/**
 * Merge a reviewed entry back into the local list.
 *
 * For the "due" filter, if the server now says the word is no longer due,
 * drop it from the list immediately so the UI matches the server-side filter.
 * Otherwise just replace the existing row.
 */
export function applyReviewedEntryUpdate(
  words: VocabularyEntry[],
  updated: VocabularyEntry,
  filter: VocabularyFilterId,
): VocabularyEntry[] {
  if (filter !== "due") {
    return words.map(entry => (entry.id === updated.id ? updated : entry))
  }

  const dueAt = updated.review?.dueAt
  const isStillDue = !dueAt || new Date(dueAt) <= new Date()
  if (isStillDue) {
    return words.map(entry => (entry.id === updated.id ? updated : entry))
  }

  return words.filter(entry => entry.id !== updated.id)
}
