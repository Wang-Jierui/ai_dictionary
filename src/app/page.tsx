"use client"

import { useSearchParams } from "next/navigation"
import { Suspense, useState, useRef, useEffect, useCallback } from "react"
import { RefreshCw, Swords, Loader2, Sparkles, History as HistoryIcon, BookOpen, Languages, Trash2, Edit3, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { AiLearningSection, WordImagePanel, type WordImageMode } from "@/components/ai-learning-sections"
import { WordChatPanel } from "@/components/word-chat-panel"
import { ReadingWorkspace } from "@/components/reading-workspace"
import { DictionarySource } from "@/components/dictionary-source"
import { WordPronunciation } from "@/components/word-pronunciation"
import type { AISectionId } from "@/lib/constants"
import { DEFAULT_SECTION_ORDER, sanitizeSectionOrder } from "@/lib/section-order"
import type { DictionaryEntry, AIWordData } from "@/types/dictionary"

const HISTORY_KEY = "ai-dict-search-history"
const MAX_HISTORY = 8
const DICTIONARY_ERROR_MESSAGES: Record<string, string> = {
  NOT_FOUND: "词典未收录该词，可先参考 AI 解释。",
  TIMEOUT: "词典服务响应超时，可先参考 AI 解释。",
  RATE_LIMITED: "词典服务请求过于频繁，请稍后重试。",
}
const DICTIONARY_UNAVAILABLE_MESSAGE = "词典暂时不可用，可先参考 AI 解释。"

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
  imageData: string | null
  imageMode: WordImageMode | null
  generatingImage: boolean
  notes: string
  loadingDict: boolean
  loadingAI: boolean
  error: string
  dictionaryError: string
  fromCache: boolean
}

interface LookupResponse {
  cached?: boolean
  dictData?: DictionaryEntry | null
  aiData?: AIWordData
  imageData?: string | null
  imageMode?: string | null
  notes?: string | null
  error?: string
  code?: string
}

function HomeContent() {
  const searchParams = useSearchParams()
  const wordParam = searchParams.get("word")
  const [query, setQuery] = useState(wordParam ?? "")
  const [results, setResults] = useState<Map<string, WordResult>>(new Map<string, WordResult>())
  const [activeWord, setActiveWord] = useState<string>("")
  const [history, setHistory] = useState<string[]>(() => getHistory())
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesValue, setNotesValue] = useState("")
  const [savingNotes, setSavingNotes] = useState(false)
  const [sectionOrder, setSectionOrder] = useState<AISectionId[]>(DEFAULT_SECTION_ORDER)
  const initialized = useRef(false)
  
  const activeResult = activeWord ? results.get(activeWord) : null
  const dictData = activeResult?.dictData ?? null
  const aiData = activeResult?.aiData ?? null
  const loadingDict = activeResult?.loadingDict ?? false
  const loadingAI = activeResult?.loadingAI ?? false
  const error = activeResult?.error ?? ""
  const dictionaryError = activeResult?.dictionaryError ?? ""
  const fromCache = activeResult?.fromCache ?? false

  useEffect(() => {
    fetch("/api/settings")
      .then(res => res.json())
      .then(data => setSectionOrder(sanitizeSectionOrder(data.sectionOrder)))
      .catch(() => setSectionOrder([...DEFAULT_SECTION_ORDER]))
  }, [])

  useEffect(() => {
    if (!editingNotes) setNotesValue(activeResult?.notes ?? "")
  }, [activeResult?.notes, activeWord, editingNotes])

  useEffect(() => {
    setEditingNotes(false)
  }, [activeWord])

  const updateResult = useCallback((word: string, patch: Partial<WordResult>) => {
    setResults(prev => {
      const existing = prev.get(word)
      if (!existing) return prev
      return new Map(prev).set(word, { ...existing, ...patch })
    })
  }, [])

  const autoSave = useCallback(async (word: string, dict: DictionaryEntry | null, ai: AIWordData) => {
    const briefDef = dict?.meanings[0]?.definitions[0]?.definition ?? ""
    const response = await fetch("/api/vocabulary/save", {
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
    if (!response.ok) throw new Error("Failed to save dictionary data")
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
      imageData: null, imageMode: null, generatingImage: false,
      notes: "",
      loadingDict: true, loadingAI: true,
      error: "", dictionaryError: "", fromCache: false,
    }
    setResults(prev => new Map(prev).set(trimmed, initial))

    let fetchedDict: DictionaryEntry | null = null
    let fetchedAi: AIWordData | null = null
    let shouldSaveDictionary = false

    const aiPromise = fetch("/api/ai/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word: trimmed, forceRefresh: options?.forceRefresh === true }),
    }).then(async res => {
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as LookupResponse
        const message = data.code === "PARSE_ERROR"
          ? "AI 返回的单词数据格式不正确，无法解析。请稍后重试。"
          : data.error || "AI 查询失败"
        updateResult(trimmed, { error: message, loadingAI: false })
        return
      }

      const data = await res.json() as LookupResponse
      fetchedAi = data.aiData ?? null
      shouldSaveDictionary = !data.dictData
      fetchedDict = fetchedDict ?? data.dictData ?? null
      const imageMode = data.imageMode === "mood" || data.imageMode === "meme" ? data.imageMode : null
      const patch: Partial<WordResult> = {
        fromCache: data.cached === true,
        aiData: fetchedAi,
        imageData: data.imageData ?? null,
        imageMode,
        notes: data.notes ?? "",
        loadingAI: false,
      }
      if (fetchedDict) {
        patch.dictData = fetchedDict
        patch.loadingDict = false
        patch.dictionaryError = ""
      }
      updateResult(trimmed, patch)
    }).catch(() => updateResult(trimmed, { error: "AI 查询失败，请检查网络后重试。", loadingAI: false }))

    const dictPromise = fetch(`/api/dictionary?word=${encodeURIComponent(trimmed)}`, {
      signal: AbortSignal.timeout(10000),
    })
      .then(async res => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({})) as LookupResponse
          throw new Error(DICTIONARY_ERROR_MESSAGES[data.code ?? ""] ?? DICTIONARY_UNAVAILABLE_MESSAGE)
        }
        return res.json() as Promise<DictionaryEntry>
      })
      .then(data => {
        fetchedDict = data
        updateResult(trimmed, { dictData: data, loadingDict: false, dictionaryError: "" })
      })
      .catch(err => {
        const patch: Partial<WordResult> = { loadingDict: false }
        if (!fetchedDict) {
          patch.dictionaryError = err.name === "TimeoutError"
            ? DICTIONARY_ERROR_MESSAGES.TIMEOUT
            : Object.values(DICTIONARY_ERROR_MESSAGES).includes(err.message) ? err.message : DICTIONARY_UNAVAILABLE_MESSAGE
        }
        updateResult(trimmed, patch)
      })

    await Promise.all([dictPromise, aiPromise])

    // Repair entries saved during a dictionary outage, including cached AI results.
    if (fetchedDict && fetchedAi && shouldSaveDictionary) {
      void autoSave(trimmed, fetchedDict, fetchedAi).catch(() => {
        updateResult(trimmed, { dictionaryError: "词典释义已获取，但保存失败，请稍后重新查询。" })
      })
    }
  }, [autoSave, updateResult])

  useEffect(() => {
    if (wordParam && !initialized.current) {
      initialized.current = true
      void Promise.resolve().then(() => searchWord(wordParam))
    }
  }, [wordParam, searchWord])

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

  const saveNotes = async () => {
    if (!activeResult || savingNotes) return
    setSavingNotes(true)
    try {
      await fetch("/api/vocabulary/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word: activeResult.word,
          notes: notesValue,
          briefDefinition: activeResult.dictData?.meanings[0]?.definitions[0]?.definition ?? "",
        }),
      })
      updateResult(activeResult.word, { notes: notesValue })
      setEditingNotes(false)
    } finally {
      setSavingNotes(false)
    }
  }

  const generateWordImage = async (word: string, mode: WordImageMode) => {
    const result = results.get(word)
    if (!result || result.generatingImage) return

    updateResult(word, { generatingImage: true })
    try {
      const meaning = result.dictData?.meanings[0]?.definitions[0]?.definition ?? result.aiData?.chineseDefinition ?? ""
      const res = await fetch("/api/ai/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word, meaning, mode }),
      })
      if (!res.ok) return

      const data = (await res.json()) as { base64?: string; url?: string }
      const imageData = data.base64 ? `data:image/png;base64,${data.base64}` : data.url
      if (!imageData) return

      updateResult(word, { imageData, imageMode: mode })
      await fetch("/api/vocabulary/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word,
          imageData: data.base64 ?? data.url,
          imageMode: mode,
          briefDefinition: result.dictData?.meanings[0]?.definitions[0]?.definition ?? "",
        }),
      })
    } finally {
      updateResult(word, { generatingImage: false })
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
    <ReadingWorkspace query={query} onQueryChange={setQuery} onLookupWord={searchWord}>
    <div className="space-y-6">
      <div className="space-y-3">
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

      {dictionaryError && (
        <Card>
          <CardContent className="pt-6 flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span role="status">{dictionaryError}</span>
            <Button variant="outline" size="sm" onClick={retryCurrentWord} disabled={loadingDict || loadingAI}>
              <RefreshCw className="h-4 w-4" />
              重新查询
            </Button>
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
                <div className="mt-1 flex flex-wrap items-center gap-3 text-muted-foreground">
                  <WordPronunciation data={dictData} />
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
                  onClick={() => window.location.href = `/practice/roleplay?word=${encodeURIComponent(dictData.word)}`}
                >
                  <Swords className="h-4 w-4" />
                  去实战
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
            <DictionarySource data={dictData} />
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
          {sectionOrder.map(sectionId => (
            <AiLearningSection key={sectionId} sectionId={sectionId} aiData={aiData} word={activeWord} />
          ))}

          <WordImagePanel
            word={activeWord}
            imageData={activeResult?.imageData ?? null}
            imageMode={activeResult?.imageMode ?? null}
            generatingImage={activeResult?.generatingImage ?? false}
            onGenerate={generateWordImage}
          />

          {dictData && <WordChatPanel word={activeWord} dictData={dictData} aiData={aiData} />}

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Edit3 className="h-4 w-4 text-slate-500" />
                  个人笔记
                </CardTitle>
                {!editingNotes ? (
                  <Button variant="ghost" size="sm" onClick={() => setEditingNotes(true)}>
                    <Edit3 className="h-3.5 w-3.5" />
                    编辑
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => { setEditingNotes(false); setNotesValue(activeResult?.notes ?? "") }} disabled={savingNotes}>取消</Button>
                    <Button size="sm" onClick={saveNotes} disabled={savingNotes}>
                      {savingNotes ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      保存
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {editingNotes ? (
                <Textarea value={notesValue} onChange={event => setNotesValue(event.target.value)} placeholder="在这里记录你的学习心得、例句 or 联想..." className="min-h-24" autoFocus />
              ) : (
                <div className="min-h-10 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{activeResult?.notes || "暂无笔记，点击编辑添加。"}</div>
              )}
            </CardContent>
          </Card>

        </div>
      )}

      {results.size === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg">读到哪里不明白，就从这里开始</p>
          <p className="text-sm mt-1">查一个单词，或粘贴一句英文，理解它在原文中的意思</p>
        </div>
      )}
    </div>
    </ReadingWorkspace>
  )
}
