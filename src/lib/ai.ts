import { createOpenAI } from "@ai-sdk/openai"
import type { AIEndpointConfig, AITask } from "@/types/dictionary"
import { prisma } from "./prisma"

// Create an OpenAI-compatible provider from endpoint config
export function createProvider(config: AIEndpointConfig) {
  return createOpenAI({
    baseURL: config.baseURL,
    apiKey: config.apiKey,
  })
}

// Get the endpoint config for a specific task
export async function getEndpointForTask(task: AITask): Promise<AIEndpointConfig | null> {
  const settings = await prisma.settings.findFirst()
  if (!settings) return null

  const endpoints = settings.aiEndpoints as unknown as AIEndpointConfig[]
  // Find endpoint assigned to this task, or fall back to first endpoint
  const endpoint = endpoints.find(e => e.tasks.includes(task)) ?? endpoints[0]
  return endpoint ?? null
}

// Get provider + model for a task
export async function getModelForTask(task: AITask) {
  const endpoint = await getEndpointForTask(task)
  if (!endpoint) throw new Error("No AI endpoint configured. Please set up in Settings.")

  const provider = createProvider(endpoint)
  return provider(endpoint.model)
}

// Prompt templates
export function buildLookupPrompt(word: string, interests: string[], customPrompt: string) {
  const interestStr = interests.length > 0
    ? `用户兴趣领域：${interests.join("、")}。请根据这些兴趣生成贴近用户生活的例句。`
    : ""

  const customStr = customPrompt ? `\n额外要求：${customPrompt}` : ""

  return `你是一位资深英语教师和语言学家。请为单词 "${word}" 提供以下内容，用中文回答：

0. **多义项详解**：如果这个单词有多个常见的含义、词性或用法，请逐一解释（简洁明了）。如果没有多个含义，请详细解释其主要含义。

1. **兴趣定制例句**：生成3个自然地道的英文例句（附中文翻译）。${interestStr}例句要生动有趣，避免教科书式的枯燥表达。每个例句尽量体现该词不同的含义或用法。

2. **母语级语感辨析**：像英语母语老师一样，用一两句话点透这个词和其常见同义词的微妙语境差异，给出地道搭配。如果没有容易混淆的同义词，可以讲讲这个词的使用场景和语域（正式/非正式）。

3. **词源微故事**：用一个简短有趣的故事讲述这个词的起源。不要生硬列出词根词缀，而是让词源变成有画面感的历史轶事或趣闻。2-3段即可。

4. **脑洞记忆法**：根据单词的拼写或发音，生成一个有创意的记忆钩子。可以是谐音梗、中英混搭、荒诞联想等。要好笑、好记。${customStr}

请严格按照以下JSON格式返回，不要包含其他内容：
{
  "chineseDefinition": "在这里提供上述第0点的多义项详解内容，用中文，多个意思换行显示",
  "personalizedExamples": ["例句1（中文翻译）", "例句2（中文翻译）", "例句3（中文翻译）"],
  "nuanceAnalysis": "语感辨析内容",
  "etymologyStory": "词源故事内容",
  "mnemonicHook": "记忆法内容"
}`
}

export function buildMnemonicPrompt(word: string) {
  return `为英文单词 "${word}" 生成一个全新的、有创意的记忆钩子。可以是谐音梗、中英混搭、荒诞联想、画面联想等。要好笑、好记、脑洞大开。

只返回记忆法内容本身，不要加任何前缀或解释。`
}

export function buildStoryPrompt(words: string[]) {
  return `你是一位创意写作大师。请用以下${words.length}个英文单词编写一篇连贯的英文短文或小故事（200-300词），并附上中文翻译。

单词列表：${words.join(", ")}

要求：
1. 每个单词都必须在故事中自然使用（用**加粗**标记）
2. 故事要有趣、有情节，可以荒诞离奇
3. 语言地道自然，适合英语学习者阅读
4. 在故事后附上中文翻译

请直接输出故事内容，不要加额外说明。`
}

export function buildImagePrompt(word: string, meaning: string, mode: "mood" | "meme") {
  if (mode === "meme") {
    return `Create a funny, shareable meme image that helps remember the English word "${word}" (meaning: ${meaning}). The image should be humorous, exaggerated, and visually memorable. Use bold visual metaphors. Do NOT include any text in the image — the humor should come purely from the visual scene. Style: clean digital illustration, vibrant colors, meme-worthy composition.`
  }
  return `Create an evocative, atmospheric illustration that captures the essence and feeling of the English word "${word}" (meaning: ${meaning}). The image should be artistic and emotionally resonant, helping the viewer intuitively understand the word's meaning through visual metaphor. Style: painterly digital art, rich colors, dreamlike quality. Do NOT include any text in the image.`
}

export function buildRoleplaySystemPrompt(word: string, scenario: string) {
  return `你是一位英语对话练习伙伴。当前场景：${scenario}

规则：
1. 用英文与用户对话，保持场景的真实感
2. 用户需要在对话中正确使用单词 "${word}"
3. 如果用户用错了这个词，温和地纠正并解释
4. 如果用户成功使用了这个词，给予肯定并继续推进对话
5. 每次回复后，用中文简短点评用户的表达（语法、用词、自然度）
6. 保持对话有趣，推动情节发展
7. 回复控制在2-4句英文 + 1-2句中文点评`
}

export function buildAutoScenarioPrompt(word: string) {
  return `为英文单词 "${word}" 推荐一个最适合练习这个词的对话场景。

要求：
1. 场景要自然，让用户能在对话中自然地使用这个词
2. 场景描述要具体（人物、地点、情境）
3. 用中文描述场景

只返回场景描述本身（一句话），不要加前缀或解释。`
}

export function buildSceneExpressionPrompt(scene: string) {
  return `用户描述了一个中文场景，请提供在这个场景下常用的英文表达方式。

场景：${scene}

请提供以下内容，用中文解释：
1. 3-5个最常用的英文表达（附中文翻译和使用语境说明）
2. 一段完整的英文对话示例（附中文翻译），展示这些表达在实际场景中的使用
3. 需要注意的文化差异或语用禁忌（如果有的话）

请严格按照以下JSON格式返回：
{
  "expressions": [
    {"english": "英文表达", "chinese": "中文翻译", "context": "使用语境说明"}
  ],
  "dialogue": "完整对话示例（英文+中文翻译）",
  "culturalNotes": "文化差异说明（没有则返回空字符串）"
}`
}
