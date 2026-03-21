"use client"

import { useState, useRef, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import "katex/dist/katex.min.css"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Send, Loader2, Swords, RefreshCw } from "lucide-react"

interface Message {
  role: "user" | "assistant"
  content: string
}

const SCENARIOS = [
  { title: "餐厅点餐", desc: "你在一家高档西餐厅，正在和服务员交流" },
  { title: "职场面试", desc: "你正在参加一家科技公司的英语面试" },
  { title: "旅行问路", desc: "你在伦敦街头，需要找到最近的地铁站" },
  { title: "商务谈判", desc: "你在和客户讨论一个合作项目的细节" },
  { title: "看病就医", desc: "你在国外感到不舒服，去诊所看医生" },
  { title: "租房咨询", desc: "你在和房东讨论租房的条件和价格" },
]

export default function RoleplayPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />加载中...</div>}>
      <RoleplayContent />
    </Suspense>
  )
}

function RoleplayContent() {
  const searchParams = useSearchParams()
  const wordParam = searchParams.get("word")
  const [targetWord, setTargetWord] = useState(wordParam ?? "")
  const [scenario, setScenario] = useState("")
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [loadingScenario, setLoadingScenario] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [started, setStarted] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const autoStarted = useRef(false)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    if (wordParam && !autoStarted.current) {
      autoStarted.current = true
      autoStartSession(wordParam)
    }
  }, [wordParam])

  const autoStartSession = async (word: string) => {
    if (!word.trim()) return
    setTargetWord(word.trim())
    setLoadingScenario(true)

    try {
      const res = await fetch("/api/ai/auto-scenario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: word.trim() }),
      })
      if (!res.ok) { setLoadingScenario(false); return }

      const reader = res.body?.getReader()
      if (!reader) { setLoadingScenario(false); return }

      const decoder = new TextDecoder()
      let text = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        text += decoder.decode(value, { stream: true })
      }

      setLoadingScenario(false)
      startSession(text.trim(), word.trim())
    } catch {
      setLoadingScenario(false)
    }
  }

  const startSession = async (scenarioDesc: string, word?: string) => {
    const w = word ?? targetWord.trim()
    if (!w) return
    setScenario(scenarioDesc)
    setStarted(true)
    setMessages([])
    setLoading(true)

    try {
      const res = await fetch("/api/ai/roleplay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetWord: w,
          scenario: scenarioDesc,
          messages: [{ role: "user", content: `Let's start the roleplay. The scenario is: ${scenarioDesc}. I need to practice using the word "${w}". Please begin the conversation.` }],
        }),
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
        setMessages([{ role: "assistant", content: text }])
      }

      setMessages([{ role: "assistant", content: text }])
    } finally {
      setLoading(false)
    }
  }

  const sendMessage = async () => {
    if (!input.trim() || loading) return
    const userMsg: Message = { role: "user", content: input.trim() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput("")
    setLoading(true)

    try {
      const res = await fetch("/api/ai/roleplay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          targetWord,
          scenario,
          messages: newMessages,
        }),
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
        setMessages([...newMessages, { role: "assistant", content: text }])
      }
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setStarted(false)
    setMessages([])
    setSessionId(null)
    setScenario("")
  }

  if (!started) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">情景角色扮演</h1>

        {loadingScenario && (
          <Card>
            <CardContent className="pt-6 flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              AI 正在为 &ldquo;{targetWord}&rdquo; 匹配最佳场景...
            </CardContent>
          </Card>
        )}

        {!loadingScenario && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">目标单词</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    value={targetWord}
                    onChange={e => setTargetWord(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && autoStartSession(targetWord)}
                    placeholder="输入要练习的单词..."
                    className="max-w-xs"
                  />
                  <Button onClick={() => autoStartSession(targetWord)} disabled={!targetWord.trim()}>
                    AI 匹配场景
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">或手动选择场景</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {SCENARIOS.map(s => (
                    <button
                      key={s.title}
                      onClick={() => startSession(s.desc)}
                      disabled={!targetWord.trim()}
                      className="rounded-lg border p-4 text-left transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="font-medium">{s.title}</div>
                      <div className="text-sm text-muted-foreground mt-1">{s.desc}</div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">实战对话</h1>
          <Badge>{targetWord}</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={reset}>
          <RefreshCw className="h-3.5 w-3.5" />
          重新开始
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">{scenario}</p>

      <div className="space-y-3 min-h-[400px]">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2.5 text-sm ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground whitespace-pre-wrap"
                  : "bg-muted prose prose-sm max-w-none dark:prose-invert"
              }`}
            >
              {msg.role === "assistant" ? (
                <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]}>{msg.content}</ReactMarkdown>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}
        {loading && messages.length === 0 && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            AI 正在准备场景...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="sticky bottom-4 flex gap-2">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && sendMessage()}
          placeholder="输入你的回复..."
          disabled={loading}
          className="bg-background"
        />
        <Button onClick={sendMessage} disabled={loading || !input.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}
