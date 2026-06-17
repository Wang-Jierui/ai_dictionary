"use client"

import Image from "next/image"
import {
  AlertTriangle,
  BookOpen,
  Brain,
  Eye,
  HelpCircle,
  History as HistoryIcon,
  ImageIcon,
  Lightbulb,
  Link2,
  Loader2,
  Map as MapIcon,
  PenTool,
  RefreshCw,
  Sparkles,
  Split,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { AISectionId } from "@/lib/constants"
import type { AIWordData } from "@/types/dictionary"

export type WordImageMode = "mood" | "meme"

interface AiLearningSectionProps {
  sectionId: AISectionId
  aiData: AIWordData
  word: string
  generatingMnemonic?: boolean
  onRegenerateMnemonic?: (word: string) => void
}

interface WordImagePanelProps {
  word: string
  imageData: string | null
  imageMode: WordImageMode | null
  generatingImage: boolean
  onGenerate: (word: string, mode: WordImageMode) => void
}

export function AiLearningSection({
  sectionId,
  aiData,
  word,
  generatingMnemonic = false,
  onRegenerateMnemonic,
}: AiLearningSectionProps) {
  switch (sectionId) {
    case "coreImage":
      if (!aiData.coreImage) return null
      return (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex items-start gap-3 pt-6">
            <Eye className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <h4 className="mb-1 font-semibold text-primary">核心意象</h4>
              <p className="text-sm leading-relaxed">{aiData.coreImage}</p>
            </div>
          </CardContent>
        </Card>
      )
    case "senseMap":
      if (!aiData.senseMap?.length) return null
      return (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><MapIcon className="h-4 w-4 text-indigo-500" />词义图谱</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {aiData.senseMap.map((sense, index) => (
                <div key={`${sense.meaning}-${index}`} className="rounded-md border bg-muted/50 p-3">
                  <div className="mb-1 text-sm font-medium">{sense.meaning}</div>
                  <div className="text-xs text-muted-foreground">{sense.usage}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )
    case "collocations":
      if (!aiData.collocations?.length) return null
      return (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><Link2 className="h-4 w-4 text-orange-500" />地道搭配</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {aiData.collocations.map((collocation, index) => <Badge key={`${collocation}-${index}`} className="px-3 py-1.5 font-normal">{collocation}</Badge>)}
            </div>
          </CardContent>
        </Card>
      )
    case "synonymBoundaries":
      if (!aiData.synonymBoundaries?.length) return null
      return (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><Split className="h-4 w-4 text-teal-500" />近义词边界</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {aiData.synonymBoundaries.map((item, index) => (
                <div key={`${item.synonym}-${index}`} className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
                  <Badge className="w-fit shrink-0 border-teal-200 bg-teal-50/50 text-teal-700">vs {item.synonym}</Badge>
                  <p className="text-sm leading-relaxed text-muted-foreground">{item.difference}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )
    case "commonMistakes":
      if (!aiData.commonMistakes?.length) return null
      return (
        <Card className="border-red-200 bg-red-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-red-700"><AlertTriangle className="h-4 w-4" />常见误区</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {aiData.commonMistakes.map((mistake, index) => (
                <li key={`${mistake}-${index}`} className="flex items-start gap-2 text-sm leading-relaxed text-red-800/90">
                  <span className="mt-0.5 text-red-500">•</span>{mistake}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )
    case "personalizedExamples":
      if (!aiData.personalizedExamples?.length) return null
      return (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4 text-amber-500" />兴趣定制例句</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {aiData.personalizedExamples.map((example, index) => (
                <li key={`${example}-${index}`} className="border-l-2 border-amber-200 pl-4 text-sm leading-relaxed">{example}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )
    case "nuanceAnalysis":
      if (!aiData.nuanceAnalysis) return null
      return textSection(<BookOpen className="h-4 w-4 text-blue-500" />, "母语级语感辨析", aiData.nuanceAnalysis)
    case "etymologyStory":
      if (!aiData.etymologyStory) return null
      return textSection(<HistoryIcon className="h-4 w-4 text-emerald-500" />, "词源微故事", aiData.etymologyStory)
    case "mnemonicHook":
      if (!aiData.mnemonicHook) return null
      return (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-base"><Brain className="h-4 w-4 text-purple-500" />脑洞记忆法</CardTitle>
              {onRegenerateMnemonic && (
                <Button variant="ghost" size="sm" onClick={() => onRegenerateMnemonic(word)} disabled={generatingMnemonic}>
                  <RefreshCw className={`h-3.5 w-3.5 ${generatingMnemonic ? "animate-spin" : ""}`} />
                  换一个脑洞
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent><p className="whitespace-pre-wrap text-sm leading-relaxed">{aiData.mnemonicHook}</p></CardContent>
        </Card>
      )
    case "multiHookMemory":
      if (!aiData.multiHookMemory?.length) return null
      return (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><Lightbulb className="h-4 w-4 text-yellow-500" />多维记忆钩子</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {aiData.multiHookMemory.map((hook, index) => (
                <li key={`${hook}-${index}`} className="flex items-start gap-2 text-sm leading-relaxed"><span className="mt-0.5 text-yellow-500">💡</span>{hook}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )
    case "activeRecall":
      if (!aiData.activeRecall) return null
      return (
        <Card className="border-slate-200 bg-slate-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-slate-700"><HelpCircle className="h-4 w-4" />主动回想</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-800">{aiData.activeRecall.question}</p>
              <details className="group">
                <summary className="cursor-pointer select-none text-xs text-slate-500 transition-colors hover:text-slate-700">点击查看答案</summary>
                <div className="mt-2 rounded-md border border-slate-100 bg-background p-3 text-sm text-slate-600">{aiData.activeRecall.answer}</div>
              </details>
            </div>
          </CardContent>
        </Card>
      )
    case "practiceTask":
      if (!aiData.practiceTask) return null
      return (
        <Card className="border-blue-100 bg-blue-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-blue-700"><PenTool className="h-4 w-4" />实践任务</CardTitle>
          </CardHeader>
          <CardContent><p className="text-sm leading-relaxed text-blue-900/80">{aiData.practiceTask}</p></CardContent>
        </Card>
      )
    default:
      return null
  }
}

export function WordImagePanel({
  word,
  imageData,
  imageMode,
  generatingImage,
  onGenerate,
}: WordImagePanelProps) {
  const imageSrc = normalizeImageSrc(imageData)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><ImageIcon className="h-4 w-4 text-pink-500" />AI 视觉辅助</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!imageSrc && !generatingImage && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => onGenerate(word, "mood")}><ImageIcon className="h-3.5 w-3.5" />生成意境图</Button>
            <Button variant="outline" size="sm" onClick={() => onGenerate(word, "meme")}><Sparkles className="h-3.5 w-3.5" />生成梗图</Button>
          </div>
        )}
        {generatingImage && <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />正在生成图片...</div>}
        {imageSrc && (
          <div className="space-y-2">
            <Image src={imageSrc} alt={`${word} ${imageMode === "mood" ? "意境图" : "梗图"}`} width={512} height={512} unoptimized className="mx-auto w-full max-w-md rounded-lg border" />
            <div className="flex justify-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => onGenerate(word, "mood")}><RefreshCw className="h-3.5 w-3.5" />换意境图</Button>
              <Button variant="ghost" size="sm" onClick={() => onGenerate(word, "meme")}><RefreshCw className="h-3.5 w-3.5" />换梗图</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function textSection(icon: React.ReactNode, title: string, body: string) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">{icon}{title}</CardTitle>
      </CardHeader>
      <CardContent><p className="whitespace-pre-wrap text-sm leading-relaxed">{body}</p></CardContent>
    </Card>
  )
}

function normalizeImageSrc(imageData: string | null) {
  if (!imageData) return null
  if (imageData.startsWith("data:") || imageData.startsWith("http://") || imageData.startsWith("https://")) {
    return imageData
  }
  return `data:image/png;base64,${imageData}`
}
