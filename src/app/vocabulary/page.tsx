"use client"

import { useState, useEffect, useRef } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Trash2, Loader2, BookOpen, Sparkles, Search, Brain, Lightbulb, HelpCircle, PenTool, ImageIcon, RefreshCw, Swords, Volume2, ChevronLeft, ChevronRight, X, Edit3, Save, Languages, Eye, Map as MapIcon, Link2, Split, AlertTriangle, History as HistoryIcon } from "lucide-react"
import type { VocabularyEntry } from "@/types/dictionary"
import { WordChatPanel } from "@/components/word-chat-panel"

export default function VocabularyPage() {
  const [words, setWords] = useState<VocabularyEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const [reviewMode, setReviewMode] = useState(false)
  const [reviewIndex, setReviewIndex] = useState(0)
  const [reviewQueue, setReviewQueue] = useState<VocabularyEntry[]>([])

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedData, setExpandedData] = useState<VocabularyEntry | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const detailRequestId = useRef(0)

  const [generatingMnemonic, setGeneratingMnemonic] = useState(false)
  const [generatingImage, setGeneratingImage] = useState(false)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesValue, setNotesValue] = useState("")

  useEffect(() => {
    fetch("/api/vocabulary")
      .then(res => {
        if (!res.ok) throw new Error("生词本加载失败，请确认数据库已启动")
        return res.json()
      })
      .then(data => {
        setWords(data)
        setLoading(false)
      })
      .catch(err => {
        setLoadError(err instanceof Error ? err.message : "生词本加载失败")
        setLoading(false)
      })
  }, [])

  const deleteWord = async (id: string) => {
    const res = await fetch(`/api/vocabulary?id=${encodeURIComponent(id)}`, { method: "DELETE" })
    if (!res.ok) {
      setLoadError("删除失败，请稍后重试")
      return
    }
    setWords(prev => prev.filter(w => w.id !== id))
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    if (expandedId === id) {
      setExpandedId(null)
      setExpandedData(null)
    }
    if (reviewMode) {
      const newQueue = reviewQueue.filter(w => w.id !== id)
      setReviewQueue(newQueue)
      if (newQueue.length === 0) {
        setReviewMode(false)
      } else if (reviewIndex >= newQueue.length) {
        setReviewIndex(newQueue.length - 1)
      }
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const goToStory = () => {
    const selectedWords = words
      .filter(w => selectedIds.has(w.id))
      .map(w => w.word)
    if (selectedWords.length < 2) return
    window.location.href = `/story?words=${encodeURIComponent(selectedWords.join(","))}`
  }

  const loadDetail = async (id: string, forceOpen = false) => {
    if (!forceOpen && expandedId === id) {
      setExpandedId(null)
      setExpandedData(null)
      setEditingNotes(false)
      return
    }
    setExpandedId(id)
    setLoadingDetail(true)
    setEditingNotes(false)
    const requestId = detailRequestId.current + 1
    detailRequestId.current = requestId
    try {
      const res = await fetch(`/api/vocabulary?id=${encodeURIComponent(id)}`)
      if (res.ok) {
        const data = await res.json() as VocabularyEntry
        if (detailRequestId.current !== requestId) return
        setExpandedData(data)
        setNotesValue(data.notes || "")
      } else if (detailRequestId.current === requestId) {
        setLoadError("单词详情加载失败，请稍后重试")
      }
    } finally {
      if (detailRequestId.current === requestId) {
        setLoadingDetail(false)
      }
    }
  }

  const startReview = () => {
    const queue = words.filter(w => {
      const q = searchQuery.toLowerCase()
      return w.word.toLowerCase().includes(q) ||
             (w.chineseDefinition && w.chineseDefinition.toLowerCase().includes(q)) ||
             w.briefDefinition.toLowerCase().includes(q)
    })
    if (queue.length === 0) return
    setReviewQueue(queue)
    setReviewIndex(0)
    setReviewMode(true)
    if (expandedData?.id !== queue[0].id) setExpandedData(null)
    void loadDetail(queue[0].id, true)
  }

  const nextReview = () => {
    if (reviewIndex < reviewQueue.length - 1) {
      const nextIdx = reviewIndex + 1
      setReviewIndex(nextIdx)
      void loadDetail(reviewQueue[nextIdx].id, true)
    }
  }

  const prevReview = () => {
    if (reviewIndex > 0) {
      const prevIdx = reviewIndex - 1
      setReviewIndex(prevIdx)
      void loadDetail(reviewQueue[prevIdx].id, true)
    }
  }

  const exitReview = () => {
    setReviewMode(false)
    setExpandedId(null)
    setExpandedData(null)
  }

  const regenerateMnemonic = async (word: string) => {
    if (generatingMnemonic || !expandedData) return
    setGeneratingMnemonic(true)

    try {
      const res = await fetch("/api/ai/mnemonic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word }),
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

      if (expandedData.aiData) {
        const newAiData = { ...expandedData.aiData, mnemonicHook: text }
        setExpandedData({ ...expandedData, aiData: newAiData })

        // Save to DB
        await fetch("/api/vocabulary/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            word,
            aiData: newAiData,
            briefDefinition: expandedData.briefDefinition
          }),
        })
      }
    } finally {
      setGeneratingMnemonic(false)
    }
  }

  const generateWordImage = async (word: string, mode: "mood" | "meme") => {
    if (generatingImage || !expandedData) return
    setGeneratingImage(true)

    try {
      const meaning = expandedData.dictData?.meanings[0]?.definitions[0]?.definition ?? word
      const res = await fetch("/api/ai/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word, meaning, mode }),
      })

      const data = await res.json()
      let newImageData = null
      if (data.base64) {
        newImageData = `data:image/png;base64,${data.base64}`
      } else if (data.url) {
        newImageData = data.url
      }

      if (newImageData) {
        setExpandedData({ ...expandedData, imageData: newImageData, imageMode: mode })
        await fetch("/api/vocabulary/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ word, imageData: data.base64 || data.url, imageMode: mode, briefDefinition: expandedData.briefDefinition }),
        })
      }
    } finally {
      setGeneratingImage(false)
    }
  }

  const saveNotes = async (word: string) => {
    if (!expandedData) return
    try {
      await fetch("/api/vocabulary/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word,
          notes: notesValue,
          briefDefinition: expandedData.briefDefinition
        }),
      })
      setExpandedData({ ...expandedData, notes: notesValue })
      setEditingNotes(false)
    } catch {
      setLoadError("笔记保存失败，请稍后重试")
    }
  }

  const playAudio = (url: string) => {
    const audioUrl = url.startsWith("//") ? `https:${url}` : url
    new Audio(audioUrl).play()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        加载生词本...
      </div>
    )
  }

  const filteredWords = words.filter(w => {
    const q = searchQuery.toLowerCase()
      return w.word.toLowerCase().includes(q) ||
           (w.chineseDefinition && w.chineseDefinition.toLowerCase().includes(q)) ||
           w.briefDefinition.toLowerCase().includes(q)
  })

  const renderDetailPanel = (entry: VocabularyEntry) => {
    if (expandedData?.id !== entry.id) {
      if (!loadingDetail || expandedId !== entry.id) return null

      return (
        <div className="p-8 flex justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )
    }

    const { dictData, aiData, imageData, imageMode } = expandedData

    return (
      <div className="p-4 border-t bg-muted/10 space-y-6 cursor-default" onClick={e => e.stopPropagation()}>
        {dictData && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <span className="text-xl font-bold">{dictData.word}</span>
                {dictData.phonetic && <span className="font-mono text-sm text-muted-foreground">{dictData.phonetic}</span>}
                {dictData.phonetics?.filter(p => p.audio).map((p, i) => (
                  <Button key={i} variant="ghost" size="icon" className="h-7 w-7" onClick={() => playAudio(p.audio!)}>
                    <Volume2 className="h-4 w-4" />
                  </Button>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={() => window.location.href = `/roleplay?word=${encodeURIComponent(dictData.word)}`}>
                <Swords className="h-4 w-4 mr-2" />
                去实战
              </Button>
            </div>
            {aiData?.chineseDefinition && (
              <div className="mt-2 text-base font-medium flex items-start gap-1.5">
                <Languages className="h-4 w-4 text-blue-500 mt-1 shrink-0" />
                <div className="whitespace-pre-wrap leading-relaxed">
                  {aiData.chineseDefinition}
                </div>
              </div>
            )}
            <div className="space-y-2">
              {dictData.meanings.map((meaning, i) => (
                <div key={i}>
                  <Badge className="mb-1">{meaning.partOfSpeech}</Badge>
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    {meaning.definitions.slice(0, 2).map((def, j) => (
                      <li key={j}>
                        {def.definition}
                        {def.example && <p className="ml-5 mt-0.5 text-muted-foreground italic">&ldquo;{def.example}&rdquo;</p>}
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </div>
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
                    <Button variant="ghost" size="sm" onClick={() => regenerateMnemonic(entry.word)} disabled={generatingMnemonic}>
                      <RefreshCw className={`h-3.5 w-3.5 ${generatingMnemonic ? "animate-spin" : ""}`} />
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
                {!imageData && !generatingImage && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => generateWordImage(entry.word, "mood")}>
                      <ImageIcon className="h-3.5 w-3.5 mr-2" />
                      生成意境图
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => generateWordImage(entry.word, "meme")}>
                      <Sparkles className="h-3.5 w-3.5 mr-2" />
                      生成梗图
                    </Button>
                  </div>
                )}
                {generatingImage && (
                  <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    正在生成图片...
                  </div>
                )}
                {imageData && (
                  <div className="space-y-2">
                    <Image
                      src={imageData.startsWith("http") || imageData.startsWith("data:") ? imageData : `data:image/png;base64,${imageData}`}
                      alt={`${entry.word} ${imageMode === "mood" ? "意境图" : "梗图"}`}
                      width={512}
                      height={512}
                      unoptimized
                      className="w-full max-w-md rounded-lg border mx-auto"
                    />
                    <div className="flex gap-2 justify-center">
                      <Button variant="ghost" size="sm" onClick={() => generateWordImage(entry.word, "mood")}>
                        <RefreshCw className="h-3.5 w-3.5 mr-2" />
                        换意境图
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => generateWordImage(entry.word, "meme")}>
                        <RefreshCw className="h-3.5 w-3.5 mr-2" />
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
          <WordChatPanel word={entry.word} dictData={dictData} aiData={aiData} />
        )}

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Edit3 className="h-4 w-4 text-slate-500" />
                个人笔记
              </CardTitle>
              {!editingNotes ? (
                <Button variant="ghost" size="sm" onClick={() => setEditingNotes(true)}>
                  <Edit3 className="h-3.5 w-3.5 mr-2" />
                  编辑
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => { setEditingNotes(false); setNotesValue(expandedData.notes || "") }}>
                    取消
                  </Button>
                  <Button variant="default" size="sm" onClick={() => saveNotes(entry.word)}>
                    <Save className="h-3.5 w-3.5 mr-2" />
                    保存
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {editingNotes ? (
              <textarea
                className="w-full min-h-[100px] p-3 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                value={notesValue}
                onChange={e => setNotesValue(e.target.value)}
                placeholder="在这里记录你的学习心得、例句或联想..."
                autoFocus
              />
            ) : (
              <div className="text-sm leading-relaxed whitespace-pre-wrap min-h-[40px] text-muted-foreground">
                {expandedData.notes || "暂无笔记，点击编辑添加。"}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  if (reviewMode) {
    const currentWord = reviewQueue[reviewIndex]
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-primary/5 border border-primary/20 p-4 rounded-lg">
          <div className="flex min-w-0 items-center gap-3">
            <Badge className="bg-background text-foreground border hover:bg-background">
              复习 {reviewIndex + 1} / {reviewQueue.length}
            </Badge>
            <span className="text-lg font-bold">{currentWord.word}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" disabled={reviewIndex === 0} onClick={prevReview}>
              <ChevronLeft className="h-4 w-4 mr-1" /> 上一个
            </Button>
            <Button variant="outline" size="sm" disabled={reviewIndex === reviewQueue.length - 1} onClick={nextReview}>
              下一个 <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
            <div className="w-px h-4 bg-border mx-2" />
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={exitReview}>
              <X className="h-4 w-4 mr-1" /> 退出复习
            </Button>
          </div>
        </div>

        <Card>
          {renderDetailPanel(currentWord)}
        </Card>
      </div>
    )
  }

  return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">生词本</h1>
        <div className="flex items-center gap-2">
          {filteredWords.length > 0 && (
            <Button variant="outline" onClick={startReview}>
              <BookOpen className="h-4 w-4 mr-2" />
              开始复习
            </Button>
          )}
          {selectedIds.size >= 2 && (
            <Button onClick={goToStory}>
              <Sparkles className="h-4 w-4 mr-2" />
              用 {selectedIds.size} 个词生成故事
            </Button>
          )}
        </div>
      </div>

      {words.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜索生词或释义..."
            className="pl-9 h-11 text-base"
          />
        </div>
      )}

      {words.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg">{loadError || "生词本是空的"}</p>
          <p className="text-sm mt-1">{loadError ? "启动数据库后刷新页面重试" : "查词成功后会自动加入生词本"}</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            共 {filteredWords.length} 个单词 · 选择 2 个以上可生成串词故事
          </p>
          {filteredWords.map(entry => (
            <Card
              key={entry.id}
              className={`cursor-pointer transition-colors ${
                selectedIds.has(entry.id) ? "border-primary bg-primary/5" : ""
              } ${expandedId === entry.id ? "ring-2 ring-primary/20" : ""}`}
              onClick={() => loadDetail(entry.id)}
            >
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3 px-4">
                <div className="flex min-w-0 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(entry.id)}
                    onChange={() => toggleSelect(entry.id)}
                    className="h-4 w-4 rounded"
                    onClick={e => e.stopPropagation()}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{entry.word}</span>
                      {entry.phonetic && (
                        <span className="text-xs text-muted-foreground font-mono">{entry.phonetic}</span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-1">
                      {entry.chineseDefinition || entry.briefDefinition}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="text-xs">
                    {new Date(entry.createdAt).toLocaleDateString("zh-CN")}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={e => {
                      e.stopPropagation()
                      deleteWord(entry.id)
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
              {expandedId === entry.id && renderDetailPanel(entry)}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
