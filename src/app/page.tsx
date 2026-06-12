"use client"

import { useSearchParams } from "next/navigation"
import { Suspense, useState, useRef, useEffect, useCallback } from "react"
import { Search, Volume2, RefreshCw, Swords, Loader2, Sparkles, Brain, History as HistoryIcon, BookOpen, ImageIcon, Languages, Eye, Map as MapIcon, Link2, Split, AlertTriangle, Lightbulb, HelpCircle, PenTool, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import type { DictionaryEntry, AIWordData } from "@/types/dictionary"
import { WordChatPanel } from "@/components/word-chat-panel"

const HISTORY_KEY = "ai-dict-search-history"
const REVIEW_QUEUE_KEY = "ai-dict-review-queue"
const MAX_HISTORY = 8

function getHistory(): string[] {
  if (typeof window === "undefined") return []
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]")
  } catch {
    return []
  }
}

function addHistory(word: string) {
  const history = getHistory().filter(w => w !== word)
  history.unshift(word)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)))
}

export default function HomePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />加载中...</div>}>
      <HomeContent />
    </Suspense>
  )
}

interface WordResult {
  word: string
  dictData: DictionaryEntry | null
  aiData: AIWordData | null
  loadingDict: boolean
  loadingAI: boolean
  loadingMnemonic: boolean
  error: string
  generatedImage: string | null
  loadingImage: boolean
  imageMode: "mood" | "meme"
  fromCache: boolean
}

function textValue(value: unknown) {
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return ""
}

function stringList(value: unknown) {
  if (typeof value === "string") {
    const text = value.trim()
    return text ? [text] : []
  }

  if (!Array.isArray(value)) return []

  return value.map(item => textValue(item).trim()).filter(Boolean)
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function senseMap(value: unknown) {
  if (!Array.isArray(value)) return []

  return value
    .map(objectRecord)
    .filter((item): item is Record<string, unknown> => item !== null)
    .map(item => ({
      meaning: textValue(item.meaning).trim(),
      usage: textValue(item.usage).trim(),
    }))
    .filter(item => item.meaning || item.usage)
}

function synonymBoundaries(value: unknown) {
  if (!Array.isArray(value)) return []

  return value
    .map(objectRecord)
    .filter((item): item is Record<string, unknown> => item !== null)
    .map(item => ({
      synonym: textValue(item.synonym).trim(),
      difference: textValue(item.difference).trim(),
    }))
    .filter(item => item.synonym || item.difference)
}

function activeRecall(value: unknown) {
  const record = objectRecord(value)
  if (!record) return null

  const question = textValue(record.question).trim()
  const answer = textValue(record.answer).trim()
  if (!question && !answer) return null

  return { question, answer }
}

function hasMeaningfulAiContent(data: AIWordData) {
  return Boolean(
    data.chineseDefinition.trim() ||
    data.personalizedExamples.length > 0 ||
    data.nuanceAnalysis.trim() ||
    data.etymologyStory.trim() ||
    data.mnemonicHook.trim() ||
    data.coreImage?.trim() ||
    data.senseMap?.some(item => item.meaning.trim() || item.usage.trim()) ||
    data.collocations?.length ||
    data.synonymBoundaries?.some(item => item.synonym.trim() || item.difference.trim()) ||
    data.commonMistakes?.length ||
    data.multiHookMemory?.length ||
    data.activeRecall?.question.trim() ||
    data.activeRecall?.answer.trim() ||
    data.practiceTask?.trim(),
  )
}

function coerceAiWordData(value: unknown): AIWordData | null {
  const record = objectRecord(value)
  if (!record) return null

  const data: AIWordData = {
    chineseDefinition: textValue(record.chineseDefinition).trim(),
    personalizedExamples: stringList(record.personalizedExamples),
    nuanceAnalysis: textValue(record.nuanceAnalysis).trim(),
    etymologyStory: textValue(record.etymologyStory).trim(),
    mnemonicHook: textValue(record.mnemonicHook).trim(),
  }

  const coreImage = textValue(record.coreImage).trim()
  const senses = senseMap(record.senseMap)
  const collocations = stringList(record.collocations)
  const boundaries = synonymBoundaries(record.synonymBoundaries)
  const mistakes = stringList(record.commonMistakes)
  const hooks = stringList(record.multiHookMemory)
  const recall = activeRecall(record.activeRecall)
  const practiceTask = textValue(record.practiceTask).trim()

  if (coreImage) data.coreImage = coreImage
  if (senses.length > 0) data.senseMap = senses
  if (collocations.length > 0) data.collocations = collocations
  if (boundaries.length > 0) data.synonymBoundaries = boundaries
  if (mistakes.length > 0) data.commonMistakes = mistakes
  if (hooks.length > 0) data.multiHookMemory = hooks
  if (recall) data.activeRecall = recall
  if (practiceTask) data.practiceTask = practiceTask

  if (!hasMeaningfulAiContent(data)) return null

  return data
}

function firstBalancedJsonObject(text: string) {
  const startIndex = text.indexOf("{")
  if (startIndex < 0) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index]

    if (escaped) {
      escaped = false
      continue
    }

    if (char === "\\") {
      escaped = inString
      continue
    }

    if (char === '"') {
      inString = !inString
      continue
    }

    if (inString) continue

    if (char === "{") depth += 1
    if (char === "}") depth -= 1
    if (depth === 0) return text.slice(startIndex, index + 1)
  }

  return null
}

function parseAiResponseText(text: string): AIWordData {
  const candidates = [
    text.trim(),
    ...Array.from(text.matchAll(/```json\s*([\s\S]*?)```/gi), match => match[1].trim()),
    ...Array.from(text.matchAll(/```\s*([\s\S]*?)```/g), match => match[1].trim()),
  ]
  const balanced = firstBalancedJsonObject(text)
  if (balanced) candidates.push(balanced)

  for (const candidate of candidates) {
    if (!candidate) continue

    try {
      const parsed = coerceAiWordData(JSON.parse(candidate) as unknown)
      if (parsed) return parsed
    } catch {
      continue
    }
  }

  return {
    chineseDefinition: text.trim(),
    personalizedExamples: [],
    nuanceAnalysis: "",
    etymologyStory: "",
    mnemonicHook: "",
  }
}

function HomeContent() {
  const searchParams = useSearchParams()
  const wordParam = searchParams.get("word")
  const [query, setQuery] = useState(wordParam ?? "")
  const [results, setResults] = useState<Map<string, WordResult>>(new Map<string, WordResult>())
  const [activeWord, setActiveWord] = useState<string>("")
  const [history, setHistory] = useState<string[]>([])
  const [reviewQueue, setReviewQueue] = useState<string[]>([])
  const [deletingWord, setDeletingWord] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const initialized = useRef(false)
  
  const activeResult = activeWord ? results.get(activeWord) : null
  const dictData = activeResult?.dictData ?? null
  const aiData = activeResult?.aiData ?? null
  const loadingDict = activeResult?.loadingDict ?? false
  const loadingAI = activeResult?.loadingAI ?? false
  const loadingMnemonic = activeResult?.loadingMnemonic ?? false
  const error = activeResult?.error ?? ""
  const generatedImage = activeResult?.generatedImage ?? null
  const loadingImage = activeResult?.loadingImage ?? false
  const imageMode = activeResult?.imageMode ?? "mood"
  const fromCache = activeResult?.fromCache ?? false

  const currentIndex = reviewQueue.indexOf(activeWord)
  const isInQueue = currentIndex !== -1

  const updateResult = useCallback((word: string, patch: Partial<WordResult>) => {
    setResults(prev => {
      const existing = prev.get(word)
      if (!existing) return prev
      return new Map(prev).set(word, { ...existing, ...patch })
    })
  }, [])

  useEffect(() => {
    setHistory(getHistory())
  }, [])

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(REVIEW_QUEUE_KEY)
      if (!raw) return
      const queue = JSON.parse(raw)
      if (Array.isArray(queue)) {
        const validQueue = Array.from(new Set(
          queue
            .filter(item => typeof item === "string")
            .map(item => item.trim())
            .filter(item => item.length > 0)
        ))
        setReviewQueue(validQueue)
      } else {
        sessionStorage.removeItem(REVIEW_QUEUE_KEY)
        setReviewQueue([])
      }
    } catch {
      sessionStorage.removeItem(REVIEW_QUEUE_KEY)
      setReviewQueue([])
    }
  }, [activeWord])

  const autoSave = useCallback(async (word: string, dict: DictionaryEntry | null, ai: AIWordData) => {
    const briefDef = dict?.meanings[0]?.definitions[0]?.definition ?? ""
    await fetch("/api/vocabulary/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        word,
        phonetic: dict?.phonetic,
        briefDefinition: briefDef,
        chineseDefinition: ai.chineseDefinition,
        dictData: dict,
        aiData: ai,
      }),
    })
  }, [])

  const searchWord = useCallback(async (word: string, options?: { forceRefresh?: boolean }) => {
    const trimmed = word.trim()
    if (!trimmed) return

    setQuery(trimmed)
    addHistory(trimmed)
    setHistory(getHistory())
    setActiveWord(trimmed)

    const initial: WordResult = {
      word: trimmed,
      dictData: null, aiData: null,
      loadingDict: true, loadingAI: true, loadingMnemonic: false,
      error: "", generatedImage: null, loadingImage: false,
      imageMode: "mood", fromCache: false,
    }
    setResults(prev => new Map(prev).set(trimmed, initial))

    let fetchedDict: DictionaryEntry | null = null
    let fetchedAi: AIWordData | null = null
    let isCached = false

    const aiPromise = fetch("/api/ai/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word: trimmed, forceRefresh: options?.forceRefresh === true }),
    }).then(async res => {
      if (!res.ok) { updateResult(trimmed, { loadingAI: false }); return }

      const contentType = res.headers.get("content-type") ?? ""
      if (contentType.includes("application/json")) {
        const data = await res.json()
        if (data.cached) {
          isCached = true
          const patch: Partial<WordResult> = { fromCache: true, aiData: data.aiData as AIWordData, loadingAI: false }
          if (data.dictData) {
            fetchedDict = data.dictData as DictionaryEntry
            patch.dictData = fetchedDict
            patch.loadingDict = false
          }
          updateResult(trimmed, patch)
          return
        }
      }

      const reader = res.body?.getReader()
      if (!reader) { updateResult(trimmed, { loadingAI: false }); return }

      const decoder = new TextDecoder()
      let accumulated = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
      }

      try {
        fetchedAi = parseAiResponseText(accumulated)
      } catch {
        fetchedAi = { chineseDefinition: accumulated.trim(), personalizedExamples: [], nuanceAnalysis: "", etymologyStory: "", mnemonicHook: "" }
      }
      updateResult(trimmed, { aiData: fetchedAi, loadingAI: false })
    }).catch(() => updateResult(trimmed, { loadingAI: false }))

    const dictPromise = fetch(`/api/dictionary?word=${encodeURIComponent(trimmed)}`)
      .then(async res => {
        if (!res.ok) throw new Error("未找到该单词")
        return res.json() as Promise<DictionaryEntry>
      })
      .then(data => {
        fetchedDict = data
        updateResult(trimmed, { dictData: data, loadingDict: false })
      })
      .catch(err => {
        updateResult(trimmed, { error: isCached ? "" : err.message, loadingDict: false })
      })

    await Promise.all([dictPromise, aiPromise])

    if (fetchedDict && fetchedAi && !isCached) {
      autoSave(trimmed, fetchedDict, fetchedAi)
    }
  }, [autoSave, updateResult])

  useEffect(() => {
    if (wordParam && !initialized.current) {
      initialized.current = true
      searchWord(wordParam)
    }
  }, [wordParam, searchWord])

  const regenerateMnemonic = async () => {
    if (!activeWord || loadingMnemonic) return
    updateResult(activeWord, { loadingMnemonic: true })

    try {
      const res = await fetch("/api/ai/mnemonic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: activeWord }),
      })
      if (!res.ok) return

      const reader = res.body?.getReader()
      if (!reader) return

      const decoder = new TextDecoder()
      let text = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        text += decoder.decode(value, { stream: true })
      }

      const result = results.get(activeWord)
      if (result?.aiData) {
        updateResult(activeWord, { aiData: { ...result.aiData, mnemonicHook: text } })
      }
    } finally {
      updateResult(activeWord, { loadingMnemonic: false })
    }
  }

  const generateWordImage = async (mode: "mood" | "meme") => {
    if (!activeWord || loadingImage) return
    updateResult(activeWord, { loadingImage: true, imageMode: mode, generatedImage: null })

    try {
      const meaning = dictData?.meanings[0]?.definitions[0]?.definition ?? activeWord
      const res = await fetch("/api/ai/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: activeWord, meaning, mode }),
      })

      const data = await res.json()
      if (data.base64) {
        const img = `data:image/png;base64,${data.base64}`
        updateResult(activeWord, { generatedImage: img })
        fetch("/api/vocabulary/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ word: activeWord, imageData: data.base64, imageMode: mode }),
        })
      } else if (data.url) {
        updateResult(activeWord, { generatedImage: data.url })
        fetch("/api/vocabulary/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ word: activeWord, imageData: data.url, imageMode: mode }),
        })
      } else if (data.error) {
        updateResult(activeWord, { error: data.error })
      }
    } catch {
      updateResult(activeWord, { error: "图片生成失败" })
    } finally {
      updateResult(activeWord, { loadingImage: false })
    }
  }

  const playAudio = (url: string) => {
    const audioUrl = url.startsWith("//") ? `https:${url}` : url
    new Audio(audioUrl).play()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") searchWord(query)
  }

  const removeResult = (word: string) => {
    setResults(prev => {
      const next = new Map(prev)
      next.delete(word)
      return next
    })
    if (activeWord === word) {
      const remaining = [...results.keys()].filter(w => w !== word)
      setActiveWord(remaining[remaining.length - 1] ?? "")
    }
  }

  const retryCurrentWord = () => {
    if (!activeWord || loadingDict || loadingAI) return
    searchWord(activeWord, { forceRefresh: true })
  }

  const deleteCurrentWord = async () => {
    if (!activeWord || deletingWord) return

    const shouldDelete = window.confirm(`确定从生词本删除 “${activeWord}” 吗？相关 AI 问答记录也会一起删除。`)
    if (!shouldDelete) return

    const wordToDelete = activeWord
    setDeletingWord(true)

    try {
      const res = await fetch(`/api/vocabulary?word=${encodeURIComponent(wordToDelete)}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "删除失败")
      }

      const nextQueue = reviewQueue.filter(word => word !== wordToDelete)
      if (nextQueue.length > 0) {
        sessionStorage.setItem(REVIEW_QUEUE_KEY, JSON.stringify(nextQueue))
        setReviewQueue(nextQueue)

        const nextIndex = Math.min(currentIndex === -1 ? 0 : currentIndex, nextQueue.length - 1)
        const nextWord = nextQueue[nextIndex]
        searchWord(nextWord)
        window.history.pushState({}, "", `/?word=${encodeURIComponent(nextWord)}`)
      } else {
        sessionStorage.removeItem(REVIEW_QUEUE_KEY)
        setReviewQueue([])
        removeResult(wordToDelete)
      }
    } catch (err) {
      updateResult(wordToDelete, { error: err instanceof Error ? err.message : "删除失败" })
    } finally {
      setDeletingWord(false)
    }
  }

  const clearAll = () => {
    setHistory([])
    localStorage.removeItem(HISTORY_KEY)
    
    setResults(prev => {
      const next = new Map()
      if (activeWord && prev.has(activeWord)) {
        next.set(activeWord, prev.get(activeWord)!)
      }
      return next
    })
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入英文单词..."
              className="pl-9 h-11 text-base"
              autoFocus
            />
          </div>
          <Button onClick={() => searchWord(query)} className="h-11 px-6">
            查询
          </Button>
        </div>

        {(results.size > 0 || history.length > 0) && (
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-3 flex-1">
              {results.size > 0 && (
                <div className="flex items-center gap-1 flex-wrap">
                  {[...results.entries()].map(([w, r]) => (
                    <div
                      key={w}
                      className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm cursor-pointer border transition-colors ${
                        activeWord === w
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted hover:bg-muted/80 border-transparent"
                      }`}
                      onClick={() => setActiveWord(w)}
                    >
                      {(r.loadingDict || r.loadingAI) && <Loader2 className="h-3 w-3 animate-spin" />}
                      {w}
                      <span
                        className="ml-1 opacity-60 hover:opacity-100"
                        onClick={e => { e.stopPropagation(); removeResult(w) }}
                      >×</span>
                    </div>
                  ))}
                </div>
              )}

              {history.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <HistoryIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  {history.map(w => (
                    <Badge
                      key={w}
                      className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                      onClick={() => searchWord(w)}
                    >
                      {w}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            {(results.size > 1 || history.length > 0) && (
              <Button variant="ghost" size="sm" onClick={clearAll} className="h-7 px-2 text-xs text-muted-foreground shrink-0 mt-1">
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                清空记录
              </Button>
            )}
          </div>
        )}
      </div>

      {error && (
        <Card className="border-destructive/50">
          <CardContent className="pt-6 text-center text-destructive">
            {error}
          </CardContent>
        </Card>
      )}

      {isInQueue && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="py-3 px-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Badge className="bg-background text-foreground border hover:bg-background">
                复习 {currentIndex + 1} / {reviewQueue.length}
              </Badge>
              <span className="text-sm text-muted-foreground font-medium">
                {activeWord}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="h-8"
                disabled={currentIndex === 0}
                onClick={() => {
                  const prev = reviewQueue[currentIndex - 1]
                  if (prev) {
                    searchWord(prev)
                    window.history.pushState({}, "", `/?word=${encodeURIComponent(prev)}`)
                  }
                }}
              >
                上一个
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="h-8"
                disabled={currentIndex === reviewQueue.length - 1}
                onClick={() => {
                  const next = reviewQueue[currentIndex + 1]
                  if (next) {
                    searchWord(next)
                    window.history.pushState({}, "", `/?word=${encodeURIComponent(next)}`)
                  }
                }}
              >
                下一个
              </Button>
              <div className="w-px h-4 bg-border mx-1" />
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 text-muted-foreground"
                onClick={() => window.location.href = "/vocabulary"}
              >
                返回生词本
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 text-muted-foreground hover:text-destructive"
                onClick={() => {
                  sessionStorage.removeItem(REVIEW_QUEUE_KEY)
                  setReviewQueue([])
                }}
              >
                退出复习
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loadingDict && !dictData && (
        <Card>
          <CardContent className="pt-6 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在查询词典...
          </CardContent>
        </Card>
      )}

      {dictData && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <CardTitle className="text-2xl font-bold">{dictData.word}</CardTitle>
                <div className="mt-1 flex items-center gap-3 text-muted-foreground">
                  {dictData.phonetic && (
                    <span className="font-mono text-sm">{dictData.phonetic}</span>
                  )}
                  {dictData.phonetics?.filter(p => p.audio).map((p, i) => (
                    <Button
                      key={i}
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => playAudio(p.audio!)}
                    >
                      <Volume2 className="h-4 w-4" />
                    </Button>
                  ))}
                  {fromCache && (
                    <Badge className="text-xs bg-emerald-100 text-emerald-700">已缓存</Badge>
                  )}
                </div>
                {aiData?.chineseDefinition && (
                  <div className="mt-2 text-base font-medium flex items-start gap-1.5">
                    <Languages className="h-4 w-4 text-blue-500 mt-1 shrink-0" />
                    <div className="whitespace-pre-wrap leading-relaxed">
                      {aiData.chineseDefinition}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={retryCurrentWord}
                  disabled={loadingDict || loadingAI}
                >
                  {loadingDict || loadingAI ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  重新查询
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.location.href = `/roleplay?word=${dictData.word}`}
                >
                  <Swords className="h-4 w-4" />
                  去实战
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={deleteCurrentWord}
                  disabled={deletingWord}
                >
                  {deletingWord ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  删除当前词
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {dictData.meanings.map((meaning, i) => (
              <div key={i}>
                <Badge className="mb-2">{meaning.partOfSpeech}</Badge>
                <ol className="list-decimal list-inside space-y-1 text-sm">
                  {meaning.definitions.slice(0, 4).map((def, j) => (
                    <li key={j}>
                      {def.definition}
                      {def.example && (
                        <p className="ml-5 mt-0.5 text-muted-foreground italic">&ldquo;{def.example}&rdquo;</p>
                      )}
                    </li>
                  ))}
                </ol>
                {meaning.synonyms.length > 0 && (
                  <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs text-muted-foreground">同义词:</span>
                    {meaning.synonyms.slice(0, 6).map(s => (
                      <Badge key={s} className="cursor-pointer text-xs" onClick={() => searchWord(s)}>{s}</Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {dictData.origin && (
              <p className="text-xs text-muted-foreground border-t pt-3">{dictData.origin}</p>
            )}
          </CardContent>
        </Card>
      )}

      {loadingAI && !aiData && (
        <Card>
          <CardContent className="pt-6 flex items-center justify-center gap-2 text-muted-foreground">
            <Sparkles className="h-4 w-4 animate-pulse" />
            AI 正在分析...
          </CardContent>
        </Card>
      )}

      {aiData && (
        <div className="space-y-4">
          {aiData.coreImage && (
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="pt-6 flex items-start gap-3">
                <Eye className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <h4 className="font-semibold text-primary mb-1">核心意象</h4>
                  <p className="text-sm leading-relaxed">{aiData.coreImage}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {aiData.senseMap && aiData.senseMap.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <MapIcon className="h-4 w-4 text-indigo-500" />
                  词义图谱
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2">
                  {aiData.senseMap.map((sense, i) => (
                    <div key={i} className="bg-muted/50 p-3 rounded-md border">
                      <div className="font-medium text-sm mb-1">{sense.meaning}</div>
                      <div className="text-xs text-muted-foreground">{sense.usage}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {aiData.collocations && aiData.collocations.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Link2 className="h-4 w-4 text-orange-500" />
                  地道搭配
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {aiData.collocations.map((col, i) => (
                    <Badge key={i} className="px-3 py-1.5 text-sm font-normal">
                      {col}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {aiData.synonymBoundaries && aiData.synonymBoundaries.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Split className="h-4 w-4 text-teal-500" />
                  近义词边界
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {aiData.synonymBoundaries.map((syn, i) => (
                    <div key={i} className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
                      <Badge className="w-fit shrink-0 bg-teal-50/50 text-teal-700 border-teal-200">
                        vs {syn.synonym}
                      </Badge>
                      <p className="text-sm leading-relaxed text-muted-foreground">{syn.difference}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {aiData.commonMistakes && aiData.commonMistakes.length > 0 && (
            <Card className="border-red-200 bg-red-50/30">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base text-red-700">
                  <AlertTriangle className="h-4 w-4" />
                  常见误区
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {aiData.commonMistakes.map((mistake, i) => (
                    <li key={i} className="text-sm leading-relaxed text-red-800/90 flex items-start gap-2">
                      <span className="text-red-500 mt-0.5">•</span>
                      {mistake}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {aiData.personalizedExamples && aiData.personalizedExamples.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  兴趣定制例句
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {aiData.personalizedExamples.map((ex, i) => (
                    <li key={i} className="text-sm leading-relaxed pl-4 border-l-2 border-amber-200">
                      {ex}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {aiData.nuanceAnalysis && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <BookOpen className="h-4 w-4 text-blue-500" />
                  母语级语感辨析
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{aiData.nuanceAnalysis}</p>
              </CardContent>
            </Card>
          )}

          {aiData.etymologyStory && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <HistoryIcon className="h-4 w-4 text-emerald-500" />
                  词源微故事
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{aiData.etymologyStory}</p>
              </CardContent>
            </Card>
          )}

          {aiData.mnemonicHook && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Brain className="h-4 w-4 text-purple-500" />
                    脑洞记忆法
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={regenerateMnemonic} disabled={loadingMnemonic}>
                    <RefreshCw className={`h-3.5 w-3.5 ${loadingMnemonic ? "animate-spin" : ""}`} />
                    换一个脑洞
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{aiData.mnemonicHook}</p>
              </CardContent>
            </Card>
          )}

          {aiData.multiHookMemory && aiData.multiHookMemory.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Lightbulb className="h-4 w-4 text-yellow-500" />
                  多维记忆钩子
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {aiData.multiHookMemory.map((hook, i) => (
                    <li key={i} className="text-sm leading-relaxed flex items-start gap-2">
                      <span className="text-yellow-500 mt-0.5">💡</span>
                      {hook}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {aiData.activeRecall && (
            <Card className="bg-slate-50/50 border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base text-slate-700">
                  <HelpCircle className="h-4 w-4" />
                  主动回想
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <p className="text-sm font-medium text-slate-800">{aiData.activeRecall.question}</p>
                  <details className="group">
                    <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700 transition-colors select-none">
                      点击查看答案
                    </summary>
                    <div className="mt-2 p-3 bg-white rounded-md border border-slate-100 text-sm text-slate-600">
                      {aiData.activeRecall.answer}
                    </div>
                  </details>
                </div>
              </CardContent>
            </Card>
          )}

          {aiData.practiceTask && (
            <Card className="bg-blue-50/30 border-blue-100">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base text-blue-700">
                  <PenTool className="h-4 w-4" />
                  实践任务
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-blue-900/80">{aiData.practiceTask}</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <ImageIcon className="h-4 w-4 text-pink-500" />
                AI 视觉辅助
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!generatedImage && !loadingImage && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => generateWordImage("mood")}>
                    <ImageIcon className="h-3.5 w-3.5" />
                    生成意境图
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => generateWordImage("meme")}>
                    <Sparkles className="h-3.5 w-3.5" />
                    生成梗图
                  </Button>
                </div>
              )}
              {loadingImage && (
                <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  正在生成{imageMode === "mood" ? "意境图" : "梗图"}...
                </div>
              )}
              {generatedImage && (
                <div className="space-y-2">
                  <img
                    src={generatedImage}
                    alt={`${activeWord} ${imageMode === "mood" ? "意境图" : "梗图"}`}
                    className="w-full max-w-md rounded-lg border mx-auto"
                  />
                  <div className="flex gap-2 justify-center">
                    <Button variant="ghost" size="sm" onClick={() => generateWordImage("mood")}>
                      <RefreshCw className="h-3.5 w-3.5" />
                      换意境图
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => generateWordImage("meme")}>
                      <RefreshCw className="h-3.5 w-3.5" />
                      换梗图
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {dictData && aiData && (
        <WordChatPanel word={activeWord} dictData={dictData} aiData={aiData} />
      )}

      {results.size === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg">输入单词，开始探索</p>
          <p className="text-sm mt-1">AI 将为你提供定制例句、语感辨析、词源故事和记忆法</p>
        </div>
      )}
    </div>
  )
}
