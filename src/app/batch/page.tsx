"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Upload, Play, CheckCircle2, XCircle, FileText, ListPlus, AlertTriangle, RefreshCw } from "lucide-react"
import type { DictionaryEntry, AIWordData } from "@/types/dictionary"

interface BatchLookupResult {
  index: number
  word: string
  status: "pending" | "requesting" | "cached" | "success" | "error"
  cached: boolean
  dictData: DictionaryEntry | null
  aiData: AIWordData | null
  error?: string
}

type LookupQueueItem = Pick<BatchLookupResult, "index" | "word">

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.floor(value)))
}

function minInteger(value: unknown, min: number, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.floor(value))
}

export default function BatchPage() {
  const [inputText, setInputText] = useState("")
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<BatchLookupResult[]>([])
  const [error, setError] = useState("")
  const [maxWords, setMaxWords] = useState(50)
  const [concurrency, setConcurrency] = useState(3)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch("/api/settings")
      .then(res => res.json())
      .then(data => {
        setMaxWords(clampInteger(data.batchMaxWords, 1, 1000, 50))
        setConcurrency(minInteger(data.batchConcurrency, 1, 3))
      })
      .catch(() => undefined)
  }, [])

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      if (text) {
        setInputText((prev) => {
          const newText = prev ? prev + "\n" + text : text
          return newText
        })
      }
    }
    reader.onerror = () => {
      setError("读取文件失败")
    }
    reader.readAsText(file)
    
    // Reset input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const lookupQueuedWords = async (items: LookupQueueItem[]) => {
    if (items.length === 0) return

    setError("")
    setLoading(true)

    try {
      let currentIndex = 0
      const activePromises: Promise<void>[] = []

      const processNext = async (): Promise<void> => {
        if (currentIndex >= items.length) return
        
        const item = items[currentIndex]
        currentIndex += 1

        setResults(prev => {
          const next = [...prev]
          next[item.index] = {
            ...next[item.index],
            status: "requesting",
            cached: false,
            dictData: null,
            aiData: null,
            error: undefined,
          }
          return next
        })

        try {
          const res = await fetch("/api/ai/batch-lookup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ words: [item.word], concurrency: 1 }),
          })

          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            throw new Error(data.error || "查询失败")
          }

          const data = await res.json()
          if (data.results && Array.isArray(data.results) && data.results.length > 0) {
            const result = data.results[0]
            setResults(prev => {
              const next = [...prev]
              next[item.index] = { ...result, index: item.index }
              return next
            })
          } else {
            throw new Error("返回数据格式错误")
          }
        } catch (err) {
          setResults(prev => {
            const next = [...prev]
            next[item.index] = { 
              ...next[item.index], 
              status: "error", 
              error: err instanceof Error ? err.message : "发生未知错误",
            }
            return next
          })
        }

        await processNext()
      }

      const workerConcurrency = Math.min(concurrency, items.length)
      for (let i = 0; i < workerConcurrency; i++) {
        activePromises.push(processNext())
      }

      await Promise.all(activePromises)
    } catch (err) {
      setError(err instanceof Error ? err.message : "发生未知错误")
    } finally {
      setLoading(false)
    }
  }

  const handleBatchLookup = async () => {
    setError("")
    setResults([])
    
    // Parse words: split by newline, comma, or space, then filter empty and duplicates
    const rawWords = inputText.split(/[\n,\s]+/).map(w => w.trim()).filter(Boolean)
    const uniqueWords = Array.from(new Set(rawWords))

    if (uniqueWords.length === 0) {
      setError("请输入或上传至少一个单词")
      return
    }

    if (uniqueWords.length > maxWords) {
      setError(`一次最多查询 ${maxWords} 个不重复单词，请拆分后再试`)
      return
    }

    const initialResults: BatchLookupResult[] = uniqueWords.map((word, index) => ({
      index,
      word,
      status: "pending",
      cached: false,
      dictData: null,
      aiData: null,
    }))
    setResults(initialResults)
    await lookupQueuedWords(initialResults.map(({ index, word }) => ({ index, word })))
  }

  const retryFailedLookups = async () => {
    const failedItems = results
      .filter(result => result.status === "error")
      .map(({ index, word }) => ({ index, word }))

    await lookupQueuedWords(failedItems)
  }

  const successCount = results.filter(r => r.status === "success" || r.status === "cached").length
  const errorCount = results.filter(r => r.status === "error").length
  const cachedCount = results.filter(r => r.status === "cached").length
  const pendingCount = results.filter(r => r.status === "pending").length
  const requestingCount = results.filter(r => r.status === "requesting").length
  const completedCount = successCount + errorCount
  const totalCount = results.length
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">批量查词</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ListPlus className="h-4 w-4 text-primary" />
            输入单词列表
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            支持每行一个单词，或使用逗号、空格分隔。自动忽略空行和重复项。当前最多 {maxWords} 个词，并发 {concurrency} 个请求。
          </p>
          
          <Textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="apple&#10;banana&#10;cherry..."
            className="min-h-[150px] font-mono text-sm"
          />

          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept=".txt"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileUpload}
            />
            <Button 
              variant="outline" 
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
            >
              <Upload className="h-4 w-4 mr-2" />
              上传 .txt 文件
            </Button>
            
            <Button 
              onClick={handleBatchLookup} 
              disabled={loading || !inputText.trim()}
              className="min-w-[120px]"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  查询中...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  开始批量查询
                </>
              )}
            </Button>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-500" />
                查询结果
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {loading && (
                  <Badge className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100">
                    进度: {completedCount}/{totalCount} ({progressPercent}%)
                  </Badge>
                )}
                {requestingCount > 0 && (
                  <Badge className="bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100">
                    请求中: {requestingCount}
                  </Badge>
                )}
                {pendingCount > 0 && (
                  <Badge className="bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100">
                    等待中: {pendingCount}
                  </Badge>
                )}
                <Badge className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100">
                  成功: {successCount}
                </Badge>
                {cachedCount > 0 && (
                  <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100">
                    (含缓存: {cachedCount})
                  </Badge>
                )}
                {errorCount > 0 && (
                  <Badge className="bg-red-50 text-red-700 border-red-200 hover:bg-red-100">
                    失败: {errorCount}
                  </Badge>
                )}
                <Badge className="bg-secondary text-secondary-foreground">
                  总计: {totalCount}
                </Badge>
                {errorCount > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={retryFailedLookups}
                    disabled={loading}
                  >
                    {loading ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    重试失败项
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {results.map((result) => (
                <div 
                  key={`${result.index}-${result.word}`}
                  className={`p-3 rounded-md border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    result.status === "error" ? "bg-red-50/30 border-red-100" : 
                    result.status === "requesting" ? "bg-amber-50/30 border-amber-100" :
                    result.status === "pending" ? "bg-slate-50/30 border-slate-100 opacity-70" :
                    "bg-muted/30"
                  }`}
                >
                  <div className="flex items-start sm:items-center gap-3 min-w-0">
                    {result.status === "error" ? (
                      <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5 sm:mt-0" />
                    ) : result.status === "requesting" ? (
                      <Loader2 className="h-5 w-5 text-amber-500 shrink-0 mt-0.5 sm:mt-0 animate-spin" />
                    ) : result.status === "pending" ? (
                      <div className="h-5 w-5 rounded-full border-2 border-slate-300 shrink-0 mt-0.5 sm:mt-0" />
                    ) : (
                      <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5 sm:mt-0" />
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <span className="font-medium">{result.word}</span>
                        {result.dictData?.phonetic && (
                          <span className="text-xs text-muted-foreground font-mono">
                            {result.dictData.phonetic}
                          </span>
                        )}
                        {result.cached && (
                          <Badge className="text-[10px] h-5 px-1.5 bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100">
                            已缓存
                          </Badge>
                        )}
                        {result.status === "requesting" && (
                          <Badge className="text-[10px] h-5 px-1.5 bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100">
                            请求中
                          </Badge>
                        )}
                        {result.status === "pending" && (
                          <Badge className="text-[10px] h-5 px-1.5 bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100">
                            等待中
                          </Badge>
                        )}
                      </div>
                      {result.status === "error" ? (
                        <p className="text-sm text-red-600 mt-1">{result.error}</p>
                      ) : result.status === "requesting" ? (
                        <p className="text-sm text-amber-600 mt-1">正在查询...</p>
                      ) : result.status === "pending" ? (
                        <p className="text-sm text-slate-500 mt-1">等待查询</p>
                      ) : (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                          {result.aiData?.chineseDefinition || 
                           result.dictData?.meanings[0]?.definitions[0]?.definition || 
                           "暂无释义"}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {(result.status === "success" || result.status === "cached") && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="shrink-0 self-start sm:self-auto"
                      onClick={() => window.open(`/?word=${encodeURIComponent(result.word)}`, "_blank")}
                    >
                      查看详情
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
