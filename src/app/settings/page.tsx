"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Save, Plus, Trash2, Loader2, LogIn, LogOut, UserPlus, Shield, KeyRound } from "lucide-react"
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

function clampInteger(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.floor(value)))
}

export default function SettingsPage() {
  const [interests, setInterests] = useState<string[]>([])
  const [customInterest, setCustomInterest] = useState("")
  const [customPrompt, setCustomPrompt] = useState("")
  const [batchMaxWords, setBatchMaxWords] = useState(50)
  const [batchConcurrency, setBatchConcurrency] = useState(3)
  const [endpoints, setEndpoints] = useState<AIEndpointConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [currentUser, setCurrentUser] = useState<string | null>(null)
  const [authUsername, setAuthUsername] = useState("")
  const [authPassword, setAuthPassword] = useState("")
  const [authError, setAuthError] = useState("")
  const [authLoading, setAuthLoading] = useState(false)

  const [adminPassword, setAdminPassword] = useState("")
  const [adminAuthed, setAdminAuthed] = useState(false)
  const [adminError, setAdminError] = useState("")
  const [adminUsers, setAdminUsers] = useState<{id: string, username: string, endpointCount: number, createdAt: string}[]>([])
  const [adminLoading, setAdminLoading] = useState(false)
  const [resetUserId, setResetUserId] = useState<string | null>(null)
  const [resetNewPassword, setResetNewPassword] = useState("")

  useEffect(() => {
    Promise.all([
      fetch("/api/auth").then(r => r.json()),
      fetch("/api/settings").then(r => r.json()),
    ]).then(([authData, settingsData]) => {
      setCurrentUser(authData.username ?? null)
      setInterests(settingsData.interests ?? [])
      setCustomPrompt(settingsData.customPrompt ?? "")
      setBatchMaxWords(clampInteger(Number(settingsData.batchMaxWords), 1, 100, 50))
      setBatchConcurrency(clampInteger(Number(settingsData.batchConcurrency), 1, 5, 3))
      const eps = typeof settingsData.aiEndpoints === "string"
        ? JSON.parse(settingsData.aiEndpoints || "[]")
        : settingsData.aiEndpoints ?? []
      setEndpoints(eps)
      setLoading(false)
    })
  }, [])

  const reloadEndpoints = async () => {
    const res = await fetch("/api/settings")
    const data = await res.json()
    const eps = typeof data.aiEndpoints === "string"
      ? JSON.parse(data.aiEndpoints || "[]")
      : data.aiEndpoints ?? []
    setEndpoints(eps)
  }

  const authAction = async (action: "login" | "register") => {
    if (!authUsername.trim() || !authPassword) return
    setAuthLoading(true)
    setAuthError("")

    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: authUsername.trim(), password: authPassword, action }),
    })
    const data = await res.json()

    if (!res.ok) {
      setAuthError(data.error)
      setAuthLoading(false)
      return
    }

    setCurrentUser(data.username)
    setAuthUsername("")
    setAuthPassword("")
    setAuthLoading(false)
    await reloadEndpoints()
  }

  const logout = async () => {
    await fetch("/api/auth", { method: "DELETE" })
    setCurrentUser(null)
    await reloadEndpoints()
  }

  const save = async () => {
    const safeBatchMaxWords = clampInteger(batchMaxWords, 1, 100, 50)
    const safeBatchConcurrency = clampInteger(batchConcurrency, 1, 5, 3)
    setBatchMaxWords(safeBatchMaxWords)
    setBatchConcurrency(safeBatchConcurrency)

    setSaving(true)
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        interests,
        customPrompt,
        batchMaxWords: safeBatchMaxWords,
        batchConcurrency: safeBatchConcurrency,
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

  const loadAdminUsers = async (pwd?: string) => {
    const p = pwd ?? adminPassword
    setAdminLoading(true)
    setAdminError("")
    const res = await fetch("/api/auth/admin", {
      headers: { "x-admin-password": p },
    })
    if (!res.ok) {
      const data = await res.json()
      setAdminError(data.error || "验证失败")
      setAdminAuthed(false)
      setAdminLoading(false)
      return
    }
    const data = await res.json()
    setAdminUsers(data)
    setAdminAuthed(true)
    setAdminLoading(false)
  }

  const deleteUser = async (id: string) => {
    await fetch(`/api/auth/admin?id=${id}`, {
      method: "DELETE",
      headers: { "x-admin-password": adminPassword },
    })
    loadAdminUsers()
  }

  const resetPassword = async (userId: string) => {
    if (!resetNewPassword.trim()) return
    await fetch("/api/auth/admin/reset", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": adminPassword,
      },
      body: JSON.stringify({ userId, newPassword: resetNewPassword }),
    })
    setResetUserId(null)
    setResetNewPassword("")
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
          <CardTitle className="text-base">批量查词设置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">最大单词数</label>
              <p className="text-xs text-muted-foreground">单次批量查询允许的最大单词数量 (1-100)</p>
              <Input
                type="number"
                min={1}
                max={100}
                value={batchMaxWords}
                onChange={e => setBatchMaxWords(clampInteger(e.currentTarget.valueAsNumber, 1, 100, 50))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">并发请求数</label>
              <p className="text-xs text-muted-foreground">同时处理的单词数量 (1-5)</p>
              <Input
                type="number"
                min={1}
                max={5}
                value={batchConcurrency}
                onChange={e => setBatchConcurrency(clampInteger(e.currentTarget.valueAsNumber, 1, 5, 3))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">AI 模型配置</CardTitle>
            <div className="flex items-center gap-2">
              {currentUser && (
                <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                  {currentUser}
                </Badge>
              )}
              <Button variant="outline" size="sm" onClick={addEndpoint}>
                <Plus className="h-4 w-4" />
                添加模型
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!currentUser ? (
            <div className="rounded-lg border border-dashed p-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                登录后 API 配置将绑定到你的账号，其他用户不可见。未登录时使用共享配置。
              </p>
              <div className="flex gap-2 items-end">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">用户名</label>
                  <Input
                    value={authUsername}
                    onChange={e => setAuthUsername(e.target.value)}
                    placeholder="输入用户名"
                    className="w-40"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">密码</label>
                  <Input
                    type="password"
                    value={authPassword}
                    onChange={e => setAuthPassword(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && authAction("login")}
                    placeholder="输入密码"
                    className="w-40"
                  />
                </div>
                <Button size="sm" onClick={() => authAction("login")} disabled={authLoading}>
                  <LogIn className="h-3.5 w-3.5" />
                  登录
                </Button>
                <Button size="sm" variant="outline" onClick={() => authAction("register")} disabled={authLoading}>
                  <UserPlus className="h-3.5 w-3.5" />
                  注册
                </Button>
              </div>
              {authError && <p className="text-sm text-destructive">{authError}</p>}
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-lg border border-dashed p-3">
              <p className="text-sm text-muted-foreground">
                已登录为 <span className="font-medium text-foreground">{currentUser}</span>，API 配置仅你可见
              </p>
              <Button size="sm" variant="ghost" onClick={logout}>
                <LogOut className="h-3.5 w-3.5" />
                退出
              </Button>
            </div>
          )}

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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4" />
            用户管理
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!adminAuthed ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">输入管理密码以查看和管理用户</p>
              <div className="flex gap-2">
                <Input
                  type="password"
                  value={adminPassword}
                  onChange={e => setAdminPassword(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && loadAdminUsers()}
                  placeholder="管理密码"
                  className="w-60"
                />
                <Button size="sm" onClick={() => loadAdminUsers()} disabled={adminLoading}>
                  {adminLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
                  验证
                </Button>
              </div>
              {adminError && <p className="text-sm text-destructive">{adminError}</p>}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">共 {adminUsers.length} 个用户</p>
                <Button size="sm" variant="ghost" onClick={() => setAdminAuthed(false)}>
                  退出管理
                </Button>
              </div>
              {adminUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">暂无注册用户</p>
              ) : (
                <div className="space-y-2">
                  {adminUsers.map(u => (
                    <div key={u.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <span className="font-medium text-sm">{u.username}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {u.endpointCount} 个 API 配置
                        </span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {new Date(u.createdAt).toLocaleDateString("zh-CN")}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        {resetUserId === u.id ? (
                          <div className="flex gap-1">
                            <Input
                              type="password"
                              value={resetNewPassword}
                              onChange={e => setResetNewPassword(e.target.value)}
                              onKeyDown={e => e.key === "Enter" && resetPassword(u.id)}
                              placeholder="新密码"
                              className="w-32 h-8 text-xs"
                            />
                            <Button size="sm" variant="outline" className="h-8" onClick={() => resetPassword(u.id)}>
                              确认
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8" onClick={() => { setResetUserId(null); setResetNewPassword("") }}>
                              取消
                            </Button>
                          </div>
                        ) : (
                          <>
                            <Button
                              variant="ghost" size="icon" className="h-8 w-8"
                              title="重置密码"
                              onClick={() => setResetUserId(u.id)}
                            >
                              <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                            <Button
                              variant="ghost" size="icon" className="h-8 w-8"
                              title="删除用户"
                              onClick={() => deleteUser(u.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
