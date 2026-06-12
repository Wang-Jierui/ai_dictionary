"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BookOpen, Settings, BookmarkCheck, Pen, Swords, Languages, ListPlus } from "lucide-react"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/", label: "查词", icon: BookOpen },
  { href: "/batch", label: "批量查词", icon: ListPlus },
  { href: "/vocabulary", label: "生词本", icon: BookmarkCheck },
  { href: "/story", label: "串词故事", icon: Pen },
  { href: "/roleplay", label: "实战对话", icon: Swords },
  { href: "/scene", label: "场景表达", icon: Languages },
  { href: "/settings", label: "设置", icon: Settings },
]

export function Nav() {
  const pathname = usePathname()

  return (
    <nav className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-4xl items-center gap-1 px-4 overflow-x-auto">
        <Link href="/" className="mr-4 shrink-0 text-lg font-bold tracking-tight">
          AI 词典
        </Link>
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                active
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
