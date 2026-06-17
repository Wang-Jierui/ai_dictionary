// Canonical AI dictionary section IDs, matching keys of AIWordData.
export const AI_SECTION_IDS = [
  "coreImage",
  "senseMap",
  "collocations",
  "synonymBoundaries",
  "commonMistakes",
  "personalizedExamples",
  "nuanceAnalysis",
  "etymologyStory",
  "mnemonicHook",
  "multiHookMemory",
  "activeRecall",
  "practiceTask",
] as const

export type AISectionId = (typeof AI_SECTION_IDS)[number]

// Vocabulary list sorting options.
export const VOCABULARY_SORT_IDS = ["created", "alpha", "random", "due"] as const
export type VocabularySortId = (typeof VOCABULARY_SORT_IDS)[number]

// Vocabulary list filter options.
export const VOCABULARY_FILTER_IDS = ["all", "due", "new", "learning", "mastered"] as const
export type VocabularyFilterId = (typeof VOCABULARY_FILTER_IDS)[number]

// Sort direction.
export const SORT_ORDERS = ["asc", "desc"] as const
export type SortOrder = (typeof SORT_ORDERS)[number]

// SM-2 review grades.
export const REVIEW_GRADES = {
  again: 0,
  hard: 3,
  good: 4,
  easy: 5,
} as const

export type ReviewGradeName = keyof typeof REVIEW_GRADES
export type ReviewGradeValue = (typeof REVIEW_GRADES)[ReviewGradeName]
