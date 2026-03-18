"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Save, Plus, Trash2, Loader2 } from "lucide-react"
import type { AIEndpointConfig, AITask } from "@/types/dictionary"

const ALL_TASKS: { value: AITask; label: string }[] = [
  { value: "lookup", label: "查词" },
  { value: "story", label: "故事" },
  { value: "roleplay", label: "对话" },
  { value: "image", label: "生图" },
  { value: "scene", label: "场景" },
]

const INTEREST_PRESETS = [
  "科幻", "篮球", "编程", "美妆", "游戏", "音乐", "电影",
  "美食", "旅行", "历史", "科技", "动漫", "文学", "商业",
]

export default function SettingsPage() {
  const [interests, setInterests] = useState<string[]>([])
  const [customInterest, setCustomInterest] = useState("")
  const [customPrompt, setCustomPrompt] = useState("")
  const [endpoints, setEndpoints] = useState<AIEndpointConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch("/api/settings")
      .then(res => res.json())
      .then(data => {
        setInterests(data.interests ?? [])
        setCustomPrompt(data.customPrompt ?? "")
        const eps = typeof data.aiEndpoints === "string"
          ? JSON.parse(data.aiEndpoints || "[]")
          : data.aiEndpoints ?? []
        setEndpoints(eps)
        setLoading(false)
      })
  }, [])

  const save = async () => {
    setSaving(true)
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        interests,
        customPrompt,
        aiEndpoints: endpoints,
      }),
    })
    setSaving(false)
  }

  const toggleInterest = (interest: string) => {
    setInterests(prev =>
      prev.includes(interest)
        ? prev.filter(i => i !== interest)
        : [...prev, interest]
    )
  }

  const addCustomInterest = () => {
    const trimmed = customInterest.trim()
    if (trimmed && !interests.includes(trimmed)) {
      setInterests(prev => [...prev, trimmed])
      setCustomInterest("")
    }
  }

  const addEndpoint = () => {
    setEndpoints(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: `模型 ${prev.length + 1}`,
        baseURL: "https://api.openai.com/v1",
        apiKey: "",
        model: "gpt-4o-mini",
        tasks: ["lookup"],
      },
    ])
  }

  const updateEndpoint = (id: string, updates: Partial<AIEndpointConfig>) => {
    setEndpoints(prev =>
      prev.map(ep => (ep.id === id ? { ...ep, ...updates } : ep))
    )
  }

  const removeEndpoint = (id: string) => {
    setEndpoints(prev => prev.filter(ep => ep.id !== id))
  }

  const toggleTask = (endpointId: string, task: AITask) => {
    setEndpoints(prev =>
      prev.map(ep => {
        if (ep.id !== endpointId) return ep
        const tasks = ep.tasks.includes(task)
          ? ep.tasks.filter(t => t !== task)
          : [...ep.tasks, task]
        return { ...ep, tasks }
      })
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        加载设置...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">设置</h1>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          保存
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">兴趣标签</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">选择你的兴趣，AI 将据此生成贴近你生活的例句</p>
          <div className="flex flex-wrap gap-2">
            {INTEREST_PRESETS.map(interest => (
              <Badge
                key={interest}
                className={`cursor-pointer transition-colors ${
                  interests.includes(interest)
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
                onClick={() => toggleInterest(interest)}
              >
                {interest}
              </Badge>
            ))}
            {interests.filter(i => !INTEREST_PRESETS.includes(i)).map(interest => (
              <Badge
                key={interest}
                className="cursor-pointer bg-primary text-primary-foreground"
                onClick={() => toggleInterest(interest)}
              >
                {interest} ×
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={customInterest}
              onChange={e => setCustomInterest(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addCustomInterest()}
              placeholder="添加自定义兴趣..."
              className="max-w-xs"
            />
            <Button variant="outline" size="sm" onClick={addCustomInterest}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">自定义提示词</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-2">
            额外的 AI 指令，会附加到每次查词请求中。例如：&ldquo;请用简单的语言解释&rdquo;
          </p>
          <Textarea
            value={customPrompt}
            onChange={e => setCustomPrompt(e.target.value)}
            placeholder="输入自定义提示词..."
            rows={3}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">AI 模型配置</CardTitle>
            <Button variant="outline" size="sm" onClick={addEndpoint}>
              <Plus className="h-4 w-4" />
              添加模型
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            配置 OpenAI 兼容的 API 端点，可为不同任务分配不同模型
          </p>
          {endpoints.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              尚未配置模型，点击&ldquo;添加模型&rdquo;开始
            </p>
          )}
          {endpoints.map(ep => (
            <div key={ep.id} className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Input
                  value={ep.name}
                  onChange={e => updateEndpoint(ep.id, { name: e.target.value })}
                  className="max-w-[200px] font-medium"
                />
                <Button variant="ghost" size="icon" onClick={() => removeEndpoint(ep.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Base URL</label>
                  <Input
                    value={ep.baseURL}
                    onChange={e => updateEndpoint(ep.id, { baseURL: e.target.value })}
                    placeholder="https://api.openai.com/v1"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">模型名称</label>
                  <Input
                    value={ep.model}
                    onChange={e => updateEndpoint(ep.id, { model: e.target.value })}
                    placeholder="gpt-4o-mini"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">API Key</label>
                <Input
                  type="password"
                  value={ep.apiKey}
                  onChange={e => updateEndpoint(ep.id, { apiKey: e.target.value })}
                  placeholder="sk-..."
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">负责任务</label>
                <div className="flex gap-2">
                  {ALL_TASKS.map(task => (
                    <Badge
                      key={task.value}
                      className={`cursor-pointer transition-colors ${
                        ep.tasks.includes(task.value)
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-secondary-foreground"
                      }`}
                      onClick={() => toggleTask(ep.id, task.value)}
                    >
                      {task.label}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
