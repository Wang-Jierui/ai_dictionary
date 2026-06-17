"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Filter,
  Languages,
  Loader2,
  Save,
  Search,
  SortAsc,
  SortDesc,
  Sparkles,
  Swords,
  Trash2,
  Volume2,
  X,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { AiLearningSection, WordImagePanel, type WordImageMode } from "@/components/ai-learning-sections"
import { WordChatPanel } from "@/components/word-chat-panel"
import {
  REVIEW_GRADES,
  VOCABULARY_FILTER_IDS,
  VOCABULARY_SORT_IDS,
  type AISectionId,
  type ReviewGradeValue,
  type SortOrder,
  type VocabularyFilterId,
  type VocabularySortId,
} from "@/lib/constants"
import { DEFAULT_SECTION_ORDER, sanitizeSectionOrder } from "@/lib/section-order"
import { applyReviewedEntryUpdate } from "@/lib/vocabulary-review"
import type { VocabularyEntry, VocabularyReviewState } from "@/types/dictionary"

const SORT_LABELS: Record<VocabularySortId, string> = {
  created: "添加时间",
  alpha: "字母顺序",
  random: "随机打乱",
  due: "复习时间",
}

const FILTER_LABELS: Record<VocabularyFilterId, string> = {
  all: "全部",
  due: "待复习",
  new: "新学习",
  learning: "学习中",
  mastered: "已掌握",
}

const REVIEW_BUTTONS: { grade: ReviewGradeValue; label: string; tone: string }[] = [
  { grade: REVIEW_GRADES.again, label: "忘记", tone: "border-red-200 hover:bg-red-50 hover:text-red-600" },
  { grade: REVIEW_GRADES.hard, label: "困难", tone: "border-orange-200 hover:bg-orange-50 hover:text-orange-600" },
  { grade: REVIEW_GRADES.good, label: "记得", tone: "border-green-200 hover:bg-green-50 hover:text-green-600" },
  { grade: REVIEW_GRADES.easy, label: "简单", tone: "border-blue-200 hover:bg-blue-50 hover:text-blue-600" },
]

const SELECT_CONTROL_CLASS = "h-9 w-full appearance-none rounded-md border border-input bg-background pl-9 pr-8 text-sm shadow-sm transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:w-36"

type VocabularyWireEntry = Omit<Partial<VocabularyEntry>, "createdAt" | "imageMode"> & {
  createdAt?: string | Date
  imageMode?: string | null
  review?: VocabularyReviewState | null
  reviewEaseFactor?: number
  reviewIntervalDays?: number
  reviewRepetitionCount?: number
  reviewLapses?: number
  reviewDueAt?: string | Date | null
  reviewLastReviewedAt?: string | Date | null
}

export default function VocabularyPage() {
  const [words, setWords] = useState<VocabularyEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [sort, setSort] = useState<VocabularySortId>("created")
  const [order, setOrder] = useState<SortOrder>("desc")
  const [filter, setFilter] = useState<VocabularyFilterId>("all")
  const [randomSeed] = useState(() => new Date().toISOString().slice(0, 10))
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedData, setExpandedData] = useState<VocabularyEntry | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [sectionOrder, setSectionOrder] = useState<AISectionId[]>(DEFAULT_SECTION_ORDER)
  const [generatingMnemonic, setGeneratingMnemonic] = useState(false)
  const [generatingImage, setGeneratingImage] = useState(false)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesValue, setNotesValue] = useState("")
  const [grading, setGrading] = useState(false)
  const detailRequestId = useRef(0)

  const currentIndex = useMemo(
    () => words.findIndex(entry => entry.id === expandedId),
    [expandedId, words],
  )
  const selectedStoryWords = useMemo(
    () => words.filter(entry => selectedIds.has(entry.id)).map(entry => entry.word),
    [selectedIds, words],
  )

  const fetchWords = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        sort,
        order,
        filter,
        search: searchQuery,
        randomSeed,
      })
      const res = await fetch(`/api/vocabulary?${params.toString()}`)
      if (!res.ok) throw new Error("生词本加载失败")
      const data = (await res.json()) as VocabularyWireEntry[]
      setWords(data.map(entry => normalizeVocabularyEntry(entry)))
      setLoadError("")
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "生词本加载失败")
    } finally {
      setLoading(false)
    }
  }, [filter, order, randomSeed, searchQuery, sort])

  useEffect(() => {
    fetch("/api/settings")
      .then(res => res.json())
      .then(data => setSectionOrder(sanitizeSectionOrder(data.sectionOrder)))
      .catch(() => setSectionOrder([...DEFAULT_SECTION_ORDER]))
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchWords()
    }, 300)
    return () => window.clearTimeout(timer)
  }, [fetchWords])

  const loadDetail = useCallback(async (id: string) => {
    const listEntry = words.find(entry => entry.id === id)
    setExpandedId(id)
    setExpandedData(listEntry ?? null)
    setNotesValue(listEntry?.notes ?? "")
    setEditingNotes(false)
    setLoadingDetail(true)

    const requestId = detailRequestId.current + 1
    detailRequestId.current = requestId

    try {
      const res = await fetch(`/api/vocabulary?id=${encodeURIComponent(id)}`)
      if (!res.ok) throw new Error("单词详情加载失败")
      const data = (await res.json()) as VocabularyWireEntry
      if (detailRequestId.current !== requestId) return
      const normalized = normalizeVocabularyEntry(data, listEntry)
      setExpandedData(normalized)
      setNotesValue(normalized.notes ?? "")
      setLoadError("")
    } catch (err) {
      if (detailRequestId.current === requestId) {
        setLoadError(err instanceof Error ? err.message : "单词详情加载失败")
      }
    } finally {
      if (detailRequestId.current === requestId) setLoadingDetail(false)
    }
  }, [words])

  const deleteWord = async (id: string) => {
    const res = await fetch(`/api/vocabulary?id=${encodeURIComponent(id)}`, { method: "DELETE" })
    if (!res.ok) {
      setLoadError("删除失败，请稍后重试")
      return
    }

    setWords(prev => prev.filter(entry => entry.id !== id))
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    if (expandedId === id) {
      setExpandedId(null)
      setExpandedData(null)
      setEditingNotes(false)
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
    if (selectedStoryWords.length < 2) return
    window.location.href = `/story?words=${encodeURIComponent(selectedStoryWords.join(","))}`
  }

  const startReview = () => {
    const now = new Date()
    const firstDue = words.find(entry => !entry.review?.dueAt || new Date(entry.review.dueAt) <= now)
    const target = firstDue ?? words[0]
    if (target) void loadDetail(target.id)
  }

  const navigateLoadedList = (direction: -1 | 1) => {
    if (words.length === 0) return
    const baseIndex = currentIndex >= 0 ? currentIndex : 0
    const nextIndex = baseIndex + direction
    if (nextIndex < 0 || nextIndex >= words.length) return
    void loadDetail(words[nextIndex].id)
  }

  const submitReview = async (grade: ReviewGradeValue) => {
    if (!expandedData || grading) return
    setGrading(true)
    try {
      const res = await fetch("/api/vocabulary/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: expandedData.id, grade }),
      })
      if (!res.ok) throw new Error("评分失败")
      const updated = normalizeVocabularyEntry((await res.json()) as VocabularyWireEntry, expandedData)
      const removed = filter === "due" && updated.review?.dueAt && new Date(updated.review.dueAt) > new Date()
      setWords(prev => applyReviewedEntryUpdate(prev, updated, filter))
      if (removed) {
        if (expandedId === updated.id) {
          setExpandedId(null)
          setExpandedData(null)
        }
        setSelectedIds(prev => {
          const next = new Set(prev)
          next.delete(updated.id)
          return next
        })
      } else {
        setExpandedData(prev => (prev?.id === updated.id ? { ...prev, ...updated } : prev))
      }
      setLoadError("")
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "评分失败")
    } finally {
      setGrading(false)
    }
  }

  const regenerateMnemonic = async (word: string) => {
    if (generatingMnemonic || !expandedData?.aiData) return
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

      const aiData = { ...expandedData.aiData, mnemonicHook: text }
      const updated = { ...expandedData, aiData }
      setExpandedData(updated)
      await fetch("/api/vocabulary/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word, aiData, briefDefinition: expandedData.briefDefinition }),
      })
    } finally {
      setGeneratingMnemonic(false)
    }
  }

  const generateWordImage = async (word: string, mode: WordImageMode) => {
    if (generatingImage || !expandedData) return
    setGeneratingImage(true)
    try {
      const meaning = expandedData.dictData?.meanings[0]?.definitions[0]?.definition ?? expandedData.briefDefinition
      const res = await fetch("/api/ai/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word, meaning, mode }),
      })
      if (!res.ok) return

      const data = (await res.json()) as { base64?: string; url?: string }
      const imageData = data.base64 ? `data:image/png;base64,${data.base64}` : data.url
      if (!imageData) return

      setExpandedData({ ...expandedData, imageData, imageMode: mode })
      await fetch("/api/vocabulary/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word,
          imageData: data.base64 ?? data.url,
          imageMode: mode,
          briefDefinition: expandedData.briefDefinition,
        }),
      })
    } finally {
      setGeneratingImage(false)
    }
  }

  const saveNotes = async () => {
    if (!expandedData) return
    try {
      await fetch("/api/vocabulary/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word: expandedData.word,
          notes: notesValue,
          briefDefinition: expandedData.briefDefinition,
        }),
      })
      setExpandedData({ ...expandedData, notes: notesValue })
      setWords(prev => prev.map(entry => (entry.id === expandedData.id ? { ...entry, notes: notesValue } : entry)))
      setEditingNotes(false)
    } catch {
      setLoadError("笔记保存失败，请稍后重试")
    }
  }

  const playAudio = (url: string) => {
    const audioUrl = url.startsWith("//") ? `https:${url}` : url
    void new Audio(audioUrl).play()
  }

  const renderReviewButtons = (compact = false) => (
    <div className={compact ? "grid grid-cols-4 gap-1.5" : "grid w-full grid-cols-4 gap-2 sm:w-auto"}>
      {REVIEW_BUTTONS.map(button => (
        <Button
          key={button.grade}
          variant="outline"
          size={compact ? "sm" : undefined}
          className={`${compact ? "h-8 px-2 text-xs" : "px-2"} ${button.tone}`}
          disabled={grading}
          onClick={() => submitReview(button.grade)}
        >
          <span className={compact ? "hidden font-mono lg:inline" : "hidden font-mono sm:inline"}>{button.grade}</span>{button.label}
        </Button>
      ))}
    </div>
  )

  const renderReader = () => {
    if (!expandedId) {
      return (
        <div className="flex h-full min-h-64 flex-col items-center justify-center rounded-xl border-2 border-dashed bg-muted/10 text-muted-foreground md:min-h-96">
          <BookOpen className="mb-4 h-12 w-12 opacity-20" />
          <p>点击左侧单词查看详情</p>
        </div>
      )
    }

    if (!expandedData) {
      return (
        <Card className="h-full min-h-0 overflow-hidden border-primary/20 shadow-sm md:sticky md:top-20">
          <div className="flex justify-center p-12 text-muted-foreground"><Loader2 className="h-8 w-8 animate-spin" /></div>
        </Card>
      )
    }

    const { dictData, aiData, imageData, imageMode } = expandedData
    const isFirst = currentIndex <= 0
    const isLast = currentIndex === -1 || currentIndex >= words.length - 1

    return (
      <Card className="h-full min-h-0 overflow-hidden border-primary/20 shadow-sm md:sticky md:top-20 md:h-[calc(100vh-6rem)] md:max-h-[calc(100vh-6rem)]">
        <div className="flex h-full min-h-0 flex-col bg-muted/10">
          <div className="sticky top-0 z-10 border-b bg-background/95 p-4 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => navigateLoadedList(-1)} disabled={isFirst}>
                  <ChevronLeft className="h-4 w-4" /> 上一个
                </Button>
                <Button variant="outline" size="sm" onClick={() => navigateLoadedList(1)} disabled={isLast}>
                  下一个 <ChevronRight className="h-4 w-4" />
                </Button>
                <Badge className="font-mono">{currentIndex >= 0 ? currentIndex + 1 : "-"} / {words.length}</Badge>
              </div>
              <div className="flex items-center gap-2">
                {loadingDetail && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                <Button variant="ghost" size="icon" onClick={() => { setExpandedId(null); setExpandedData(null); setEditingNotes(false) }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="mt-3 hidden items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2 md:flex">
              <span className="text-xs font-medium text-muted-foreground">SM-2 记忆评分</span>
              {renderReviewButtons(true)}
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-3">
                    <h2 className="text-2xl font-bold tracking-tight">{expandedData.word}</h2>
                    {(dictData?.phonetic ?? expandedData.phonetic) && <span className="font-mono text-sm text-muted-foreground">{dictData?.phonetic ?? expandedData.phonetic}</span>}
                    {dictData?.phonetics?.filter(item => item.audio).map((item, index) => (
                      <Button key={`${item.audio}-${index}`} variant="ghost" size="icon" className="h-7 w-7" onClick={() => playAudio(item.audio ?? "")}>
                        <Volume2 className="h-4 w-4" />
                      </Button>
                    ))}
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">{expandedData.briefDefinition}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => { window.location.href = `/roleplay?word=${encodeURIComponent(expandedData.word)}` }}>
                  <Swords className="h-4 w-4" /> 去实战
                </Button>
              </div>

              {expandedData.review && (
                <div className="flex flex-wrap gap-2 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
                  <span className="flex items-center"><CheckCircle2 className="mr-1 h-3 w-3" />复习次数: {expandedData.review.repetitionCount}</span>
                  <span>·</span>
                  <span>间隔: {expandedData.review.intervalDays} 天</span>
                  <span>·</span>
                  <span>下次: {expandedData.review.dueAt ? new Date(expandedData.review.dueAt).toLocaleDateString("zh-CN") : "未排期"}</span>
                </div>
              )}

              {aiData?.chineseDefinition && (
                <div className="flex items-start gap-1.5 text-base font-medium">
                  <Languages className="mt-1 h-4 w-4 shrink-0 text-blue-500" />
                  <div className="whitespace-pre-wrap leading-relaxed">{aiData.chineseDefinition}</div>
                </div>
              )}

              {dictData?.meanings?.length ? (
                <div className="space-y-3">
                  {dictData.meanings.map((meaning, index) => (
                    <div key={`${meaning.partOfSpeech}-${index}`}>
                      <Badge className="mb-1">{meaning.partOfSpeech}</Badge>
                      <ol className="list-inside list-decimal space-y-1 text-sm">
                        {meaning.definitions.slice(0, 2).map((definition, definitionIndex) => (
                          <li key={`${definition.definition}-${definitionIndex}`}>
                            {definition.definition}
                            {definition.example && <p className="ml-5 mt-0.5 text-muted-foreground italic">&ldquo;{definition.example}&rdquo;</p>}
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {aiData && (
              <div className="space-y-4">
                {sectionOrder.map(sectionId => (
                  <AiLearningSection
                    key={sectionId}
                    sectionId={sectionId}
                    aiData={aiData}
                    word={expandedData.word}
                    generatingMnemonic={generatingMnemonic}
                    onRegenerateMnemonic={regenerateMnemonic}
                  />
                ))}
              </div>
            )}

            <WordImagePanel
              word={expandedData.word}
              imageData={imageData ?? null}
              imageMode={imageMode ?? null}
              generatingImage={generatingImage}
              onGenerate={generateWordImage}
            />

            {dictData && aiData && <WordChatPanel word={expandedData.word} dictData={dictData} aiData={aiData} />}

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="flex items-center gap-2 text-base"><Edit3 className="h-4 w-4 text-slate-500" />个人笔记</CardTitle>
                  {!editingNotes ? (
                    <Button variant="ghost" size="sm" onClick={() => setEditingNotes(true)}><Edit3 className="h-3.5 w-3.5" />编辑</Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => { setEditingNotes(false); setNotesValue(expandedData.notes ?? "") }}>取消</Button>
                      <Button size="sm" onClick={saveNotes}><Save className="h-3.5 w-3.5" />保存</Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {editingNotes ? (
                  <Textarea value={notesValue} onChange={event => setNotesValue(event.target.value)} placeholder="在这里记录你的学习心得、例句 or 联想..." className="min-h-24" autoFocus />
                ) : (
                  <div className="min-h-10 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{expandedData.notes || "暂无笔记，点击编辑添加。"}</div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 border-t bg-background/95 p-4 shadow-[0_-4px_16px_rgba(0,0,0,0.05)] backdrop-blur">
            <span className="hidden text-sm font-medium text-muted-foreground sm:inline-block">SM-2 记忆评分</span>
            {renderReviewButtons()}
          </div>
        </div>
      </Card>
    )
  }

  if (loading && words.length === 0) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />加载生词本...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">生词本</h1>
          <p className="text-sm text-muted-foreground">紧凑列表浏览，右侧阅读与 SM-2 复习</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {words.length > 0 && <Button variant="outline" onClick={startReview}><BookOpen className="h-4 w-4" />开始复习</Button>}
          {selectedIds.size >= 2 && <Button onClick={goToStory}><Sparkles className="h-4 w-4" />用 {selectedIds.size} 个词生成故事</Button>}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="搜索生词、释义或笔记..." className="pl-9" />
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="relative flex w-full items-center sm:w-auto">
            <Filter className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
            <select aria-label="筛选生词" value={filter} onChange={event => setFilter(event.target.value as VocabularyFilterId)} className={SELECT_CONTROL_CLASS}>
              {VOCABULARY_FILTER_IDS.map(id => <option key={id} value={id}>{FILTER_LABELS[id]}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-muted-foreground" />
          </label>
          <label className="relative flex w-full items-center sm:w-auto">
            <SortAsc className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
            <select aria-label="排序生词" value={sort} onChange={event => setSort(event.target.value as VocabularySortId)} className={SELECT_CONTROL_CLASS}>
              {VOCABULARY_SORT_IDS.map(id => <option key={id} value={id}>{SORT_LABELS[id]}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-muted-foreground" />
          </label>
          <Button variant="outline" size="icon" onClick={() => setOrder(prev => (prev === "asc" ? "desc" : "asc"))} title={order === "asc" ? "升序" : "降序"}>
            {order === "asc" ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {loadError && <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{loadError}</p>}

      {words.length === 0 && !loading ? (
        <div className="py-20 text-center text-muted-foreground">
          <BookOpen className="mx-auto mb-4 h-12 w-12 opacity-30" />
          <p className="text-lg">生词本是空的</p>
          <p className="mt-1 text-sm">查词成功后会自动加入生词本</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-12 md:gap-6">
          <div className="flex flex-col gap-2 pr-1 md:sticky md:top-20 md:col-span-5 md:min-h-0 md:max-h-[calc(100vh-6rem)] md:overflow-y-auto lg:col-span-4">
            <p className="px-1 text-sm text-muted-foreground">共 {words.length} 个单词 · 选择 2 个以上可生成串词故事</p>
            {words.map(entry => {
              const due = !entry.review?.dueAt || new Date(entry.review.dueAt) <= new Date()
              return (
                <div key={entry.id}>
                  <Card
                    className={`cursor-pointer transition-colors ${selectedIds.has(entry.id) ? "border-primary bg-primary/5" : ""} ${expandedId === entry.id ? "border-primary bg-primary/5 shadow-sm" : "hover:bg-muted/50"}`}
                    onClick={() => loadDetail(entry.id)}
                  >
                    <CardContent className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <input type="checkbox" checked={selectedIds.has(entry.id)} onChange={() => toggleSelect(entry.id)} onClick={event => event.stopPropagation()} className="h-4 w-4 rounded" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2"><span className="truncate font-medium">{entry.word}</span></div>
                          <p className="line-clamp-1 text-sm text-muted-foreground">{entry.chineseDefinition || entry.briefDefinition}</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {due && <Badge className="h-5 border-destructive/20 bg-destructive/10 px-1.5 py-0 text-[10px] text-destructive">待复习</Badge>}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-60 hover:opacity-100"
                          onClick={event => {
                            event.stopPropagation()
                            void deleteWord(entry.id)
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )
            })}
            {loading && <div className="py-4 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>}
          </div>
          <div className="hidden md:col-span-7 md:block lg:col-span-8">{renderReader()}</div>
        </div>
      )}

      {expandedId && (
        <div
          className="fixed inset-0 z-50 flex bg-background/80 backdrop-blur-sm md:hidden"
          onClick={() => { setExpandedId(null); setExpandedData(null); setEditingNotes(false) }}
        >
          <div
            className="h-full w-full overflow-hidden bg-background"
            onClick={event => event.stopPropagation()}
          >
            {renderReader()}
          </div>
        </div>
      )}
    </div>
  )
}

function normalizeVocabularyEntry(entry: VocabularyWireEntry, fallback?: VocabularyEntry): VocabularyEntry {
  return {
    id: entry.id ?? fallback?.id ?? "",
    word: entry.word ?? fallback?.word ?? "",
    phonetic: entry.phonetic ?? fallback?.phonetic ?? undefined,
    briefDefinition: entry.briefDefinition ?? fallback?.briefDefinition ?? "",
    chineseDefinition: entry.chineseDefinition ?? fallback?.chineseDefinition ?? undefined,
    notes: entry.notes ?? fallback?.notes ?? undefined,
    dictData: entry.dictData ?? fallback?.dictData ?? null,
    aiData: entry.aiData ?? fallback?.aiData ?? null,
    imageData: entry.imageData ?? fallback?.imageData ?? null,
    imageMode: entry.imageMode === "mood" || entry.imageMode === "meme" ? entry.imageMode : fallback?.imageMode ?? null,
    review: normalizeReview(entry, fallback?.review ?? null),
    createdAt: entry.createdAt ? new Date(entry.createdAt) : fallback?.createdAt ?? new Date(0),
  }
}

function normalizeReview(entry: VocabularyWireEntry, fallback: VocabularyReviewState | null): VocabularyReviewState {
  if (entry.review) return entry.review
  return {
    easeFactor: entry.reviewEaseFactor ?? fallback?.easeFactor ?? 2.5,
    intervalDays: entry.reviewIntervalDays ?? fallback?.intervalDays ?? 0,
    repetitionCount: entry.reviewRepetitionCount ?? fallback?.repetitionCount ?? 0,
    lapses: entry.reviewLapses ?? fallback?.lapses ?? 0,
    dueAt: toIsoString(entry.reviewDueAt) ?? fallback?.dueAt ?? null,
    lastReviewedAt: toIsoString(entry.reviewLastReviewedAt) ?? fallback?.lastReviewedAt ?? null,
  }
}

function toIsoString(value: string | Date | null | undefined) {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : value
}
