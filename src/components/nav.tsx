"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BookOpen, Dumbbell, RotateCcw, Settings, BookmarkCheck } from "lucide-react"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/", label: "查词", icon: BookOpen },
  { href: "/vocabulary", label: "生词本", icon: BookmarkCheck },
  { href: "/review", label: "复习", icon: RotateCcw },
  { href: "/practice", label: "练习", icon: Dumbbell },
  { href: "/settings", label: "设置", icon: Settings },
]

export function Nav() {
  const pathname = usePathname()

  return (
    <nav className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-4xl items-center gap-0 overflow-x-auto px-2 sm:gap-1 sm:px-4">
        <Link href="/" className="mr-2 shrink-0 text-base font-bold tracking-tight sm:mr-4 sm:text-lg">
          AI 词典
        </Link>
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors sm:px-3",
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
