"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { BookOpen, CheckCircle2, ChevronDown, Loader2, RotateCcw, Search, Volume2, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { AiLearningSection } from "@/components/ai-learning-sections"
import { REVIEW_GRADES, type AISectionId, type ReviewGradeValue } from "@/lib/constants"
import { DEFAULT_SECTION_ORDER, sanitizeSectionOrder } from "@/lib/section-order"
import type { VocabularyEntry, VocabularyReviewState } from "@/types/dictionary"

const REVIEW_BUTTONS: { grade: ReviewGradeValue; label: string; tone: string }[] = [
  { grade: REVIEW_GRADES.again, label: "忘记", tone: "border-red-200 hover:bg-red-50 hover:text-red-600" },
  { grade: REVIEW_GRADES.hard, label: "困难", tone: "border-orange-200 hover:bg-orange-50 hover:text-orange-600" },
  { grade: REVIEW_GRADES.good, label: "记得", tone: "border-green-200 hover:bg-green-50 hover:text-green-600" },
  { grade: REVIEW_GRADES.easy, label: "简单", tone: "border-blue-200 hover:bg-blue-50 hover:text-blue-600" },
]

const REVIEW_MODES = ["due", "new", "learning", "mastered", "all"] as const
type ReviewMode = (typeof REVIEW_MODES)[number]

const DEFAULT_REVIEW_PLAN_ID = "default"
const REVIEW_PLAN_STORAGE_KEY = "ai-dict-active-review-plan"

const SHORTCUT_GRADES: Partial<Record<string, ReviewGradeValue>> = {
  "1": REVIEW_GRADES.again,
  "2": REVIEW_GRADES.hard,
  "3": REVIEW_GRADES.good,
  "4": REVIEW_GRADES.easy,
}

const MODE_LABELS: Record<ReviewMode, string> = {
  due: "今日到期",
  new: "新学习",
  learning: "学习中",
  mastered: "已掌握",
  all: "全部学习词",
}

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

type GradeCounts = Record<ReviewGradeValue, number>

type ReviewFeedback = {
  id: string
  word: string
  label: string
  review: VocabularyReviewState
}

type StudyPlanStats = {
  total: number
  due: number
  new: number
  learning: number
  mastered: number
}

type ReviewPlan = {
  id: string
  name: string
  isDefault: boolean
  wordCount: number
}

const EMPTY_COUNTS: GradeCounts = {
  [REVIEW_GRADES.again]: 0,
  [REVIEW_GRADES.hard]: 0,
  [REVIEW_GRADES.good]: 0,
  [REVIEW_GRADES.easy]: 0,
}

export default function ReviewPage() {
  const [mode, setMode] = useState<ReviewMode>("due")
  const [queue, setQueue] = useState<VocabularyEntry[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [currentDetail, setCurrentDetail] = useState<VocabularyEntry | null>(null)
  const [sectionOrder, setSectionOrder] = useState<AISectionId[]>(DEFAULT_SECTION_ORDER)
  const [loading, setLoading] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [showAnswer, setShowAnswer] = useState(false)
  const [grading, setGrading] = useState(false)
  const [error, setError] = useState("")
  const [gradeCounts, setGradeCounts] = useState<GradeCounts>(EMPTY_COUNTS)
  const [requeuedIds, setRequeuedIds] = useState<Set<string>>(() => new Set())
  const [feedback, setFeedback] = useState<ReviewFeedback | null>(null)
  const [managementOpen, setManagementOpen] = useState(false)
  const [managementWords, setManagementWords] = useState<VocabularyEntry[]>([])
  const [managementLoading, setManagementLoading] = useState(false)
  const [managementError, setManagementError] = useState("")
  const [removingIds, setRemovingIds] = useState<Set<string>>(() => new Set())
  const [importWordsText, setImportWordsText] = useState("")
  const [importingWords, setImportingWords] = useState(false)
  const [importMessage, setImportMessage] = useState("")
  const [reviewPlans, setReviewPlans] = useState<ReviewPlan[]>([])
  const [activePlanId, setActivePlanId] = useState(readStoredReviewPlanId)
  const [newPlanName, setNewPlanName] = useState("")
  const [creatingPlan, setCreatingPlan] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [libraryWords, setLibraryWords] = useState<VocabularyEntry[]>([])
  const [librarySelectedIds, setLibrarySelectedIds] = useState<Set<string>>(() => new Set())
  const [librarySearchQuery, setLibrarySearchQuery] = useState("")
  const [libraryLoading, setLibraryLoading] = useState(false)
  const [libraryImporting, setLibraryImporting] = useState(false)
  const [libraryError, setLibraryError] = useState("")

  const currentRow = queue[currentIndex]
  const completed = useMemo(
    () => Object.values(gradeCounts).reduce((sum, count) => sum + count, 0),
    [gradeCounts],
  )
  const finished = queue.length > 0 && currentIndex >= queue.length
  const studyPlanStats = useMemo(() => calculateStudyPlanStats(managementWords), [managementWords])
  const activePlan = reviewPlans.find(plan => plan.id === activePlanId)
  const filteredLibraryWords = useMemo(() => {
    const query = librarySearchQuery.trim().toLowerCase()
    if (!query) return libraryWords
    return libraryWords.filter(entry => [entry.word, entry.briefDefinition, entry.chineseDefinition, entry.notes]
      .filter(Boolean)
      .some(value => value?.toLowerCase().includes(query)))
  }, [librarySearchQuery, libraryWords])
  const selectedLibraryEntries = useMemo(
    () => libraryWords.filter(entry => librarySelectedIds.has(entry.id)),
    [librarySelectedIds, libraryWords],
  )

  const fetchQueue = useCallback(async () => {
    setLoading(true)
    setError("")
    setCurrentIndex(0)
    setCurrentDetail(null)
    setShowAnswer(false)
    setGradeCounts({ ...EMPTY_COUNTS })
    setRequeuedIds(new Set())
    setFeedback(null)

    const params = new URLSearchParams({
      review: "enabled",
      planId: activePlanId,
      filter: mode,
      sort: mode === "due" ? "due" : "created",
      order: mode === "due" ? "asc" : "desc",
    })

    try {
      const res = await fetch(`/api/vocabulary?${params.toString()}`)
      if (!res.ok) throw new Error("复习队列加载失败")
      const data = (await res.json()) as VocabularyWireEntry[]
      setQueue(data.map(entry => normalizeVocabularyEntry(entry)))
    } catch (err) {
      setError(err instanceof Error ? err.message : "复习队列加载失败")
    } finally {
      setLoading(false)
    }
  }, [activePlanId, mode])

  const fetchReviewPlans = useCallback(async () => {
    const res = await fetch("/api/review-plans")
    if (!res.ok) throw new Error("复习计划加载失败")
    const data = (await res.json()) as ReviewPlan[]
    setReviewPlans(data)
    if (!data.some(plan => plan.id === activePlanId)) {
      setActivePlanId(data[0]?.id ?? DEFAULT_REVIEW_PLAN_ID)
    }
  }, [activePlanId])

  useEffect(() => {
    rememberReviewPlanId(activePlanId)
  }, [activePlanId])

  useEffect(() => {
    fetchReviewPlans().catch(err => setError(err instanceof Error ? err.message : "复习计划加载失败"))
    fetch("/api/settings")
      .then(res => res.json())
      .then(data => setSectionOrder(sanitizeSectionOrder(data.sectionOrder)))
      .catch(() => setSectionOrder([...DEFAULT_SECTION_ORDER]))
  }, [fetchReviewPlans])

  useEffect(() => {
    void fetchQueue()
  }, [fetchQueue])

  const fetchStudyPlan = useCallback(async () => {
    setManagementLoading(true)
    setManagementError("")

    try {
      const params = new URLSearchParams({ review: "enabled", planId: activePlanId })
      const res = await fetch(`/api/vocabulary?${params.toString()}`)
      if (!res.ok) throw new Error("复习词加载失败")
      const data = (await res.json()) as VocabularyWireEntry[]
      setManagementWords(data.map(entry => normalizeVocabularyEntry(entry)))
    } catch (err) {
      setManagementError(err instanceof Error ? err.message : "复习词加载失败")
    } finally {
      setManagementLoading(false)
    }
  }, [activePlanId])

  useEffect(() => {
    if (managementOpen) void fetchStudyPlan()
  }, [fetchStudyPlan, managementOpen])

  useEffect(() => {
    if (!currentRow || finished) return
    setCurrentDetail(null)
    setShowAnswer(false)
    setLoadingDetail(true)
    fetch(`/api/vocabulary?id=${encodeURIComponent(currentRow.id)}`)
      .then(res => {
        if (!res.ok) throw new Error("单词详情加载失败")
        return res.json() as Promise<VocabularyWireEntry>
      })
      .then(data => setCurrentDetail(normalizeVocabularyEntry(data, currentRow)))
      .catch(err => setError(err instanceof Error ? err.message : "单词详情加载失败"))
      .finally(() => setLoadingDetail(false))
  }, [currentRow, finished])

  const submitReview = useCallback(async (grade: ReviewGradeValue) => {
    if (!currentRow || grading || !showAnswer) return
    const reviewedRow = currentRow
    const reviewButton = REVIEW_BUTTONS.find(button => button.grade === grade)
    setGrading(true)
    try {
      const res = await fetch("/api/vocabulary/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: reviewedRow.id, grade }),
      })
      if (!res.ok) throw new Error("评分失败")
      const data = (await res.json()) as VocabularyWireEntry
      const updatedEntry = normalizeVocabularyEntry(data, reviewedRow)
      setGradeCounts(prev => ({ ...prev, [grade]: prev[grade] + 1 }))
      setQueue(prev => {
        const updatedQueue = prev.map(entry => entry.id === updatedEntry.id ? { ...entry, ...updatedEntry } : entry)
        if (grade === REVIEW_GRADES.again && !requeuedIds.has(updatedEntry.id)) {
          return [...updatedQueue, updatedEntry]
        }
        return updatedQueue
      })
      if (grade === REVIEW_GRADES.again && !requeuedIds.has(updatedEntry.id)) {
        setRequeuedIds(prev => {
          const next = new Set(prev)
          next.add(updatedEntry.id)
          return next
        })
      }
      setManagementWords(prev => prev.map(entry => entry.id === updatedEntry.id ? { ...entry, ...updatedEntry } : entry))
      setFeedback({
        id: updatedEntry.id,
        word: reviewedRow.word,
        label: reviewButton?.label ?? "已评分",
        review: getReviewState(updatedEntry.review),
      })
      setCurrentIndex(index => index + 1)
      setCurrentDetail(null)
      setShowAnswer(false)
      setError("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "评分失败")
    } finally {
      setGrading(false)
    }
  }, [currentRow, grading, requeuedIds, showAnswer])

  const skipCurrent = useCallback(() => {
    if (!currentRow) return
    setCurrentIndex(index => index + 1)
    setCurrentDetail(null)
    setShowAnswer(false)
  }, [currentRow])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnoreShortcut(event) || !currentRow || finished) return

      if (event.code === "Space" && !showAnswer) {
        event.preventDefault()
        if (!loadingDetail) setShowAnswer(true)
        return
      }

      if (event.key === "ArrowRight") {
        event.preventDefault()
        skipCurrent()
        return
      }

      if (showAnswer) {
        const shortcutGrade = SHORTCUT_GRADES[event.key]
        if (shortcutGrade !== undefined) {
          event.preventDefault()
          void submitReview(shortcutGrade)
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [currentRow, finished, loadingDetail, showAnswer, skipCurrent, submitReview])

  const removeFromStudyPlan = async (id: string) => {
    if (removingIds.has(id)) return

    setRemovingIds(prev => {
      const next = new Set(prev)
      next.add(id)
      return next
    })

    try {
      const res = await fetch("/api/vocabulary", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id], reviewEnabled: false, planId: activePlanId }),
      })
      if (!res.ok) throw new Error("移出学习失败")
      await res.json() as VocabularyWireEntry[]

      const removedBeforeCurrent = queue.slice(0, currentIndex).filter(entry => entry.id === id).length
      const nextQueueLength = queue.filter(entry => entry.id !== id).length
      const nextIndex = Math.min(Math.max(currentIndex - removedBeforeCurrent, 0), nextQueueLength)

      setManagementWords(prev => prev.filter(entry => entry.id !== id))
      setQueue(prev => prev.filter(entry => entry.id !== id))
      setCurrentIndex(nextIndex)
      setRequeuedIds(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      if (currentRow?.id === id) {
        setCurrentDetail(null)
        setShowAnswer(false)
      }
      if (feedback?.id === id) setFeedback(null)
      setManagementError("")
    } catch (err) {
      setManagementError(err instanceof Error ? err.message : "移出学习失败")
    } finally {
      setRemovingIds(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const createReviewPlan = async () => {
    if (!newPlanName.trim() || creatingPlan) return
    setCreatingPlan(true)
    setManagementError("")
    try {
      const res = await fetch("/api/review-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newPlanName.trim() }),
      })
      if (!res.ok) throw new Error("创建复习计划失败")
      const plan = (await res.json()) as ReviewPlan
      setReviewPlans(prev => [...prev, plan])
      setActivePlanId(plan.id)
      setNewPlanName("")
      setManagementWords([])
      setQueue([])
      setCurrentIndex(0)
      setCurrentDetail(null)
      setShowAnswer(false)
    } catch (err) {
      setManagementError(err instanceof Error ? err.message : "创建复习计划失败")
    } finally {
      setCreatingPlan(false)
    }
  }

  const importIntoStudyPlan = async () => {
    const words = parseWordList(importWordsText)
    if (words.length === 0) {
      setManagementError("请输入要加入复习计划的单词")
      return
    }

    setImportingWords(true)
    setManagementError("")
    setImportMessage("")

    try {
      const existingEntries: VocabularyEntry[] = []
      const missingWords: string[] = []

      for (const word of words) {
        const res = await fetch(`/api/vocabulary?search=${encodeURIComponent(word)}`)
        if (!res.ok) throw new Error(`检查 ${word} 失败`)
        const matches = ((await res.json()) as VocabularyWireEntry[])
        const exactMatch = matches.find(entry => entry.word?.toLowerCase() === word)
        if (exactMatch) {
          existingEntries.push(normalizeVocabularyEntry(exactMatch))
        } else {
          missingWords.push(word)
        }
      }

      if (existingEntries.length > 0) {
        const ids = existingEntries.map(entry => entry.id)
        const res = await fetch("/api/vocabulary", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, reviewEnabled: true, planId: activePlanId }),
        })
        if (!res.ok) throw new Error("加入复习计划失败")
        const updatedEntries = ((await res.json()) as VocabularyWireEntry[]).map(entry => normalizeVocabularyEntry(entry))
        mergeStudyPlanEntries(updatedEntries)
        mergeQueueEntries(updatedEntries)
      }

      if (missingWords.length > 0) {
        const params = new URLSearchParams({
          reviewImport: "1",
          planId: activePlanId,
          words: missingWords.join("\n"),
        })
        window.location.href = `/batch?${params.toString()}`
        return
      }

      setImportWordsText("")
      setImportMessage(`已将 ${existingEntries.length} 个生词加入复习计划。`)
      await fetchStudyPlan()
      await fetchQueue()
    } catch (err) {
      setManagementError(err instanceof Error ? err.message : "导入复习词失败")
    } finally {
      setImportingWords(false)
    }
  }

  const fetchVocabularyLibrary = useCallback(async () => {
    setLibraryLoading(true)
    setLibraryError("")
    try {
      const params = new URLSearchParams({ review: "all", sort: "created", order: "desc" })
      const res = await fetch(`/api/vocabulary?${params.toString()}`)
      if (!res.ok) throw new Error("生词库加载失败")
      const data = (await res.json()) as VocabularyWireEntry[]
      const entries = data.map(entry => normalizeVocabularyEntry(entry))
      setLibraryWords(entries)
      setLibrarySelectedIds(prev => {
        const visibleIds = new Set(entries.map(entry => entry.id))
        return new Set(Array.from(prev).filter(id => visibleIds.has(id)))
      })
    } catch (err) {
      setLibraryError(err instanceof Error ? err.message : "生词库加载失败")
    } finally {
      setLibraryLoading(false)
    }
  }, [])

  const openVocabularyLibrary = () => {
    setLibraryOpen(true)
    void fetchVocabularyLibrary()
  }

  const toggleLibrarySelection = (id: string) => {
    setLibrarySelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectFilteredLibraryWords = () => {
    setLibrarySelectedIds(new Set(filteredLibraryWords.map(entry => entry.id)))
  }

  const clearLibrarySelection = () => {
    setLibrarySelectedIds(new Set())
  }

  const importSelectedLibraryWords = async () => {
    const ids = selectedLibraryEntries.map(entry => entry.id)
    if (ids.length === 0 || libraryImporting) return
    if (ids.length > 5 && !window.confirm(`确定将 ${ids.length} 个生词加入当前复习计划？`)) return

    setLibraryImporting(true)
    setLibraryError("")
    setImportMessage("")
    try {
      const res = await fetch("/api/vocabulary", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, reviewEnabled: true, planId: activePlanId }),
      })
      if (!res.ok) throw new Error("加入复习计划失败")
      const updatedEntries = ((await res.json()) as VocabularyWireEntry[]).map(entry => normalizeVocabularyEntry(entry))
      mergeStudyPlanEntries(updatedEntries)
      mergeQueueEntries(updatedEntries)
      setImportMessage(`已从生词库加入 ${updatedEntries.length} 个词。`)
      setLibrarySelectedIds(new Set())
      setLibraryOpen(false)
      await fetchStudyPlan()
      await fetchQueue()
      await fetchReviewPlans()
    } catch (err) {
      setLibraryError(err instanceof Error ? err.message : "加入复习计划失败")
    } finally {
      setLibraryImporting(false)
    }
  }

  const mergeStudyPlanEntries = (entries: VocabularyEntry[]) => {
    setManagementWords(prev => mergeEntriesById(prev, entries))
  }

  const mergeQueueEntries = (entries: VocabularyEntry[]) => {
    setQueue(prev => mergeEntriesById(prev, entries))
  }

  const renderReviewButtons = (placement: "top" | "bottom") => (
    <div className={placement === "top" ? "grid grid-cols-2 gap-2 sm:grid-cols-4" : "grid w-full grid-cols-4 gap-2 sm:w-auto"}>
      {REVIEW_BUTTONS.map((button, index) => (
        <Button key={`${placement}-${button.grade}`} variant="outline" className={`px-2 ${button.tone}`} disabled={grading} onClick={() => submitReview(button.grade)}>
          <span className="hidden font-mono sm:inline">{index + 1}</span>{button.label}
        </Button>
      ))}
    </div>
  )

  const playAudio = (url: string) => {
    const audioUrl = url.startsWith("//") ? `https:${url}` : url
    void new Audio(audioUrl).play()
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />加载复习队列...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">复习</h1>
          <p className="text-sm text-muted-foreground">只复习当前计划里的生词；单词的熟练度在所有计划中共享。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex items-center">
            <select value={activePlanId} onChange={event => setActivePlanId(event.target.value)} className="h-9 appearance-none rounded-md border border-input bg-background pl-3 pr-8 text-sm shadow-sm">
              {reviewPlans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 h-4 w-4 text-muted-foreground" />
          </label>
          <label className="relative flex items-center">
            <select value={mode} onChange={event => setMode(event.target.value as ReviewMode)} className="h-9 appearance-none rounded-md border border-input bg-background pl-3 pr-8 text-sm shadow-sm">
              {REVIEW_MODES.map(id => <option key={id} value={id}>{MODE_LABELS[id]}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 h-4 w-4 text-muted-foreground" />
          </label>
          <Button variant="outline" onClick={() => void fetchQueue()}><RotateCcw className="h-4 w-4" />刷新</Button>
          <Button variant={managementOpen ? "secondary" : "outline"} onClick={() => setManagementOpen(open => !open)}>
            <BookOpen className="h-4 w-4" />复习词管理
          </Button>
        </div>
      </div>

      {error && <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}

      {feedback && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          <span>
            已记录 <span className="font-semibold text-foreground">{feedback.word}</span> 为「{feedback.label}」，{formatReviewTiming(feedback.review)}。
          </span>
        </div>
      )}

      {managementOpen && (
        <Card className="border-primary/20">
          <CardHeader className="border-b bg-muted/20">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="text-lg">复习词管理</CardTitle>
                <p className="text-sm text-muted-foreground">当前计划：{activePlan?.name ?? "默认复习计划"}。移出只影响这个计划，单词熟练度仍是全局唯一状态。</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => void fetchStudyPlan()} disabled={managementLoading}>
                {managementLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                刷新列表
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            {managementError && <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{managementError}</p>}

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <StatCard label="总数" value={studyPlanStats.total} />
              <StatCard label="今日/逾期" value={studyPlanStats.due} />
              <StatCard label="新词" value={studyPlanStats.new} />
              <StatCard label="学习中" value={studyPlanStats.learning} />
              <StatCard label="已掌握" value={studyPlanStats.mastered} />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="text-sm font-medium">多个复习计划</p>
                <p className="mt-1 text-sm text-muted-foreground">可以把考试、工作、阅读词分开管理；同一个单词在不同计划中共享同一份复习状态。</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    value={newPlanName}
                    onChange={event => setNewPlanName(event.target.value)}
                    placeholder="新计划名称"
                    className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                  />
                  <Button variant="outline" size="sm" onClick={() => void createReviewPlan()} disabled={creatingPlan || !newPlanName.trim()}>
                    {creatingPlan ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    创建计划
                  </Button>
                </div>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="text-sm font-medium">导入复习词</p>
                <p className="mt-1 text-sm text-muted-foreground">复习计划只包含生词库里的词；已有生词会直接加入，缺失词会转到批量导入并自动加入复习计划。</p>
                <Textarea
                  value={importWordsText}
                  onChange={event => setImportWordsText(event.target.value)}
                  placeholder="每行一个词，或用空格/逗号分隔"
                  className="mt-3 min-h-24 bg-background text-sm"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => void importIntoStudyPlan()} disabled={importingWords || !importWordsText.trim()}>
                    {importingWords ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    导入到当前复习计划
                  </Button>
                  <Button variant="outline" size="sm" onClick={openVocabularyLibrary} disabled={libraryLoading}>
                    {libraryLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
                    从生词库导入
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { window.location.href = "/batch?reviewImport=1" }}>打开批量导入</Button>
                </div>
                {importMessage && <p className="mt-2 text-xs text-emerald-600">{importMessage}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">学习中词表</p>
                <Badge className="border bg-background text-foreground">{managementWords.length} 个词</Badge>
              </div>
              {managementLoading ? (
                <div className="flex items-center justify-center rounded-lg border border-dashed py-8 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />加载复习词...
                </div>
              ) : managementWords.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">暂无加入学习计划的词。</div>
              ) : (
                <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                  {managementWords.map(entry => {
                    const removing = removingIds.has(entry.id)
                    return (
                      <div key={entry.id} className="flex flex-col gap-3 rounded-lg border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold tracking-tight">{entry.word}</p>
                            <Badge className="border bg-muted/30 text-muted-foreground">{formatReviewStatus(getReviewState(entry.review))}</Badge>
                          </div>
                          <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">{entry.briefDefinition || "暂无简要释义"}</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive sm:shrink-0"
                          disabled={removing}
                          onClick={() => void removeFromStudyPlan(entry.id)}
                        >
                          {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                          移出当前计划
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {queue.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
            <BookOpen className="mb-4 h-12 w-12 opacity-30" />
            <p className="text-lg">暂无可复习单词</p>
            <p className="mt-1 text-sm">去生词本把想学习的词加入学习，或切换上方复习范围。</p>
          </CardContent>
        </Card>
      ) : finished ? (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-500" />本轮完成</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">本轮完成 {completed} 个评分。</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {REVIEW_BUTTONS.map(button => <div key={button.grade} className="rounded-md border p-3 text-center"><div className="text-2xl font-semibold">{gradeCounts[button.grade]}</div><div className="text-xs text-muted-foreground">{button.label}</div></div>)}
            </div>
            <div className="flex gap-2">
              <Button onClick={() => void fetchQueue()}>再来一轮</Button>
              <Button variant="outline" onClick={() => { window.location.href = "/vocabulary" }}>回生词本</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden border-primary/20">
          <CardHeader className="border-b bg-muted/20">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <Badge className="border bg-background text-foreground">{currentIndex + 1} / {queue.length}</Badge>
                <CardTitle className="text-4xl font-bold tracking-tight">{currentRow.word}</CardTitle>
                {(currentDetail?.phonetic ?? currentRow.phonetic) && <p className="font-mono text-sm text-muted-foreground">{currentDetail?.phonetic ?? currentRow.phonetic}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {currentDetail?.dictData?.phonetics?.filter(item => item.audio).map((item, index) => (
                  <Button key={`${item.audio}-${index}`} variant="outline" size="icon" onClick={() => playAudio(item.audio ?? "")}><Volume2 className="h-4 w-4" /></Button>
                ))}
                <Button variant="ghost" onClick={skipCurrent}>跳过</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 p-4">
            {!showAnswer ? (
                <div className="flex flex-col items-center gap-4 py-12 text-center">
                  <p className="max-w-md text-sm leading-relaxed text-muted-foreground">先在脑中回想这个词的核心画面、使用场景和常见搭配，再打开答案。</p>
                  <Button size="lg" onClick={() => setShowAnswer(true)} disabled={loadingDetail}>{loadingDetail ? <Loader2 className="h-4 w-4 animate-spin" /> : null}显示答案</Button>
                  <p className="text-xs text-muted-foreground">快捷键：Space 显示答案 · → 跳过</p>
                </div>
            ) : (
              <>
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-muted-foreground">先评分，再继续下一张</span>
                    <span className="text-xs text-muted-foreground">1/2/3/4 评分 · → 跳过</span>
                  </div>
                  {renderReviewButtons("top")}
                </div>

                <div className="space-y-3 rounded-lg bg-muted/30 p-3">
                  <p className="text-sm font-medium">{currentDetail?.briefDefinition ?? currentRow.briefDefinition}</p>
                  {currentDetail?.aiData?.chineseDefinition && <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{currentDetail.aiData.chineseDefinition}</p>}
                </div>

                {currentDetail?.dictData?.meanings?.length ? (
                  <div className="space-y-3 rounded-lg border bg-background p-3">
                    <p className="text-sm font-medium">基础词典释义</p>
                    {currentDetail.dictData.meanings.map((meaning, index) => (
                      <div key={`${meaning.partOfSpeech}-${index}`} className="space-y-1">
                        <Badge className="mb-1">{meaning.partOfSpeech}</Badge>
                        <ol className="list-inside list-decimal space-y-1 text-sm leading-relaxed text-muted-foreground">
                          {meaning.definitions.map((definition, definitionIndex) => (
                            <li key={`${definition.definition}-${definitionIndex}`}>
                              {definition.definition}
                              {definition.example && <p className="ml-5 mt-0.5 italic">&ldquo;{definition.example}&rdquo;</p>}
                            </li>
                          ))}
                        </ol>
                      </div>
                    ))}
                  </div>
                ) : null}

                {currentDetail?.aiData && (
                  <div className="space-y-4">
                    {sectionOrder.map(sectionId => <AiLearningSection key={sectionId} sectionId={sectionId} aiData={currentDetail.aiData!} word={currentDetail.word} />)}
                  </div>
                )}

                <div className="sticky bottom-0 -mx-4 -mb-4 flex flex-wrap items-center justify-between gap-3 border-t bg-background/95 p-4 backdrop-blur">
                  <span className="text-sm font-medium text-muted-foreground">SM-2 记忆评分</span>
                  {renderReviewButtons("bottom")}
                  <span className="w-full text-xs text-muted-foreground sm:w-auto">1/2/3/4 评分 · → 跳过</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {libraryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm" onClick={() => setLibraryOpen(false)}>
          <Card className="flex max-h-[85vh] w-full max-w-2xl flex-col border-primary/20 shadow-lg" onClick={event => event.stopPropagation()}>
            <CardHeader className="border-b bg-muted/20">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle className="text-lg">从生词库导入</CardTitle>
                  <p className="text-sm text-muted-foreground">选择生词加入「{activePlan?.name ?? "默认复习计划"}」。</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setLibraryOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={librarySearchQuery} onChange={event => setLibrarySearchQuery(event.target.value)} placeholder="搜索生词、释义或笔记..." className="pl-9" />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={selectFilteredLibraryWords} disabled={filteredLibraryWords.length === 0}>全选</Button>
                  <Button variant="outline" size="sm" onClick={clearLibrarySelection} disabled={librarySelectedIds.size === 0}>全不选</Button>
                </div>
              </div>

              {libraryError && <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{libraryError}</p>}

              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                {libraryLoading ? (
                  <div className="flex items-center justify-center rounded-lg border border-dashed py-10 text-sm text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />加载生词库...
                  </div>
                ) : filteredLibraryWords.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">没有匹配的生词。</div>
                ) : (
                  <div className="space-y-2">
                    {filteredLibraryWords.map(entry => (
                      <label key={entry.id} className="flex cursor-pointer items-center gap-3 rounded-lg border bg-background p-3 hover:bg-muted/40">
                        <input type="checkbox" checked={librarySelectedIds.has(entry.id)} onChange={() => toggleLibrarySelection(entry.id)} className="h-4 w-4 rounded" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{entry.word}</p>
                          <p className="line-clamp-1 text-sm text-muted-foreground">{entry.chineseDefinition || entry.briefDefinition || "暂无简要释义"}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                <span className="text-sm text-muted-foreground">已选 {selectedLibraryEntries.length} 个词</span>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setLibraryOpen(false)} disabled={libraryImporting}>取消</Button>
                  <Button onClick={() => void importSelectedLibraryWords()} disabled={libraryImporting || selectedLibraryEntries.length === 0}>
                    {libraryImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    加入当前计划
                  </Button>
                </div>
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

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-background p-3 text-center">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

function calculateStudyPlanStats(entries: VocabularyEntry[]): StudyPlanStats {
  return entries.reduce<StudyPlanStats>((stats, entry) => {
    const review = getReviewState(entry.review)
    stats.total += 1
    if (isDueTodayOrOverdue(review)) stats.due += 1
    if (isNewReview(review)) stats.new += 1
    else if (isMasteredReview(review)) stats.mastered += 1
    else stats.learning += 1
    return stats
  }, { total: 0, due: 0, new: 0, learning: 0, mastered: 0 })
}

function parseWordList(text: string) {
  return Array.from(new Set(text.split(/[\n,\s]+/).map(word => word.trim().toLowerCase()).filter(Boolean)))
}

function mergeEntriesById(current: VocabularyEntry[], incoming: VocabularyEntry[]) {
  const merged = new Map(current.map(entry => [entry.id, entry]))
  for (const entry of incoming) {
    merged.set(entry.id, { ...merged.get(entry.id), ...entry })
  }
  return Array.from(merged.values())
}

function getReviewState(review: VocabularyReviewState | null | undefined): VocabularyReviewState {
  return review ?? {
    easeFactor: 2.5,
    intervalDays: 0,
    repetitionCount: 0,
    lapses: 0,
    dueAt: null,
    lastReviewedAt: null,
  }
}

function shouldIgnoreShortcut(event: KeyboardEvent) {
  if (event.altKey || event.ctrlKey || event.metaKey) return true
  const target = event.target
  if (!(target instanceof HTMLElement)) return false
  return Boolean(target.closest("input, textarea, select, button, [contenteditable]:not([contenteditable='false'])"))
}

function isNewReview(review: VocabularyReviewState) {
  return review.repetitionCount === 0 && !review.lastReviewedAt
}

function isMasteredReview(review: VocabularyReviewState) {
  return review.repetitionCount >= 5 && review.intervalDays >= 21
}

function isDueTodayOrOverdue(review: VocabularyReviewState) {
  const dueAt = parseReviewDate(review.dueAt)
  if (!dueAt) return true
  const endOfToday = new Date()
  endOfToday.setHours(23, 59, 59, 999)
  return dueAt.getTime() <= endOfToday.getTime()
}

function formatReviewTiming(review: VocabularyReviewState) {
  const dueAt = parseReviewDate(review.dueAt)
  if (!dueAt) return "下次复习时间待生成"
  const relative = review.intervalDays <= 0 ? "稍后" : `约 ${review.intervalDays} 天后`
  return `下次复习：${relative}（${formatDateTime(dueAt)}）`
}

function formatReviewStatus(review: VocabularyReviewState) {
  if (isNewReview(review)) return "新词"
  if (isMasteredReview(review)) return "已掌握"
  if (isDueTodayOrOverdue(review)) return "今日/逾期"
  return `学习中 · ${review.intervalDays} 天`
}

function parseReviewDate(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
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

function readStoredReviewPlanId() {
  if (typeof window === "undefined") return DEFAULT_REVIEW_PLAN_ID
  try {
    return window.localStorage.getItem(REVIEW_PLAN_STORAGE_KEY) || DEFAULT_REVIEW_PLAN_ID
  } catch (storageError) {
    void storageError
    return DEFAULT_REVIEW_PLAN_ID
  }
}

function rememberReviewPlanId(planId: string) {
  try {
    window.localStorage.setItem(REVIEW_PLAN_STORAGE_KEY, planId)
  } catch (storageError) {
    void storageError
  }
}
