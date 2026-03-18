"use client"

import { Button } from "@/components/ui/button"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body>
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center space-y-4">
            <h2 className="text-xl font-semibold">出了点问题</h2>
            <p className="text-muted-foreground">{error.message}</p>
            <Button onClick={reset}>重试</Button>
          </div>
        </div>
      </body>
    </html>
  )
}
