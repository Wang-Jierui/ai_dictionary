"use client"

import { useEffect, useRef, useState } from "react"
import { ExternalLink, Volume2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { DictionaryEntry, DictionaryPhonetic } from "@/types/dictionary"

export function WordPronunciation({ data, fallbackPhonetic }: {
  data?: DictionaryEntry | null
  fallbackPhonetic?: string
}) {
  const player = useRef<HTMLAudioElement | null>(null)
  const [failedAudio, setFailedAudio] = useState<string | null>(null)
  const texts = [...new Set([
    data?.phonetic ?? fallbackPhonetic,
    ...(data?.phonetics ?? []).map(item => item.text),
  ].filter((text): text is string => Boolean(text)))]
  const recordings = (data?.phonetics ?? []).filter((item, index, items) =>
    item.audio && items.findIndex(other => other.audio === item.audio) === index)

  useEffect(() => () => {
    player.current?.pause()
    player.current = null
  }, [data?.word])

  if (texts.length === 0 && recordings.length === 0) return null

  const playAudio = async (recording: DictionaryPhonetic) => {
    player.current?.pause()
    const audio = new Audio()
    player.current = audio
    setFailedAudio(null)
    for (const url of [recording.audio!, ...(recording.audioAlternatives ?? [])]) {
      if (player.current !== audio) return
      audio.src = url.startsWith("//") ? `https:${url}` : url
      try {
        await audio.play()
        return
      } catch {
        // Try another format of the same recording if this source is unavailable.
      }
    }
    if (player.current === audio) setFailedAudio(recording.audio!)
  }

  const renderRecording = (item: DictionaryPhonetic, index: number) => (
    <span key={item.audio} className="inline-flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-1.5 text-xs"
        title={`播放${item.label ? ` ${item.label}` : ""}发音 ${index + 1}`}
        aria-label={`播放${item.label ? ` ${item.label}` : ""}发音 ${index + 1}`}
        onClick={() => { void playAudio(item) }}
      >
        <Volume2 className="h-4 w-4 shrink-0" />
        <span className="max-w-40 truncate">{item.label || `发音 ${index + 1}`}</span>
      </Button>
      {item.sourceUrl && (
        <a
          href={item.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="音频来源及许可"
          aria-label={`发音 ${index + 1} 的来源及许可`}
          className="rounded-sm p-1 hover:text-foreground focus-visible:outline-2"
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </span>
  )

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
      {texts[0] && <span className="font-mono break-all">{texts[0]}</span>}
      {recordings[0] && renderRecording(recordings[0], 0)}
      {(texts.length > 1 || recordings.length > 1) && (
        <details className="basis-full">
          <summary className="w-fit cursor-pointer text-xs">更多发音</summary>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            {texts.slice(1).map(text => <span key={text} className="font-mono break-all">{text}</span>)}
            {recordings.slice(1).map((item, index) => renderRecording(item, index + 1))}
          </div>
        </details>
      )}
      {recordings.some(item => item.audio === failedAudio) && (
        <span role="status" className="basis-full text-xs text-amber-600">发音播放失败，请稍后重试。</span>
      )}
    </div>
  )
}
