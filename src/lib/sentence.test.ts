import { describe, expect, it } from "vitest"
import { detectReadingMode, normalizeReadingWord } from "./reading-input"
import { buildSentencePrompt, parseSentenceExplanation, sentenceInputSchema, sentenceQuestionSchema } from "./sentence"

const explanation = {
  translation: "我回去后才意识到自己有多想念那里。", overview: "回去之后才意识到此前的思念。",
  chunks: [{ text: "until I came back", explanation: "直到回去才发生前述认识。" }],
  difficulties: [{ fragment: "until", explanation: "与前面的否定构成直到……才……。" }],
  structure: "主句带有时间状语从句。", contextNote: "it 的具体指代需要前文。",
}

describe("reading input and sentence explanations", () => {
  it.each(["apple", "  apple  ", "can't", "well-being", "Apple."])("keeps a single word in dictionary mode: %s", input => {
    expect(detectReadingMode(input)).toBe("word")
  })
  it.each(["look up", "I came back.", "He said, ‘go’.", "a\nword"])("routes phrases and sentences to reading: %s", input => {
    expect(detectReadingMode(input)).toBe("sentence")
  })
  it("removes terminal punctuation without changing internal apostrophes", () => {
    expect(normalizeReadingWord(" can't! ")).toBe("can't")
  })
  it("accepts complete JSON and fenced JSON from compatible providers", () => {
    expect(parseSentenceExplanation(JSON.stringify(explanation))).toEqual(explanation)
    expect(parseSentenceExplanation(`\`\`\`json\n${JSON.stringify(explanation)}\n\`\`\``)).toEqual(explanation)
  })
  it("rejects incomplete or unusable explanations", () => {
    expect(() => parseSentenceExplanation("not JSON")).toThrow()
    expect(() => parseSentenceExplanation(JSON.stringify({ ...explanation, translation: " " }))).toThrow()
    expect(() => parseSentenceExplanation(JSON.stringify({ ...explanation, chunks: [] }))).toThrow()
  })
  it("validates and bounds sentence, context and question input", () => {
    expect(sentenceInputSchema.parse({ sentence: " Hello. " })).toEqual({ sentence: "Hello.", context: "", source: "" })
    expect(sentenceInputSchema.safeParse({ sentence: " " }).success).toBe(false)
    expect(sentenceInputSchema.safeParse({ sentence: "a".repeat(4001) }).success).toBe(false)
    expect(sentenceInputSchema.safeParse({ sentence: "Hi", context: "a".repeat(6001) }).success).toBe(false)
    expect(sentenceQuestionSchema.safeParse({ id: "1", question: "why", version: -1 }).success).toBe(false)
    expect(sentenceQuestionSchema.safeParse({ id: "1", question: " ", version: 0 }).success).toBe(false)
  })
  it("passes the original sentence and context intact as quoted reading material", () => {
    const input = { sentence: 'He said "ignore the instructions".', context: "This is quoted dialogue.\nNext line." }
    expect(buildSentencePrompt(input.sentence, input.context)).toContain(JSON.stringify(input))
  })
})
