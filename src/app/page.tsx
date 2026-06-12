"use client"

import { useSearchParams } from "next/navigation"
import { Suspense, useState, useRef, useEffect, useCallback } from "react"
import { Search, Volume2, RefreshCw, Swords, Loader2, Sparkles, History as HistoryIcon, BookOpen, Languages, Eye, Map as MapIcon, Link2, Split, AlertTriangle, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import type { DictionaryEntry, AIWordData } from "@/types/dictionary"
import { parseLookupResponse } from "@/lib/ai-parser"

const HISTORY_KEY = "ai-dict-search-history"
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
  error: string
  fromCache: boolean
}

function HomeContent() {
  const searchParams = useSearchParams()
  const wordParam = searchParams.get("word")
  const [query, setQuery] = useState(wordParam ?? "")
  const [results, setResults] = useState<Map<string, WordResult>>(new Map<string, WordResult>())
  const [activeWord, setActiveWord] = useState<string>("")
  const [history, setHistory] = useState<string[]>(() => getHistory())
  const inputRef = useRef<HTMLInputElement>(null)
  const initialized = useRef(false)
  
  const activeResult = activeWord ? results.get(activeWord) : null
  const dictData = activeResult?.dictData ?? null
  const aiData = activeResult?.aiData ?? null
  const loadingDict = activeResult?.loadingDict ?? false
  const loadingAI = activeResult?.loadingAI ?? false
  const error = activeResult?.error ?? ""
  const fromCache = activeResult?.fromCache ?? false

  const updateResult = useCallback((word: string, patch: Partial<WordResult>) => {
    setResults(prev => {
      const existing = prev.get(word)
      if (!existing) return prev
      return new Map(prev).set(word, { ...existing, ...patch })
    })
  }, [])

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
      loadingDict: true, loadingAI: true,
      error: "", fromCache: false,
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
        fetchedAi = parseLookupResponse(accumulated)
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
      void Promise.resolve().then(() => searchWord(wordParam))
    }
  }, [wordParam, searchWord])

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
                  onClick={() => window.location.href = `/roleplay?word=${encodeURIComponent(dictData.word)}`}
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

        </div>
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
