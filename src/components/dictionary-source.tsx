import type { DictionaryEntry } from "@/types/dictionary"

export function DictionarySource({ data }: { data: DictionaryEntry | null | undefined }) {
  if (!data?.source) return null
  const { source } = data

  return (
    <p className="text-xs text-muted-foreground">
      释义摘录并整理自{" "}
      <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
        {source.name} 贡献者
      </a>
      {source.license && (
        <>
          {" · "}
          <a href={source.license.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
            {source.license.name}
          </a>
        </>
      )}
    </p>
  )
}
