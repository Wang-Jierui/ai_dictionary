"use client"

import { useSearchParams } from "next/navigation"
import { Suspense, useState, useRef, useEffect, useCallback } from "react"
import { Search, Volume2, RefreshCw, Swords, Loader2, Sparkles, Brain, History as HistoryIcon, BookOpen, ImageIcon, Languages } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import type { DictionaryEntry, AIWordData } from "@/types/dictionary"
import { WordChatPanel } from "@/components/word-chat-panel"

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

function HomeContent() {
  const searchParams = useSearchParams()
  const wordParam = searchParams.get("word")
  const [query, setQuery] = useState(wordParam ?? "")
  const [dictData, setDictData] = useState<DictionaryEntry | null>(null)
  const [aiData, setAiData] = useState<AIWordData | null>(null)
  const [loadingDict, setLoadingDict] = useState(false)
  const [loadingAI, setLoadingAI] = useState(false)
  const [loadingMnemonic, setLoadingMnemonic] = useState(false)
  const [history, setHistory] = useState<string[]>([])
  const [error, setError] = useState("")
  const [generatedImage, setGeneratedImage] = useState<string | null>(null)
  const [loadingImage, setLoadingImage] = useState(false)
  const [imageMode, setImageMode] = useState<"mood" | "meme">("mood")
  const [fromCache, setFromCache] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const initialized = useRef(false)

  useEffect(() => {
    setHistory(getHistory())
  }, [])

  useEffect(() => {
    if (wordParam && !initialized.current) {
      initialized.current = true
      searchWord(wordParam)
    }
  }, [wordParam])

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

  const searchWord = useCallback(async (word: string) => {
    const trimmed = word.trim()
    if (!trimmed) return

    setQuery(trimmed)
    setError("")
    setDictData(null)
    setAiData(null)
    setGeneratedImage(null)
    setFromCache(false)
    setLoadingDict(true)
    setLoadingAI(true)

    addHistory(trimmed)
    setHistory(getHistory())

    let fetchedDict: DictionaryEntry | null = null

    const aiPromise = fetch("/api/ai/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word: trimmed }),
    }).then(async res => {
      if (!res.ok) {
        setLoadingAI(false)
        return
      }

      const contentType = res.headers.get("content-type") ?? ""
      if (contentType.includes("application/json")) {
        const data = await res.json()
        if (data.cached) {
          setFromCache(true)
          if (data.dictData) {
            setDictData(data.dictData as DictionaryEntry)
            fetchedDict = data.dictData as DictionaryEntry
            setLoadingDict(false)
          }
          setAiData(data.aiData as AIWordData)
          setLoadingAI(false)
          return
        }
      }

      const reader = res.body?.getReader()
      if (!reader) { setLoadingAI(false); return }

      const decoder = new TextDecoder()
      let accumulated = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
      }

      try {
        const parsed = JSON.parse(accumulated) as AIWordData
        setAiData(parsed)
        if (fetchedDict) {
          autoSave(trimmed, fetchedDict, parsed)
        }
      } catch {
        setAiData({
          chineseDefinition: "",
          personalizedExamples: [],
          nuanceAnalysis: accumulated,
          etymologyStory: "",
          mnemonicHook: "",
        })
      }
      setLoadingAI(false)
    }).catch(() => {
      setLoadingAI(false)
    })

    const dictPromise = fetch(`/api/dictionary?word=${encodeURIComponent(trimmed)}`)
      .then(async res => {
        if (!res.ok) throw new Error("未找到该单词")
        return res.json() as Promise<DictionaryEntry>
      })
      .then(data => {
        setDictData(data)
        fetchedDict = data
        setLoadingDict(false)
      })
      .catch(err => {
        if (!fromCache) setError(err.message)
        setLoadingDict(false)
      })

    await Promise.all([dictPromise, aiPromise])

    if (fetchedDict && !fromCache) {
      const currentAi = aiData
      if (currentAi) {
        autoSave(trimmed, fetchedDict, currentAi)
      }
    }
  }, [autoSave, fromCache, aiData])

  const regenerateMnemonic = async () => {
    if (!query || loadingMnemonic) return
    setLoadingMnemonic(true)

    try {
      const res = await fetch("/api/ai/mnemonic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: query }),
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

      setAiData(prev => prev ? { ...prev, mnemonicHook: text } : prev)
    } finally {
      setLoadingMnemonic(false)
    }
  }

  const generateWordImage = async (mode: "mood" | "meme") => {
    if (!query || loadingImage) return
    setLoadingImage(true)
    setImageMode(mode)
    setGeneratedImage(null)

    try {
      const meaning = dictData?.meanings[0]?.definitions[0]?.definition ?? query
      const res = await fetch("/api/ai/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: query, meaning, mode }),
      })

      const data = await res.json()
      if (data.base64) {
        setGeneratedImage(`data:image/png;base64,${data.base64}`)
        fetch("/api/vocabulary/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ word: query, imageData: data.base64, imageMode: mode }),
        })
      } else if (data.url) {
        setGeneratedImage(data.url)
        fetch("/api/vocabulary/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ word: query, imageData: data.url, imageMode: mode }),
        })
      } else if (data.error) {
        setError(data.error)
      }
    } catch {
      setError("图片生成失败")
    } finally {
      setLoadingImage(false)
    }
  }

  const playAudio = (url: string) => {
    const audioUrl = url.startsWith("//") ? `https:${url}` : url
    new Audio(audioUrl).play()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") searchWord(query)
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
          <Button onClick={() => searchWord(query)} disabled={loadingDict || loadingAI} className="h-11 px-6">
            {loadingDict ? <Loader2 className="h-4 w-4 animate-spin" /> : "查询"}
          </Button>
        </div>

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
            <div className="flex items-start justify-between">
              <div>
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
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.location.href = `/roleplay?word=${dictData.word}`}
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
          {aiData.personalizedExamples.length > 0 && (
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
                    alt={`${query} ${imageMode === "mood" ? "意境图" : "梗图"}`}
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
        <WordChatPanel word={query} dictData={dictData} aiData={aiData} />
      )}

      {!dictData && !loadingDict && !error && (
        <div className="text-center py-20 text-muted-foreground">
          <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg">输入单词，开始探索</p>
          <p className="text-sm mt-1">AI 将为你提供定制例句、语感辨析、词源故事和记忆法</p>
        </div>
      )}
    </div>
  )
}
