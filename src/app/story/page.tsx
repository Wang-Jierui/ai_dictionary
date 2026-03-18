"use client"

import { useState, useEffect, useRef, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, Sparkles, RefreshCw } from "lucide-react"

export default function StoryPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />加载中...</div>}>
      <StoryContent />
    </Suspense>
  )
}

function StoryContent() {
  const searchParams = useSearchParams()
  const wordsParam = searchParams.get("words")
  const [words, setWords] = useState<string[]>([])
  const [story, setStory] = useState("")
  const [loading, setLoading] = useState(false)
  const [vocabWords, setVocabWords] = useState<string[]>([])
  const [selectedWords, setSelectedWords] = useState<Set<string>>(new Set())
  const initialized = useRef(false)

  useEffect(() => {
    if (wordsParam && !initialized.current) {
      initialized.current = true
      const w = wordsParam.split(",").filter(Boolean)
      setWords(w)
      setSelectedWords(new Set(w))
      generateStory(w)
    }
  }, [wordsParam])

  useEffect(() => {
    fetch("/api/vocabulary")
      .then(res => res.json())
      .then(data => {
        setVocabWords(data.map((d: { word: string }) => d.word))
      })
  }, [])

  const generateStory = async (wordList: string[]) => {
    if (wordList.length < 2) return
    setLoading(true)
    setStory("")

    try {
      const res = await fetch("/api/ai/story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ words: wordList }),
      })

      if (!res.ok) { setLoading(false); return }

      const reader = res.body?.getReader()
      if (!reader) { setLoading(false); return }

      const decoder = new TextDecoder()
      let text = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        text += decoder.decode(value, { stream: true })
        setStory(text)
      }
    } finally {
      setLoading(false)
    }
  }

  const toggleWord = (word: string) => {
    setSelectedWords(prev => {
      const next = new Set(prev)
      if (next.has(word)) next.delete(word)
      else next.add(word)
      return next
    })
  }

  const handleGenerate = () => {
    const wordList = Array.from(selectedWords)
    setWords(wordList)
    generateStory(wordList)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">每日串词故事</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">选择单词</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">从生词本中选择 2-10 个单词，AI 将编写包含这些词的故事</p>
          {vocabWords.length === 0 ? (
            <p className="text-sm text-muted-foreground">生词本为空，请先收藏一些单词</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {vocabWords.map(word => (
                <Badge
                  key={word}
                  className={`cursor-pointer transition-colors ${
                    selectedWords.has(word)
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  }`}
                  onClick={() => toggleWord(word)}
                >
                  {word}
                </Badge>
              ))}
            </div>
          )}
          <Button
            onClick={handleGenerate}
            disabled={selectedWords.size < 2 || loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            生成故事 ({selectedWords.size} 词)
          </Button>
        </CardContent>
      </Card>

      {(story || loading) && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-amber-500" />
                AI 故事
              </CardTitle>
              {!loading && story && (
                <Button variant="ghost" size="sm" onClick={handleGenerate}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  重新生成
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {words.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {words.map(w => (
                  <Badge key={w} className="text-xs">{w}</Badge>
                ))}
              </div>
            )}
            {loading && !story && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                AI 正在编写故事...
              </div>
            )}
            <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm leading-relaxed">
              {story}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
