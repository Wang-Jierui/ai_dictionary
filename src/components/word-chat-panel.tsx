"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import ReactMarkdown from "react-markdown"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import "katex/dist/katex.min.css"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Send, Loader2, MessageSquare, ChevronDown, ChevronLeft, ChevronRight,
  GitBranch, Trash2,
} from "lucide-react"
import type { DictionaryEntry, AIWordData } from "@/types/dictionary"

interface ChatMessage {
  id: string
  parentId: string | null
  role: "user" | "assistant"
  content: string
  createdAt: string
}

interface WordChatPanelProps {
  word: string
  dictData: DictionaryEntry | null
  aiData: AIWordData | null
}

function getPathToRoot(messages: ChatMessage[], leafId: string): ChatMessage[] {
  const map = new Map(messages.map(m => [m.id, m]))
  const path: ChatMessage[] = []
  let current = map.get(leafId)
  while (current) {
    path.unshift(current)
    current = current.parentId ? map.get(current.parentId) : undefined
  }
  return path
}

function getChildren(messages: ChatMessage[], parentId: string | null): ChatMessage[] {
  return messages.filter(m => m.parentId === parentId)
}

function findDeepestLeaf(messages: ChatMessage[], startId: string): string {
  const children = messages.filter(m => m.parentId === startId)
  if (children.length === 0) return startId
  return findDeepestLeaf(messages, children[children.length - 1].id)
}

export function WordChatPanel({ word, dictData, aiData }: WordChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [activeLeafId, setActiveLeafId] = useState<string | null>(null)
  const [chatId, setChatId] = useState<string | null>(null)
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, activeLeafId])

  const loadChat = useCallback(async () => {
    if (!word || loaded) return
    try {
      const res = await fetch(`/api/word-chat?word=${encodeURIComponent(word)}`)
      const data = await res.json()
      if (data && data.id) {
        setChatId(data.id)
        const msgs = (data.messages ?? []) as ChatMessage[]
        setMessages(msgs)
        setActiveLeafId(data.activeLeafId ?? null)
      } else {
        setMessages([])
        setActiveLeafId(null)
        setChatId(null)
      }
    } catch {
      // ignore
    }
    setLoaded(true)
  }, [word, loaded])

  useEffect(() => {
    if (expanded && !loaded) loadChat()
  }, [expanded, loaded, loadChat])

  useEffect(() => {
    setLoaded(false)
    setMessages([])
    setActiveLeafId(null)
    setChatId(null)
    setExpanded(false)
  }, [word])

  const activePath = activeLeafId ? getPathToRoot(messages, activeLeafId) : []

  const sendMessage = async (forkFromId?: string) => {
    if (!input.trim() || loading) return
    const parentId = forkFromId ?? activeLeafId
    setLoading(true)

    try {
      const res = await fetch("/api/ai/word-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word,
          content: input.trim(),
          parentId,
          dictData,
          aiData,
        }),
      })

      if (!res.ok) { setLoading(false); return }

      const userMsgId = res.headers.get("X-User-Message-Id") || crypto.randomUUID()
      const userMsg: ChatMessage = {
        id: userMsgId,
        parentId: parentId,
        role: "user",
        content: input.trim(),
        createdAt: new Date().toISOString(),
      }

      setInput("")
      const newMessages = [...messages, userMsg]
      setMessages(newMessages)

      const reader = res.body?.getReader()
      if (!reader) { setLoading(false); return }

      const decoder = new TextDecoder()
      let text = ""
      const assistantMsgId = crypto.randomUUID()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        text += decoder.decode(value, { stream: true })
        const tempAssistant: ChatMessage = {
          id: assistantMsgId,
          parentId: userMsgId,
          role: "assistant",
          content: text,
          createdAt: new Date().toISOString(),
        }
        setMessages([...newMessages, tempAssistant])
        setActiveLeafId(assistantMsgId)
      }

      const finalAssistant: ChatMessage = {
        id: assistantMsgId,
        parentId: userMsgId,
        role: "assistant",
        content: text,
        createdAt: new Date().toISOString(),
      }
      const finalMessages = [...newMessages, finalAssistant]
      setMessages(finalMessages)
      setActiveLeafId(assistantMsgId)
    } finally {
      setLoading(false)
    }
  }

  const getSiblings = (msg: ChatMessage): ChatMessage[] => {
    return getChildren(messages, msg.parentId).filter(m => m.role === msg.role)
  }

  const switchBranch = (msg: ChatMessage, direction: -1 | 1) => {
    const siblings = getSiblings(msg)
    const idx = siblings.findIndex(s => s.id === msg.id)
    const newIdx = idx + direction
    if (newIdx < 0 || newIdx >= siblings.length) return
    const newMsg = siblings[newIdx]
    const newLeaf = findDeepestLeaf(messages, newMsg.id)
    setActiveLeafId(newLeaf)
  }

  const forkFrom = (msgId: string) => {
    const msg = messages.find(m => m.id === msgId)
    if (!msg) return
    const targetId = msg.role === "assistant" ? msg.id : msg.parentId
    if (targetId) {
      setActiveLeafId(targetId)
    }
  }

  const deleteChat = async () => {
    if (!chatId) return
    await fetch(`/api/word-chat?id=${chatId}`, { method: "DELETE" })
    setMessages([])
    setActiveLeafId(null)
    setChatId(null)
  }

  return (
    <Card>
      <CardHeader
        className="pb-2 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4 text-indigo-500" />
            AI 问答
            {messages.length > 0 && (
              <span className="text-xs text-muted-foreground font-normal">
                ({messages.length} 条消息)
              </span>
            )}
          </CardTitle>
          <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-3">
          {activePath.length > 0 && (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {activePath.map((msg) => {
                const siblings = getSiblings(msg)
                const sibIdx = siblings.findIndex(s => s.id === msg.id)
                const hasBranches = siblings.length > 1

                return (
                  <div key={msg.id}>
                    <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className="max-w-[85%] space-y-1">
                        <div
                          className={`rounded-lg px-3 py-2 text-sm ${
                            msg.role === "user"
                              ? "bg-primary text-primary-foreground whitespace-pre-wrap"
                              : "bg-muted prose prose-sm max-w-none dark:prose-invert"
                          }`}
                        >
                          {msg.role === "assistant" ? (
                            <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{msg.content}</ReactMarkdown>
                          ) : (
                            msg.content
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {hasBranches && (
                            <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
                              <Button
                                variant="ghost" size="icon" className="h-5 w-5"
                                disabled={sibIdx === 0}
                                onClick={() => switchBranch(msg, -1)}
                              >
                                <ChevronLeft className="h-3 w-3" />
                              </Button>
                              <span>{sibIdx + 1}/{siblings.length}</span>
                              <Button
                                variant="ghost" size="icon" className="h-5 w-5"
                                disabled={sibIdx === siblings.length - 1}
                                onClick={() => switchBranch(msg, 1)}
                              >
                                <ChevronRight className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                          {msg.role === "assistant" && (
                            <Button
                              variant="ghost" size="icon" className="h-5 w-5"
                              title="从这里重新对话"
                              onClick={() => forkFrom(msg.id)}
                            >
                              <GitBranch className="h-3 w-3 text-muted-foreground" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>
          )}

          {activePath.length === 0 && loaded && (
            <p className="text-sm text-muted-foreground text-center py-2">
              对这个单词有疑问？问 AI 吧
            </p>
          )}

          <div className="flex gap-2">
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendMessage()}
              placeholder="问问关于这个单词的问题..."
              disabled={loading}
              className="text-sm"
            />
            <Button
              size="icon"
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>

          {messages.length > 0 && (
            <div className="flex justify-end">
              <Button
                variant="ghost" size="sm"
                className="text-xs text-muted-foreground"
                onClick={deleteChat}
              >
                <Trash2 className="h-3 w-3" />
                清空对话
              </Button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}
