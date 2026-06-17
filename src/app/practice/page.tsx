import Link from "next/link"
import { BookOpenText, Drama, MessagesSquare } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const practiceItems = [
  {
    href: "/practice/story",
    title: "串词故事",
    description: "选择多个单词生成连贯故事，把词义串成可记忆的情节。",
    icon: BookOpenText,
  },
  {
    href: "/practice/roleplay",
    title: "实战对话",
    description: "进入真实语境，用目标词完成一段自然英文对话。",
    icon: MessagesSquare,
  },
  {
    href: "/practice/scene",
    title: "场景表达",
    description: "输入中文场景，获得常用英文表达和示例对话。",
    icon: Drama,
  },
]

export default function PracticePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">练习</h1>
        <p className="mt-1 text-sm text-muted-foreground">把查到的词放进故事、对话和场景里真正用起来。</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {practiceItems.map(({ href, title, description, icon: Icon }) => (
          <Link key={href} href={href} className="group">
            <Card className="h-full transition-colors group-hover:border-primary group-hover:bg-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className="h-4 w-4 text-primary" />
                  {title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
