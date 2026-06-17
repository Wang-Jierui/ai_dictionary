"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
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
  VOCABULARY_SORT_IDS,
  type AISectionId,
  type SortOrder,
  type VocabularySortId,
} from "@/lib/constants"
import { DEFAULT_SECTION_ORDER, sanitizeSectionOrder } from "@/lib/section-order"
import type { VocabularyEntry, VocabularyReviewState } from "@/types/dictionary"

const SORT_LABELS: Record<VocabularySortId, string> = {
  created: "添加时间",
  alpha: "字母顺序",
  random: "随机打乱",
  due: "复习时间",
}

const LIBRARY_FILTER_IDS = ["all", "studying", "library"] as const
type LibraryFilterId = (typeof LIBRARY_FILTER_IDS)[number]

const DEFAULT_REVIEW_PLAN_ID = "default"

const FILTER_LABELS: Record<LibraryFilterId, string> = {
  all: "全部",
  studying: "学习中",
  library: "仅收藏",
}

const SELECT_CONTROL_CLASS = "h-9 w-full appearance-none rounded-md border border-input bg-background pl-9 pr-8 text-sm shadow-sm transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:w-36"

type VocabularyWireEntry = Omit<Partial<VocabularyEntry>, "createdAt" | "imageMode"> & {
  createdAt?: string | Date
  imageMode?: string | null
  reviewEnabled?: boolean
  review?: VocabularyReviewState | null
  reviewEaseFactor?: number
  reviewIntervalDays?: number
  reviewRepetitionCount?: number
  reviewLapses?: number
  reviewDueAt?: string | Date | null
  reviewLastReviewedAt?: string | Date | null
}

type ReviewPlan = {
  id: string
  name: string
  isDefault: boolean
  wordCount: number
}

type BulkAction = "add" | "remove" | "delete" | null

type DragSelectionState = {
  pointerId: number
  startX: number
  startY: number
  startId: string
  shouldSelect: boolean
  dragging: boolean
}

export default function VocabularyPage() {
  const [words, setWords] = useState<VocabularyEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [sort, setSort] = useState<VocabularySortId>("created")
  const [order, setOrder] = useState<SortOrder>("desc")
  const [filter, setFilter] = useState<LibraryFilterId>("all")
  const [randomSeed] = useState(() => new Date().toISOString().slice(0, 10))
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedData, setExpandedData] = useState<VocabularyEntry | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [sectionOrder, setSectionOrder] = useState<AISectionId[]>(DEFAULT_SECTION_ORDER)
  const [generatingMnemonic, setGeneratingMnemonic] = useState(false)
  const [generatingImage, setGeneratingImage] = useState(false)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesValue, setNotesValue] = useState("")
  const [reviewPlans, setReviewPlans] = useState<ReviewPlan[]>([])
  const [planDialogOpen, setPlanDialogOpen] = useState(false)
  const [planDialogIds, setPlanDialogIds] = useState<string[]>([])
  const [planDialogSelection, setPlanDialogSelection] = useState<Set<string>>(() => new Set())
  const [bulkAction, setBulkAction] = useState<BulkAction>(null)
  const [draggingSelection, setDraggingSelection] = useState(false)
  const detailRequestId = useRef(0)
  const dragSelectionRef = useRef<DragSelectionState | null>(null)
  const suppressNextRowClickRef = useRef(false)

  const currentIndex = useMemo(
    () => words.findIndex(entry => entry.id === expandedId),
    [expandedId, words],
  )
  const selectedStoryWords = useMemo(
    () => words.filter(entry => selectedIds.has(entry.id)).map(entry => entry.word),
    [selectedIds, words],
  )
  const selectedEntries = useMemo(
    () => words.filter(entry => selectedIds.has(entry.id)),
    [selectedIds, words],
  )
  const selectedEntryIds = useMemo(() => selectedEntries.map(entry => entry.id), [selectedEntries])
  const allVisibleSelected = words.length > 0 && selectedEntries.length === words.length

  const fetchWords = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        sort,
        order,
        search: searchQuery,
        randomSeed,
      })
      if (filter === "studying") params.set("review", "enabled")
      if (filter === "library") params.set("review", "disabled")
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

  useEffect(() => {
    const visibleIds = new Set(words.map(entry => entry.id))
    setSelectedIds(prev => {
      const next = new Set(Array.from(prev).filter(id => visibleIds.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [words])

  useEffect(() => {
    const endDrag = () => {
      dragSelectionRef.current = null
      setDraggingSelection(false)
    }

    window.addEventListener("pointerup", endDrag)
    window.addEventListener("pointercancel", endDrag)
    return () => {
      window.removeEventListener("pointerup", endDrag)
      window.removeEventListener("pointercancel", endDrag)
    }
  }, [])

  const fetchReviewPlans = useCallback(async () => {
    const res = await fetch("/api/review-plans")
    if (!res.ok) throw new Error("复习计划加载失败")
    const data = (await res.json()) as ReviewPlan[]
    setReviewPlans(data)
    return data
  }, [])

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

  const removeDeletedWordsFromState = (ids: string[]) => {
    const deletedIds = new Set(ids)
    setWords(prev => prev.filter(entry => !deletedIds.has(entry.id)))
    setSelectedIds(prev => {
      const next = new Set(prev)
      for (const id of ids) next.delete(id)
      return next
    })
    if (expandedId && deletedIds.has(expandedId)) {
      setExpandedId(null)
      setExpandedData(null)
      setEditingNotes(false)
    }
  }

  const deleteWords = async (ids: string[]) => {
    if (ids.length === 0 || bulkAction) return
    if (ids.length > 5 && !window.confirm(`确定删除 ${ids.length} 个生词？删除后也会从所有复习计划移除。`)) return

    setBulkAction("delete")
    try {
      for (const id of ids) {
        const res = await fetch(`/api/vocabulary?id=${encodeURIComponent(id)}`, { method: "DELETE" })
        if (!res.ok) throw new Error("删除失败，请稍后重试")
      }
      removeDeletedWordsFromState(ids)
      setLoadError("")
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "删除失败，请稍后重试")
    } finally {
      setBulkAction(null)
    }
  }

  const deleteWord = async (id: string) => {
    await deleteWords([id])
  }

  const setSelectionForId = useCallback((id: string, shouldSelect: boolean) => {
    setSelectedIds(prev => {
      if (prev.has(id) === shouldSelect) return prev
      const next = new Set(prev)
      if (shouldSelect) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllVisible = () => {
    setSelectedIds(new Set(words.map(entry => entry.id)))
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
  }

  const goToStory = () => {
    if (selectedStoryWords.length < 2) return
    window.location.href = `/practice/story?words=${encodeURIComponent(selectedStoryWords.join(","))}`
  }

  const startReview = () => {
    window.location.href = "/review"
  }

  const navigateLoadedList = (direction: -1 | 1) => {
    if (words.length === 0) return
    const baseIndex = currentIndex >= 0 ? currentIndex : 0
    const nextIndex = baseIndex + direction
    if (nextIndex < 0 || nextIndex >= words.length) return
    void loadDetail(words[nextIndex].id)
  }

  const applyVocabularyUpdates = (updatedRows: VocabularyEntry[]) => {
    const updatedById = new Map(updatedRows.map(entry => [entry.id, entry]))
    setWords(prev => prev.map(entry => updatedById.has(entry.id) ? { ...entry, ...updatedById.get(entry.id) } : entry))
    setExpandedData(prev => prev && updatedById.has(prev.id) ? { ...prev, ...updatedById.get(prev.id) } : prev)
  }

  const setReviewEnrollment = async (ids: string[], reviewEnabled: boolean, planId?: string) => {
    if (ids.length === 0) return
    try {
      const res = await fetch("/api/vocabulary", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, reviewEnabled, ...(planId ? { planId } : {}) }),
      })
      if (!res.ok) throw new Error(reviewEnabled ? "加入学习失败" : "移出学习失败")
      const updatedRows = ((await res.json()) as VocabularyWireEntry[]).map(entry => normalizeVocabularyEntry(entry))
      applyVocabularyUpdates(updatedRows)
      setLoadError("")
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "学习状态更新失败")
    }
  }

  const addToReviewPlans = async (ids: string[]) => {
    if (ids.length === 0 || bulkAction) return
    if (ids.length > 5 && !window.confirm(`确定将 ${ids.length} 个生词加入复习计划？`)) return

    setBulkAction("add")
    try {
      const plans = reviewPlans.length > 0 ? reviewPlans : await fetchReviewPlans()
      if (plans.length > 1) {
        const defaultPlan = plans.find(plan => plan.isDefault) ?? plans[0]
        setPlanDialogIds(ids)
        setPlanDialogSelection(new Set(defaultPlan ? [defaultPlan.id] : []))
        setPlanDialogOpen(true)
        return
      }

      await setReviewEnrollment(ids, true, plans[0]?.id ?? DEFAULT_REVIEW_PLAN_ID)
      await fetchReviewPlans()
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "加入学习失败")
    } finally {
      setBulkAction(null)
    }
  }

  const confirmAddToSelectedPlans = async () => {
    const planIds = Array.from(planDialogSelection)
    if (planDialogIds.length === 0 || planIds.length === 0 || bulkAction) return

    setBulkAction("add")
    try {
      const updatedRows: VocabularyEntry[] = []
      for (const planId of planIds) {
        const res = await fetch("/api/vocabulary", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: planDialogIds, reviewEnabled: true, planId }),
        })
        if (!res.ok) throw new Error("加入复习计划失败")
        updatedRows.push(...((await res.json()) as VocabularyWireEntry[]).map(entry => normalizeVocabularyEntry(entry)))
      }
      applyVocabularyUpdates(updatedRows)
      await fetchReviewPlans()
      setPlanDialogOpen(false)
      setPlanDialogIds([])
      setPlanDialogSelection(new Set())
      setLoadError("")
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "加入复习计划失败")
    } finally {
      setBulkAction(null)
    }
  }

  const removeFromLearning = async (ids: string[]) => {
    if (ids.length === 0 || bulkAction) return
    if (ids.length > 5 && !window.confirm(`确定将 ${ids.length} 个生词从所有复习计划移出？`)) return

    setBulkAction("remove")
    try {
      await setReviewEnrollment(ids, false)
      await fetchReviewPlans()
    } finally {
      setBulkAction(null)
    }
  }

  const beginRowPointer = (event: ReactPointerEvent<HTMLDivElement>, id: string) => {
    if (event.button !== 0) return
    const target = event.target
    if (target instanceof HTMLElement && target.closest("button, input, select, textarea, a")) return
    dragSelectionRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startId: id,
      shouldSelect: !selectedIds.has(id),
      dragging: false,
    }
  }

  const activateDragSelection = (id: string) => {
    const drag = dragSelectionRef.current
    if (!drag) return
    drag.dragging = true
    suppressNextRowClickRef.current = true
    setDraggingSelection(true)
    setSelectionForId(drag.startId, drag.shouldSelect)
    setSelectionForId(id, drag.shouldSelect)
  }

  const moveRowPointer = (event: ReactPointerEvent<HTMLDivElement>, id: string) => {
    const drag = dragSelectionRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (drag.dragging) {
      setSelectionForId(id, drag.shouldSelect)
      return
    }
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY)
    if (distance > 6) activateDragSelection(id)
  }

  const enterRowWhileDragging = (event: ReactPointerEvent<HTMLDivElement>, id: string) => {
    const drag = dragSelectionRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    activateDragSelection(id)
  }

  const openRowDetail = (id: string) => {
    if (suppressNextRowClickRef.current) {
      suppressNextRowClickRef.current = false
      return
    }
    void loadDetail(id)
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
                <Button variant="outline" size="sm" onClick={() => { window.location.href = `/practice/roleplay?word=${encodeURIComponent(expandedData.word)}` }}>
                  <Swords className="h-4 w-4" /> 去实战
                </Button>
              </div>

              {expandedData.reviewEnabled && expandedData.review && (
                <div className="flex flex-wrap gap-2 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
                  <span className="flex items-center"><CheckCircle2 className="mr-1 h-3 w-3" />复习次数: {expandedData.review.repetitionCount}</span>
                  <span>·</span>
                  <span>间隔: {expandedData.review.intervalDays} 天</span>
                  <span>·</span>
                  <span>下次: {expandedData.review.dueAt ? new Date(expandedData.review.dueAt).toLocaleDateString("zh-CN") : "未排期"}</span>
                </div>
              )}
              <Button
                variant={expandedData.reviewEnabled ? "outline" : "default"}
                size="sm"
                onClick={() => expandedData.reviewEnabled ? void removeFromLearning([expandedData.id]) : void addToReviewPlans([expandedData.id])}
                disabled={bulkAction !== null}
              >
                {expandedData.reviewEnabled ? "移出学习" : "加入学习"}
              </Button>

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
          <p className="text-sm text-muted-foreground">查找、预览和管理收藏词；需要复习的词可手动加入学习。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {words.length > 0 && <Button variant="outline" onClick={startReview}><BookOpen className="h-4 w-4" />去复习</Button>}
          {selectedEntries.length >= 2 && <Button onClick={goToStory}><Sparkles className="h-4 w-4" />用 {selectedEntries.length} 个词生成故事</Button>}
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
            <select aria-label="筛选生词" value={filter} onChange={event => setFilter(event.target.value as LibraryFilterId)} className={SELECT_CONTROL_CLASS}>
              {LIBRARY_FILTER_IDS.map(id => <option key={id} value={id}>{FILTER_LABELS[id]}</option>)}
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

      {selectedEntries.length > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            <span className="font-medium text-foreground">已选 {selectedEntries.length} 个词</span>
            <span className="ml-2 text-muted-foreground">批量操作会作用于当前可见选择。</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void addToReviewPlans(selectedEntryIds)} disabled={bulkAction !== null}>
              {bulkAction === "add" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              加入复习计划
            </Button>
            <Button variant="outline" size="sm" onClick={() => void removeFromLearning(selectedEntryIds)} disabled={bulkAction !== null}>
              {bulkAction === "remove" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              移出学习
            </Button>
            <Button variant="outline" size="sm" className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => void deleteWords(selectedEntryIds)} disabled={bulkAction !== null}>
              {bulkAction === "delete" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              删除
            </Button>
          </div>
        </div>
      )}

      {words.length === 0 && !loading ? (
        <div className="py-20 text-center text-muted-foreground">
          <BookOpen className="mx-auto mb-4 h-12 w-12 opacity-30" />
          <p className="text-lg">生词本是空的</p>
          <p className="mt-1 text-sm">查词成功后会自动加入生词本</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[minmax(20rem,0.85fr)_minmax(0,1.15fr)] md:gap-6 xl:grid-cols-[minmax(22rem,0.9fr)_minmax(0,1.1fr)]">
          <div className="flex min-w-0 flex-col gap-2 pr-1 md:sticky md:top-20 md:min-h-0 md:max-h-[calc(100vh-6rem)] md:overflow-y-auto">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-muted-foreground">
              <span>共 {words.length} 个单词 · 勾选或拖过行可快速选择</span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={selectAllVisible} disabled={allVisibleSelected}>全选</Button>
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={clearSelection} disabled={selectedEntries.length === 0}>全不选</Button>
              </div>
            </div>
            {words.map(entry => {
              return (
                <div key={entry.id}>
                  <Card
                    className={`cursor-pointer transition-colors ${draggingSelection ? "select-none" : ""} ${selectedIds.has(entry.id) ? "border-primary bg-primary/5" : ""} ${expandedId === entry.id ? "border-primary bg-primary/5 shadow-sm" : "hover:bg-muted/50"}`}
                    onPointerDown={event => beginRowPointer(event, entry.id)}
                    onPointerMove={event => moveRowPointer(event, entry.id)}
                    onPointerEnter={event => enterRowWhileDragging(event, entry.id)}
                    onClick={() => openRowDetail(entry.id)}
                  >
                    <CardContent className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <input type="checkbox" checked={selectedIds.has(entry.id)} onChange={() => toggleSelect(entry.id)} onClick={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()} className="h-4 w-4 rounded" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2"><span className="truncate font-medium">{entry.word}</span></div>
                          <p className="line-clamp-1 text-sm text-muted-foreground">{entry.chineseDefinition || entry.briefDefinition}</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
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
          <div className="hidden min-w-0 md:block">{renderReader()}</div>
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

      {planDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm" onClick={() => setPlanDialogOpen(false)}>
          <Card className="w-full max-w-lg border-primary/20 shadow-lg" onClick={event => event.stopPropagation()}>
            <CardHeader className="border-b bg-muted/20">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle className="text-lg">选择复习计划</CardTitle>
                  <p className="text-sm text-muted-foreground">将 {planDialogIds.length} 个生词加入一个或多个计划。</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setPlanDialogOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {reviewPlans.map(plan => (
                  <label key={plan.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border bg-background p-3 hover:bg-muted/40">
                    <div className="flex min-w-0 items-center gap-3">
                      <input
                        type="checkbox"
                        checked={planDialogSelection.has(plan.id)}
                        onChange={() => setPlanDialogSelection(prev => {
                          const next = new Set(prev)
                          if (next.has(plan.id)) next.delete(plan.id)
                          else next.add(plan.id)
                          return next
                        })}
                        className="h-4 w-4 rounded"
                      />
                      <span className="truncate text-sm font-medium">{plan.name}</span>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{plan.wordCount} 词</span>
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" onClick={() => setPlanDialogOpen(false)} disabled={bulkAction !== null}>取消</Button>
                <Button onClick={() => void confirmAddToSelectedPlans()} disabled={bulkAction !== null || planDialogSelection.size === 0}>
                  {bulkAction === "add" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  加入所选计划
                </Button>
              </div>
            </CardContent>
          </Card>
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
    reviewEnabled: entry.reviewEnabled ?? fallback?.reviewEnabled ?? false,
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
