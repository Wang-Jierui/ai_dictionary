"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Upload, Play, CheckCircle2, XCircle, FileText, ListPlus, AlertTriangle } from "lucide-react"
import type { DictionaryEntry, AIWordData } from "@/types/dictionary"

interface BatchLookupResult {
  index: number
  word: string
  status: "cached" | "success" | "error"
  cached: boolean
  dictData: DictionaryEntry | null
  aiData: AIWordData | null
  error?: string
}

export default function BatchPage() {
  const [inputText, setInputText] = useState("")
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<BatchLookupResult[]>([])
  const [error, setError] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

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

    setLoading(true)

    try {
      const res = await fetch("/api/ai/batch-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ words: uniqueWords, concurrency: 3 }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "批量查询失败")
      }

      const data = await res.json()
      if (data.results && Array.isArray(data.results)) {
        // Sort by index to maintain original order
        const sortedResults = [...data.results].sort((a, b) => a.index - b.index)
        setResults(sortedResults)
      } else {
        throw new Error("返回数据格式错误")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "发生未知错误")
    } finally {
      setLoading(false)
    }
  }

  const successCount = results.filter(r => r.status === "success" || r.status === "cached").length
  const errorCount = results.filter(r => r.status === "error").length
  const cachedCount = results.filter(r => r.status === "cached").length

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
            支持每行一个单词，或使用逗号、空格分隔。自动忽略空行和重复项。
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
                  总计: {results.length}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {results.map((result) => (
                <div 
                  key={`${result.index}-${result.word}`}
                  className={`p-3 rounded-md border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    result.status === "error" ? "bg-red-50/30 border-red-100" : "bg-muted/30"
                  }`}
                >
                  <div className="flex items-start sm:items-center gap-3 min-w-0">
                    {result.status === "error" ? (
                      <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5 sm:mt-0" />
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
                      </div>
                      {result.status === "error" ? (
                        <p className="text-sm text-red-600 mt-1">{result.error}</p>
                      ) : (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                          {result.aiData?.chineseDefinition || 
                           result.dictData?.meanings[0]?.definitions[0]?.definition || 
                           "暂无释义"}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {result.status !== "error" && (
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
