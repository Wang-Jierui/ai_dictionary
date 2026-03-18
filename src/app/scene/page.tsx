"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Loader2, Languages, MessageSquare, AlertTriangle } from "lucide-react"

interface SceneResult {
  expressions: { english: string; chinese: string; context: string }[]
  dialogue: string
  culturalNotes: string
}

export default function ScenePage() {
  const [scene, setScene] = useState("")
  const [result, setResult] = useState<SceneResult | null>(null)
  const [loading, setLoading] = useState(false)

  const search = async () => {
    if (!scene.trim() || loading) return
    setLoading(true)
    setResult(null)

    try {
      const res = await fetch("/api/ai/scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene: scene.trim() }),
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
      }

      try {
        setResult(JSON.parse(text))
      } catch {
        setResult(null)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">场景表达</h1>
      <p className="text-sm text-muted-foreground">输入中文场景描述，AI 告诉你地道的英文怎么说</p>

      <div className="flex gap-2">
        <Input
          value={scene}
          onChange={e => setScene(e.target.value)}
          onKeyDown={e => e.key === "Enter" && search()}
          placeholder="例如：在咖啡店点一杯拿铁、向老板请假一天..."
          className="h-11 text-base"
          autoFocus
        />
        <Button onClick={search} disabled={loading || !scene.trim()} className="h-11 px-6">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "查询"}
        </Button>
      </div>

      {loading && (
        <Card>
          <CardContent className="pt-6 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            AI 正在生成表达方式...
          </CardContent>
        </Card>
      )}

      {result && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Languages className="h-4 w-4 text-blue-500" />
                常用表达
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {result.expressions.map((exp, i) => (
                  <div key={i} className="rounded-lg border p-3">
                    <p className="font-medium text-sm">{exp.english}</p>
                    <p className="text-sm text-muted-foreground mt-1">{exp.chinese}</p>
                    <Badge className="mt-1.5 text-xs">{exp.context}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="h-4 w-4 text-emerald-500" />
                对话示例
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{result.dialogue}</p>
            </CardContent>
          </Card>

          {result.culturalNotes && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  文化差异提醒
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{result.culturalNotes}</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {!result && !loading && (
        <div className="text-center py-20 text-muted-foreground">
          <Languages className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg">描述一个场景，学习地道表达</p>
          <p className="text-sm mt-1">例如：在机场办理登机手续、和房东讨价还价</p>
        </div>
      )}
    </div>
  )
}
