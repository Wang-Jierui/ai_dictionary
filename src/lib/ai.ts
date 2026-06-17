import { createOpenAI } from "@ai-sdk/openai"
import type { AIEndpointConfig, AITask } from "@/types/dictionary"
import { prisma } from "./prisma"
import { getCurrentUsername } from "./auth"

export function createProvider(config: AIEndpointConfig) {
  return createOpenAI({
    baseURL: config.baseURL,
    apiKey: config.apiKey,
  })
}

export async function getEndpointForTask(task: AITask): Promise<AIEndpointConfig | null> {
  const username = await getCurrentUsername()

  if (username) {
    const userConfig = await prisma.userApiConfig.findUnique({ where: { username } })
    if (userConfig) {
      const userEndpoints = userConfig.aiEndpoints as unknown as AIEndpointConfig[]
      if (userEndpoints.length > 0) {
        const endpoint = userEndpoints.find(e => e.tasks.includes(task)) ?? userEndpoints[0]
        return endpoint ?? null
      }
    }
  }

  const settings = await prisma.settings.findFirst()
  if (!settings) return null

  const endpoints = settings.aiEndpoints as unknown as AIEndpointConfig[]
  const endpoint = endpoints.find(e => e.tasks.includes(task)) ?? endpoints[0]
  return endpoint ?? null
}

export async function getModelForTask(task: AITask) {
  const endpoint = await getEndpointForTask(task)
  if (!endpoint) throw new Error("No AI endpoint configured. Please set up in Settings.")

  const provider = createProvider(endpoint)
  return provider.chat(endpoint.model)
}

export function buildLookupPrompt(word: string, interests: string[], customPrompt: string) {
  const interestStr = interests.length > 0
    ? `用户兴趣领域：${interests.join("、")}。请根据这些兴趣生成贴近用户生活的例句。`
    : ""

  const customStr = customPrompt ? `\n额外要求：${customPrompt}` : ""

  return `你是一位资深英语教师和语言学家。请为单词 "${word}" 提供以下内容，用中文回答。

核心目标：帮助用户直接建立英文单词 "${word}" 与概念、画面、场景、动作和语感之间的连接，而不是先翻译成中文再理解。中文只是解释工具，不要把中文释义当作最终答案。避免写成“${word} = 某个中文词”的等号式解释；请反复锚定 "${word}" 在母语者脑中的原型画面、典型场景、情绪色彩、动作倾向和使用边界。

0. **多义项详解**：如果这个单词有多个常见的含义、词性或用法，请逐一解释（简洁明了）。如果没有多个含义，请详细解释其主要含义。

1. **兴趣定制例句**：生成3个自然地道的英文例句。${interestStr}例句要生动有趣，避免教科书式的枯燥表达。每个例句尽量体现该词不同的含义或用法。每条例句必须包含：英文整句、整句中文翻译、以及一句“概念注释”，说明 "${word}" 在这个句子里激活了什么画面、场景、动作或语感。注意：中文翻译要保留，但概念注释不要逐词翻译。

2. **母语级语感辨析**：不要只用中文近义词互相解释。请用典型英文场景说明 "${word}" 什么时候自然、什么时候别扭；讲清它的语气、强度、正式程度、常见主语/宾语和搭配限制。如果有常见同义词，请点透它们在场景和语感上的边界；如果没有容易混淆的同义词，就讲这个词的使用场景和语域（正式/非正式）。

3. **词源微故事**：用一个简短有趣的故事讲述这个词的起源。不要生硬列出词根词缀，而是让词源变成有画面感的历史轶事或趣闻。重点讲清这个词最早的来源和具体画面或动作，以及这个画面如何一步步延伸成今天的抽象含义。2-3段即可。

4. **脑洞记忆法**：根据单词的拼写或发音，生成一个有创意的记忆钩子。可以是谐音梗、中英混搭、荒诞联想等。要好笑、好记。${customStr}

为了提供更深度的结构化学习卡片，请额外提供以下内容：
5. **核心意象**：不要给中文翻译。写一段听到 "${word}" 时脑中最先浮现的概念原型：它像什么画面、涉及什么动作/状态、带有什么情绪或力量方向。用中文解释，但必须让用户感觉是在直接看见 "${word}"，而不是记住一个中文释义。
6. **词义图谱**：不要按中文翻译分类。请按 "${word}" 的核心意象如何延伸来分类：每个 meaning 写成“概念分支”，usage 写成“这个分支最常出现的英文场景和搭配”。
7. **地道搭配**：列出3-5个最常用的词组搭配（附中文）。
8. **近义词边界**：列出1-2个近义词，并明确指出它们与本词的核心区别。
9. **常见误区**：指出中国学生使用该词时最容易犯的1-2个错误（如介词搭配、语境不当等）。
10. **多维记忆钩子**：除了上面的脑洞记忆法，再提供2个不同角度的记忆方法（如词根词缀法、谐音法、联想法等）。
11. **主动回想**：设计一个简短的问答题，用于测试用户是否抓住了 "${word}" 的核心概念，而不是问中文意思。优先使用“哪个场景更适合用这个词？为什么？”或“这个词在句中带来什么感觉？”这类问题。
12. **实践任务**：设计一个微型写作或口语任务，让用户立刻用上这个词。

请严格按照以下JSON格式返回，不要包含其他内容：
{
  "chineseDefinition": "在这里提供上述第0点的多义项详解内容，用中文，多个意思换行显示",
  "personalizedExamples": ["英文例句1（整句中文翻译）—— 概念注释：说明该词在句中激活的画面/场景/语感", "英文例句2（整句中文翻译）—— 概念注释：说明该词在句中激活的画面/场景/语感", "英文例句3（整句中文翻译）—— 概念注释：说明该词在句中激活的画面/场景/语感"],
  "nuanceAnalysis": "语感辨析内容",
  "etymologyStory": "词源故事内容",
  "mnemonicHook": "记忆法内容",
  "coreImage": "核心意象描述",
  "senseMap": [{"meaning": "含义1", "usage": "用法场景1"}, {"meaning": "含义2", "usage": "用法场景2"}],
  "collocations": ["搭配1（中文）", "搭配2（中文）"],
  "synonymBoundaries": [{"synonym": "近义词1", "difference": "区别说明"}],
  "commonMistakes": ["误区1", "误区2"],
  "multiHookMemory": ["记忆法1", "记忆法2"],
  "activeRecall": {"question": "问题", "answer": "答案"},
  "practiceTask": "实践任务描述"
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

export function buildWordChatSystemPrompt(word: string, dictData: unknown, aiData: unknown) {
  const dictStr = dictData ? JSON.stringify(dictData) : "无词典数据"
  const aiStr = aiData ? JSON.stringify(aiData) : "无AI分析数据"

  return `你是一个专业的英语学习助手。用户正在学习单词 "${word}"。

以下是该单词的词典数据和AI分析内容，你可以基于这些信息回答用户的问题：

【词典数据】
${dictStr}

【AI分析】
${aiStr}

请用中文回答用户关于这个单词的任何问题，包括但不限于：用法、搭配、语境、近义词区别、语法要点、文化背景等。回答要简洁实用。`
}
