# Repository Instructions

## Commands
- Use npm; `package-lock.json` is the lockfile of record.
- Local dev: `npm run dev`. Production-style build: `npm run build`. Serve a built app with `npm run start`.
- Lint is the only configured verification script: `npm run lint`. There is no repo test or typecheck script.
- Docker bootstrap is the documented full-stack path: `docker compose up -d --build`.
- Docker runs PostgreSQL as `ai-dict-db`, exposes it on host port `5433`, runs migrations in the `migrate` service with `npx prisma migrate deploy`, then starts the app.

## Project Shape
- This is a Next.js 16 App Router app with React 19, TypeScript, Tailwind CSS v4, shadcn/ui, lucide icons, Vercel AI SDK, Prisma 7, and PostgreSQL.
- User-facing routes are defined in `src/components/nav.tsx`: `/`, `/batch`, `/vocabulary`, `/story`, `/roleplay`, `/scene`, `/settings`. Update the nav when adding a page meant to be reachable.
- API route handlers live under `src/app/api`. AI endpoints are grouped under `src/app/api/ai/*`; settings/auth/vocabulary/dictionary have separate route directories.
- Shared logic belongs in `src/lib`: `ai.ts` selects task-specific OpenAI-compatible endpoints and builds prompts, `lookup-service.ts` owns lookup/cache/save flow, `prisma.ts` is the Prisma singleton, and `auth.ts` owns the user cookie.

## Prisma and Environment
- Prisma CLI reads `.env` through `prisma.config.ts`; `.env.example` documents `DATABASE_URL` and `ADMIN_PASSWORD`.
- `prisma/schema.prisma` generates the client to `src/generated/prisma`, which is gitignored. Import Prisma types/client from `@/generated/prisma/client`, not `@prisma/client`.
- Use the shared `prisma` export from `@/lib/prisma`; do not create ad-hoc Prisma clients in routes or components.
- Docker injects `DATABASE_URL=postgresql://postgres:postgres@db:5432/ai_dictionary`; local `.env.example` uses `localhost:5433` to match the compose port mapping.

## App-Specific Gotchas
- Lookup flow: `/api/ai/lookup` returns cached JSON from `Vocabulary` when possible; fresh lookups stream AI text, and the client parses/coerces streamed JSON in `src/app/page.tsx`.
- Batch flow differs by caller: `src/app/batch/page.tsx` parallelizes client-side requests and sends one word per `/api/ai/batch-lookup` call with `concurrency: 1`; the API route also supports multi-word worker-pool processing for direct callers.
- AI endpoint selection is per task. Logged-in users get `UserApiConfig.aiEndpoints`; anonymous users fall back to global `Settings.aiEndpoints`.
- Auth stores the username in the httpOnly `ai-dict-user` cookie. Admin APIs require the `x-admin-password` header to equal `ADMIN_PASSWORD`.
- `Settings` controls batch caps: `batchMaxWords` is clamped to 1-1000 and defaults to 50; `batchConcurrency` has minimum 1 and defaults to 3.

## Documentation Mismatches
- Prefer README's `docker compose up -d --build` over ARCHITECTURE's shorter `docker compose up -d` after code or dependency changes.
- `start.sh` exists, but the Docker runner starts with `node server.js` directly.
