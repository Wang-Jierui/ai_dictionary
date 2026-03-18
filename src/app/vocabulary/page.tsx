"use client"

import Link from "next/link"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Trash2, Loader2, BookOpen, Sparkles, ExternalLink, Search } from "lucide-react"

interface VocabEntry {
  id: string
  word: string
  phonetic: string | null
  briefDefinition: string
  chineseDefinition: string | null
  notes: string | null
  createdAt: string
}

export default function VocabularyPage() {
  const [words, setWords] = useState<VocabEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch("/api/vocabulary")
      .then(res => res.json())
      .then(data => {
        setWords(data)
        setLoading(false)
      })
  }, [])

  const deleteWord = async (id: string) => {
    await fetch(`/api/vocabulary?id=${id}`, { method: "DELETE" })
    setWords(prev => prev.filter(w => w.id !== id))
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">生词本</h1>
        {selectedIds.size >= 2 && (
          <Button onClick={goToStory}>
            <Sparkles className="h-4 w-4" />
            用 {selectedIds.size} 个词生成故事
          </Button>
        )}
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
          <p className="text-lg">生词本是空的</p>
          <p className="text-sm mt-1">查词时点击&ldquo;收藏&rdquo;按钮添加生词</p>
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
              }`}
              onClick={() => toggleSelect(entry.id)}
            >
              <CardContent className="flex items-center justify-between py-3 px-4">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(entry.id)}
                    onChange={() => toggleSelect(entry.id)}
                    className="h-4 w-4 rounded"
                    onClick={e => e.stopPropagation()}
                  />
                  <div>
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
                  <Link href={`/?word=${encodeURIComponent(entry.word)}`}>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <ExternalLink className="h-4 w-4 text-blue-500" />
                    </Button>
                  </Link>
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
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
