import Link from "next/link"
import { BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="text-center py-20">
      <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-30" />
      <h2 className="text-xl font-semibold mb-2">页面不存在</h2>
      <p className="text-muted-foreground mb-6">你访问的页面找不到了</p>
      <Link href="/">
        <Button>回到首页</Button>
      </Link>
    </div>
  )
}
