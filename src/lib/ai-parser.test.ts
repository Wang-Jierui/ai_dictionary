import { describe, expect, it } from "vitest"
import {
  coerceAiWordData,
  extractFirstBalancedJsonObject,
  LookupParseError,
  parseLookupResponse,
  parseLookupResponseStrict,
  tryParseLookupJson,
} from "@/lib/ai-parser"
import type { AIWordData } from "@/types/dictionary"

const baseValidLookup: AIWordData = {
  chineseDefinition: "adj. 短暂的，瞬息即逝的",
  personalizedExamples: ["The beauty of the sunset was ephemeral."],
  nuanceAnalysis: "强调时间极短，常带有惋惜或诗意的语气",
  etymologyStory: "源自希腊语 ephēmeros，意为“只持续一天”",
  mnemonicHook: "e-phe-meral 像蝴蝶一日",
}

describe("strict lookup parser", () => {
  it("parses raw trimmed JSON", () => {
    const text = JSON.stringify(baseValidLookup)
    const result = parseLookupResponseStrict(text)
    expect(result.chineseDefinition).toBe(baseValidLookup.chineseDefinition)
    expect(result.personalizedExamples).toEqual(baseValidLookup.personalizedExamples)
    expect(result.nuanceAnalysis).toBe(baseValidLookup.nuanceAnalysis)
  })

  it("parses markdown json fenced JSON", () => {
    const text = `Here is the lookup result:\n\n\`\`\`json\n${JSON.stringify(baseValidLookup, null, 2)}\n\`\`\`\n\nHope it helps.`
    const result = parseLookupResponseStrict(text)
    expect(result.chineseDefinition).toBe(baseValidLookup.chineseDefinition)
    expect(result.personalizedExamples).toEqual(baseValidLookup.personalizedExamples)
  })

  it("parses generic fenced JSON", () => {
    const text = `\`\`\`\n${JSON.stringify(baseValidLookup)}\n\`\`\``
    const result = parseLookupResponseStrict(text)
    expect(result.chineseDefinition).toBe(baseValidLookup.chineseDefinition)
  })

  it("parses balanced object embedded in surrounding text", () => {
    const text = `Some intro text... { "chineseDefinition": "n. 例子", "personalizedExamples": [], "nuanceAnalysis": "", "etymologyStory": "", "mnemonicHook": "" } ... trailing text`
    const result = parseLookupResponseStrict(text)
    expect(result.chineseDefinition).toBe("n. 例子")
  })

  it("parses partial JSON with only required fields", () => {
    const partial = {
      chineseDefinition: "adv. 轻轻地",
      personalizedExamples: [],
      nuanceAnalysis: "",
      etymologyStory: "",
      mnemonicHook: "",
    }
    const result = parseLookupResponseStrict(JSON.stringify(partial))
    expect(result.chineseDefinition).toBe("adv. 轻轻地")
  })

  it("coerces numbers and booleans to strings", () => {
    const raw = {
      chineseDefinition: "num. 一百",
      personalizedExamples: [123, true, " example "],
      nuanceAnalysis: true,
      etymologyStory: false,
      mnemonicHook: "hook",
    }
    const result = coerceAiWordData(raw)
    expect(result).not.toBeNull()
    expect(result?.personalizedExamples).toEqual(["123", "true", "example"])
    expect(result?.nuanceAnalysis).toBe("true")
    expect(result?.etymologyStory).toBe("false")
  })

  it("coerces single string into trimmed string arrays", () => {
    const raw = {
      chineseDefinition: "v. 跑",
      personalizedExamples: "Run fast.",
      nuanceAnalysis: "",
      etymologyStory: "",
      mnemonicHook: "",
      collocations: "run away",
    }
    const result = coerceAiWordData(raw)
    expect(result?.personalizedExamples).toEqual(["Run fast."])
    expect(result?.collocations).toEqual(["run away"])
  })

  it("drops invalid nested items while keeping valid ones", () => {
    const raw = {
      chineseDefinition: "n. 测试",
      personalizedExamples: [],
      nuanceAnalysis: "",
      etymologyStory: "",
      mnemonicHook: "",
      senseMap: [
        { meaning: "意思一", usage: "用法一" },
        null,
        { meaning: "", usage: "" },
        "invalid item",
        { meaning: "意思二", usage: "用法二" },
      ],
      synonymBoundaries: [
        { synonym: "syn1", difference: "diff1" },
        { foo: "bar" },
      ],
    }
    const result = coerceAiWordData(raw)
    expect(result?.senseMap).toHaveLength(2)
    expect(result?.senseMap?.[0]).toEqual({ meaning: "意思一", usage: "用法一" })
    expect(result?.senseMap?.[1]).toEqual({ meaning: "意思二", usage: "用法二" })
    expect(result?.synonymBoundaries).toEqual([{ synonym: "syn1", difference: "diff1" }])
  })

  it("ignores unknown fields", () => {
    const raw = {
      chineseDefinition: "n. 忽略",
      personalizedExamples: [],
      nuanceAnalysis: "",
      etymologyStory: "",
      mnemonicHook: "",
      extraField: "should be ignored",
      nested: { foo: "bar" },
    }
    const result = parseLookupResponseStrict(JSON.stringify(raw))
    expect(result.chineseDefinition).toBe("n. 忽略")
    expect("extraField" in result).toBe(false)
  })

  it("rejects plain malformed text", () => {
    expect(() => parseLookupResponseStrict("not json")).toThrow(LookupParseError)
    expect(tryParseLookupJson("not json")).toBeNull()
  })

  it("rejects empty string", () => {
    expect(() => parseLookupResponseStrict("")).toThrow(LookupParseError)
  })

  it("rejects incomplete JSON", () => {
    const text = '{ "chineseDefinition": "broken" '
    expect(() => parseLookupResponseStrict(text)).toThrow(LookupParseError)
  })

  it("rejects missing chineseDefinition", () => {
    const raw = {
      personalizedExamples: ["example"],
      nuanceAnalysis: "some nuance",
      etymologyStory: "",
      mnemonicHook: "",
    }
    expect(() => parseLookupResponseStrict(JSON.stringify(raw))).toThrow(LookupParseError)
  })

  it("rejects empty chineseDefinition when only optional fields exist", () => {
    const raw = {
      chineseDefinition: "   ",
      personalizedExamples: ["example"],
      nuanceAnalysis: "",
      etymologyStory: "",
      mnemonicHook: "",
    }
    expect(() => parseLookupResponseStrict(JSON.stringify(raw))).toThrow(LookupParseError)
  })

  it("rejects fenced code block in chineseDefinition", () => {
    const raw = {
      ...baseValidLookup,
      chineseDefinition: "```json\n{ \"foo\": \"bar\" }\n```",
    }
    expect(() => parseLookupResponseStrict(JSON.stringify(raw))).toThrow(LookupParseError)
  })

  it("rejects const-style code in nuanceAnalysis", () => {
    const raw = {
      ...baseValidLookup,
      nuanceAnalysis: "const x = { meaning: 'short-lived', partOfSpeech: 'adjective' }",
    }
    expect(() => parseLookupResponseStrict(JSON.stringify(raw))).toThrow(LookupParseError)
  })

  it("rejects raw JSON-shaped object in etymologyStory", () => {
    const raw = {
      ...baseValidLookup,
      etymologyStory: '{ "greek": "ephēmeros", "literal": "lasting a day" }',
    }
    expect(() => parseLookupResponseStrict(JSON.stringify(raw))).toThrow(LookupParseError)
  })

  it("rejects raw JSON-shaped array in mnemonicHook", () => {
    const raw = {
      ...baseValidLookup,
      mnemonicHook: '["ephēmeros", "day", "butterfly"]',
    }
    expect(() => parseLookupResponseStrict(JSON.stringify(raw))).toThrow(LookupParseError)
  })

  it("returns null from tryParseLookupJson for malformed output", () => {
    expect(tryParseLookupJson("const x = { bad: true }")).toBeNull()
  })

  it("LookupParseError exposes raw text", () => {
    try {
      parseLookupResponseStrict("plain bad text")
      expect.fail("expected throw")
    } catch (error) {
      expect(error).toBeInstanceOf(LookupParseError)
      expect((error as LookupParseError).rawText).toBe("plain bad text")
      expect((error as LookupParseError).name).toBe("LookupParseError")
    }
  })

  it("legacy parseLookupResponse still provides raw text fallback", () => {
    const result = parseLookupResponse("plain bad text")
    expect(result.chineseDefinition).toBe("plain bad text")
    expect(result.personalizedExamples).toEqual([])
  })
})

describe("extractFirstBalancedJsonObject", () => {
  it("extracts first balanced braces from text", () => {
    const text = 'prefix { "a": 1 } suffix { "b": 2 }'
    expect(extractFirstBalancedJsonObject(text)).toBe('{ "a": 1 }')
  })

  it("returns null when no object exists", () => {
    expect(extractFirstBalancedJsonObject("no braces here")).toBeNull()
  })

  it("ignores braces inside strings", () => {
    const text = '{ "a": "{not counted}" }'
    expect(extractFirstBalancedJsonObject(text)).toBe(text)
  })
})
