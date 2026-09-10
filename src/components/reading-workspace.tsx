"use client"

import { useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import ReactMarkdown from "react-markdown"
import { ArrowLeft, ArrowUpRight, BookOpenText, ChevronDown, History, ListPlus, Loader2, MessageCircle, Search, Send, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { CONTEXT_MAX_LENGTH, QUESTION_MAX_LENGTH, SENTENCE_MAX_LENGTH, SOURCE_MAX_LENGTH, detectReadingMode, normalizeReadingWord, type ReadingMode } from "@/lib/reading-input"
import type { SavedSentence, SentenceHistoryItem } from "@/types/sentence"

interface ReadingWorkspaceProps {
  query: string
  onQueryChange: (query: string) => void
  onLookupWord: (word: string) => Promise<void>
  children: ReactNode
}

async function readResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || "请求失败，请稍后重试。")
  if (!data) throw new Error("未收到有效内容，请重试。")
  return data as T
}

export function ReadingWorkspace({ query, onQueryChange, onLookupWord, children }: ReadingWorkspaceProps) {
  const [mode, setMode] = useState<ReadingMode>("auto")
  const [view, setView] = useState<"word" | "sentence">("word")
  const [context, setContext] = useState("")
  const [source, setSource] = useState("")
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [record, setRecord] = useState<SavedSentence | null>(null)
  const [busy, setBusy] = useState<"analysis" | "chat" | "open" | null>(null)
  const operationRef = useRef(false)
  const [error, setError] = useState("")
  const [errorLocation, setErrorLocation] = useState<"top" | "chat">("top")
  const [question, setQuestion] = useState("")
  const [fragment, setFragment] = useState("")
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState<SentenceHistoryItem[]>([])
  const [historyQuery, setHistoryQuery] = useState("")
  const [historyFilter, setHistoryFilter] = useState("")
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [historyBusy, setHistoryBusy] = useState(false)
  const [historyError, setHistoryError] = useState("")
  const historyRequest = useRef(0)
  const sentenceRef = useRef<HTMLParagraphElement>(null)
  const questionRef = useRef<HTMLTextAreaElement>(null)
  const resolvedMode = mode === "auto" ? (query.trim() ? detectReadingMode(query) : "word") : mode

  async function submit() {
    if (!query.trim() || operationRef.current) return
    setError("")
    setErrorLocation("top")
    if (resolvedMode === "word") {
      setView("word")
      void onLookupWord(normalizeReadingWord(query))
      return
    }
    operationRef.current = true
    setBusy("analysis")
    try {
      const saved = await readResponse<SavedSentence>(await fetch("/api/ai/sentence", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sentence: query, context, source }),
      }))
      setRecord(saved)
      setView("sentence")
      setQuestion("")
      setFragment("")
      setHistoryOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "解析失败，请重试。")
    } finally {
      setBusy(null)
      operationRef.current = false
    }
  }

  async function loadHistory(offset = 0, filter = historyQuery) {
    const requestId = ++historyRequest.current
    setHistoryBusy(true)
    setHistoryError("")
    try {
      const params = new URLSearchParams({ q: filter, offset: String(offset) })
      const result = await readResponse<{ items: SentenceHistoryItem[]; nextOffset: number | null }>(await fetch(`/api/sentence/history?${params}`))
      if (requestId !== historyRequest.current) return
      setHistory(prev => offset === 0 ? result.items : [...prev, ...result.items])
      setHistoryFilter(filter)
      setNextOffset(result.nextOffset)
    } catch (err) {
      if (requestId === historyRequest.current) setHistoryError(err instanceof Error ? err.message : "历史加载失败。")
    } finally {
      if (requestId === historyRequest.current) setHistoryBusy(false)
    }
  }

  async function openHistory(id: string) {
    if (operationRef.current) return
    operationRef.current = true
    setBusy("open")
    setError("")
    setErrorLocation("top")
    try {
      const saved = await readResponse<SavedSentence>(await fetch(`/api/sentence/history?id=${encodeURIComponent(id)}`))
      setRecord(saved)
      onQueryChange(saved.sentence)
      setContext(saved.context)
      setSource(saved.source)
      setMode("sentence")
      setView("sentence")
      setFragment("")
      setQuestion("")
      setHistoryOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "打开失败，请重试。")
    } finally {
      setBusy(null)
      operationRef.current = false
    }
  }

  async function deleteHistory(item: SentenceHistoryItem) {
    if (operationRef.current || !window.confirm("删除这条句子解析及其追问记录？")) return
    operationRef.current = true
    setBusy("open")
    setHistoryError("")
    try {
      await readResponse(await fetch(`/api/sentence/history?id=${encodeURIComponent(item.id)}`, { method: "DELETE" }))
      if (record?.id === item.id) {
        setRecord(null)
        setFragment("")
        setQuestion("")
        setView("word")
      }
      await loadHistory(0, historyFilter)
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : "删除失败。")
    } finally {
      setBusy(null)
      operationRef.current = false
    }
  }

  async function sendQuestion(content = question) {
    if (!record || !content.trim() || operationRef.current) return
    operationRef.current = true
    setBusy("chat")
    setError("")
    setErrorLocation("chat")
    setQuestion(content)
    questionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
    try {
      const reply = await readResponse<Pick<SavedSentence, "messages" | "version">>(await fetch("/api/ai/sentence-chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: record.id, question: content, fragment, version: record.version }),
      }))
      setRecord(prev => prev?.id === record.id ? { ...prev, ...reply } : prev)
      setQuestion("")
      setFragment("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "追问失败，请重试。")
    } finally {
      setBusy(null)
      operationRef.current = false
    }
  }

  function selectFragment(text: string) {
    if (busy) return
    setFragment(text)
    questionRef.current?.focus({ preventScroll: true })
  }

  function captureSelection() {
    const selection = window.getSelection()
    const text = selection?.toString().trim()
    if (text && selection && sentenceRef.current?.contains(selection.anchorNode) && sentenceRef.current.contains(selection.focusNode) && record?.sentence.includes(text)) {
      setFragment(text)
    }
  }

  function lookupFragment() {
    if (!fragment || busy) return
    setView("word")
    setMode("word")
    void onLookupWord(normalizeReadingWord(fragment))
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1 rounded-lg bg-muted p-1" role="group" aria-label="解析模式">
            {([{ value: "auto", label: "自动" }, { value: "word", label: "单词" }, { value: "sentence", label: "句子 / 短语" }] as const).map(item => (
              <Button key={item.value} size="sm" variant={mode === item.value ? "default" : "ghost"} aria-pressed={mode === item.value} onClick={() => setMode(item.value)} disabled={!!busy}>{item.label}</Button>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={() => { setHistoryOpen(!historyOpen); if (!historyOpen) void loadHistory() }}>
            <History className="h-4 w-4" />解析历史
          </Button>
        </div>
        <Textarea
          aria-label="英文单词、短语或句子"
          value={query} onChange={event => onQueryChange(event.target.value)} maxLength={SENTENCE_MAX_LENGTH}
          placeholder="输入单词，或粘贴阅读中没看懂的英文句子…"
          className="min-h-24 resize-y text-base leading-relaxed" autoFocus
          onKeyDown={event => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing && (event.ctrlKey || event.metaKey || (resolvedMode === "word" && !event.shiftKey))) {
              event.preventDefault(); void submit()
            }
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOptionsOpen(!optionsOpen)} aria-expanded={optionsOpen}>
              <ChevronDown className={`h-4 w-4 transition-transform ${optionsOpen ? "rotate-180" : ""}`} />上下文与来源
              {(context || source) && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
            </Button>
            <Link href="/batch" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ListPlus className="h-3.5 w-3.5" />批量查词</Link>
          </div>
          <Button onClick={() => void submit()} disabled={!!busy || !query.trim()}>
            {busy === "analysis" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {busy === "analysis" ? "正在解析…" : resolvedMode === "word" ? "查询单词" : "理解这句话"}
          </Button>
        </div>
        {optionsOpen && <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
          <label className="block space-y-2 text-sm"><span>前后文（可选，用于句子解析）</span><Textarea aria-label="前后文" value={context} onChange={event => setContext(event.target.value)} maxLength={CONTEXT_MAX_LENGTH} placeholder="补充前后几句，帮助判断指代、语气或省略内容。" /></label>
          <label className="block space-y-2 text-sm"><span>来源（可选）</span><Input aria-label="来源" value={source} onChange={event => setSource(event.target.value)} maxLength={SOURCE_MAX_LENGTH} placeholder="文章标题、书名、页码或链接" /></label>
          <p className="text-xs text-muted-foreground">来源随解析保存；网页链接仅作记录，不会自动读取网页。</p>
        </div>}
      </div>

      {historyOpen && <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">解析历史</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <form className="flex gap-2" onSubmit={event => { event.preventDefault(); void loadHistory() }}>
            <Input aria-label="搜索解析历史" placeholder="搜索原句或来源…" value={historyQuery} maxLength={200} onChange={event => setHistoryQuery(event.target.value)} />
            <Button variant="outline" disabled={historyBusy}>搜索</Button>
          </form>
          {historyError && <p role="alert" className="text-sm text-destructive">{historyError}</p>}
          {!historyBusy && !historyError && history.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">{historyFilter ? "没有匹配的解析。" : "解析成功后会自动保存在这里。"}</p>}
          <div className="max-h-80 divide-y overflow-y-auto">
            {history.map(item => <div key={item.id} className="flex items-start gap-2 py-3">
              <button className="min-w-0 flex-1 text-left disabled:opacity-50" disabled={!!busy} onClick={() => void openHistory(item.id)}>
                <p className="line-clamp-2 break-words text-sm leading-relaxed">{item.sentence}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleDateString("zh-CN")}{item.source ? ` · ${item.source}` : ""}</p>
              </button>
              <Button variant="ghost" size="icon" aria-label={`删除解析：${item.sentence}`} disabled={!!busy || historyBusy} onClick={() => void deleteHistory(item)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>)}
          </div>
          {historyBusy && <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />加载中…</p>}
          {nextOffset !== null && <Button variant="outline" className="w-full" disabled={historyBusy} onClick={() => void loadHistory(nextOffset, historyFilter)}>加载更多</Button>}
        </CardContent>
      </Card>}

      {error && errorLocation === "top" && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</p>}
      {busy === "analysis" && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />正在理解原句和关键难点，完成后自动保存。</p>}
      {busy === "open" && <p role="status" className="text-sm text-muted-foreground">正在更新解析历史…</p>}

      {view === "word" && <>
        {record && <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => { setView("sentence"); setMode("sentence"); onQueryChange(record.sentence) }}><ArrowLeft className="h-4 w-4" />返回原句与追问</Button>
          <p className="line-clamp-2 text-sm text-muted-foreground">{record.sentence}</p>
        </div>}
        {children}
      </>}

      {view === "sentence" && record && <div className="space-y-5">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2"><CardTitle className="flex items-center gap-2 text-base"><BookOpenText className="h-4 w-4" />原句</CardTitle><span className="text-xs text-muted-foreground">已保存</span></div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p ref={sentenceRef} className="whitespace-pre-wrap break-words text-lg leading-loose" onPointerUp={captureSelection} onKeyUp={captureSelection}>
              {record.sentence.split(/([a-zA-Z]+(?:['’\-][a-zA-Z]+)*)/g).map((token, index) => /^[a-zA-Z]/.test(token)
                ? <button key={index} className="inline cursor-pointer select-text rounded-sm text-left hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-ring" disabled={!!busy} onClick={() => { if (!window.getSelection()?.toString().trim()) selectFragment(token) }}>{token}</button>
                : <span key={index}>{token}</span>)}
            </p>
            <p className="text-xs text-muted-foreground">点击单词，或选中一段原文，结合整句追问。</p>
            {fragment && <div className="space-y-2 rounded-lg bg-muted/60 p-3">
              <div className="flex items-start justify-between gap-2"><p className="break-words text-sm">引用：{fragment}</p><Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" aria-label="取消原句引用" disabled={!!busy} onClick={() => setFragment("")}><X className="h-3.5 w-3.5" /></Button></div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" disabled={!!busy} onClick={() => void sendQuestion("这部分在原句中是什么意思？为什么这样理解？")}>解释这部分</Button>
                <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => { questionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); questionRef.current?.focus({ preventScroll: true }) }}>自己提问</Button>
                {detectReadingMode(fragment) === "word" && <Button variant="ghost" size="sm" disabled={!!busy} onClick={lookupFragment}>查完整词义<ArrowUpRight className="h-3.5 w-3.5" /></Button>}
              </div>
            </div>}
            {record.source && <p className="break-words text-xs text-muted-foreground">来源：{record.source}</p>}
            {record.context && <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">查看前后文</summary><p className="mt-2 whitespace-pre-wrap break-words leading-relaxed">{record.context}</p></details>}
          </CardContent>
        </Card>

        <Card className="border-primary/15 bg-muted/20">
          <CardHeader className="pb-3"><CardTitle className="text-base">整体理解</CardTitle></CardHeader>
          <CardContent className="space-y-3"><p className="whitespace-pre-wrap text-base leading-relaxed">{record.analysis.translation}</p><p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{record.analysis.overview}</p></CardContent>
        </Card>

        {record.analysis.contextNote && <div className="rounded-lg border border-amber-300/60 bg-amber-50/50 p-4 text-sm leading-relaxed dark:bg-amber-950/20"><p className="mb-1 font-medium">这里需要留意上下文</p><p className="whitespace-pre-wrap">{record.analysis.contextNote}</p><Button variant="ghost" size="sm" className="mt-2" onClick={() => questionRef.current?.focus()}>补充上下文并追问</Button></div>}

        {record.analysis.difficulties.length > 0 && <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">关键难点</CardTitle></CardHeader>
          <CardContent className="divide-y">
            {record.analysis.difficulties.map((item, index) => <div key={index} className="space-y-2 py-3 first:pt-0 last:pb-0">
              <button className="inline-flex max-w-full items-center gap-1 text-left text-sm font-medium underline decoration-border underline-offset-4 disabled:no-underline" disabled={!!busy || !record.sentence.includes(item.fragment)} onClick={() => selectFragment(item.fragment)}><span className="break-words">{item.fragment}</span><MessageCircle className="h-3.5 w-3.5 shrink-0" /></button>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{item.explanation}</p>
            </div>)}
          </CardContent>
        </Card>}

        <details className="rounded-xl border p-4">
          <summary className="cursor-pointer text-sm font-medium">按意群拆解与句子结构</summary>
          <div className="mt-4 space-y-4">
            {record.analysis.chunks.map((chunk, index) => <div key={index} className="border-l-2 border-primary/20 pl-3"><p className="break-words text-sm font-medium">{chunk.text}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{chunk.explanation}</p></div>)}
            {record.analysis.structure && <p className="whitespace-pre-wrap border-t pt-3 text-sm leading-relaxed">{record.analysis.structure}</p>}
          </div>
        </details>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">继续问这句话</CardTitle><p className="text-xs text-muted-foreground">自动带上原句、上下文和最近的对话，回答后保存。</p></CardHeader>
          <CardContent className="space-y-4">
            {record.messages.map(message => <div key={message.id} className={`rounded-lg p-3 text-sm ${message.role === "user" ? "ml-4 bg-muted sm:ml-10" : "border"}`}>
              <p className="mb-2 text-xs font-medium text-muted-foreground">{message.role === "user" ? "你" : "解析"}</p>
              {message.fragment && <blockquote className="mb-2 border-l-2 pl-2 text-muted-foreground">{message.fragment}</blockquote>}
              <div className="prose prose-sm max-w-none break-words dark:prose-invert"><ReactMarkdown>{message.content}</ReactMarkdown></div>
            </div>)}
            {fragment && <div className="space-y-2 rounded-lg bg-muted/60 p-3">
              <div className="flex items-start justify-between gap-2"><p className="break-words text-sm">引用：{fragment}</p><Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" aria-label="取消引用" disabled={!!busy} onClick={() => setFragment("")}><X className="h-3.5 w-3.5" /></Button></div>
            </div>}
            {error && errorLocation === "chat" && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Textarea ref={questionRef} aria-label="针对原句追问" placeholder="哪里还没理解？例如：这里的 it 指什么？为什么用这个时态？也可以补充前后文。" value={question} disabled={!!busy} maxLength={QUESTION_MAX_LENGTH} onChange={event => setQuestion(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) { event.preventDefault(); void sendQuestion() } }} />
            <div className="flex justify-end"><Button disabled={!!busy || !question.trim()} onClick={() => void sendQuestion()}>{busy === "chat" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{busy === "chat" ? "正在回答…" : "追问"}</Button></div>
          </CardContent>
        </Card>
      </div>}
    </div>
  )
}
