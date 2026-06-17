import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

const DEFAULT_REVIEW_PLAN_ID = "default"
const DEFAULT_REVIEW_PLAN_NAME = "默认复习计划"

export async function GET() {
  await ensureDefaultReviewPlan()
  const plans = await prisma.reviewPlan.findMany({
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    include: { _count: { select: { words: true } } },
  })

  return NextResponse.json(plans.map(plan => ({
    id: plan.id,
    name: plan.name,
    isDefault: plan.isDefault,
    wordCount: plan._count.words,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  })))
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 })
  }

  if (!isRecord(body) || typeof body.name !== "string" || body.name.trim().length === 0) {
    return NextResponse.json({ error: "Missing name" }, { status: 400 })
  }

  await ensureDefaultReviewPlan()
  const plan = await prisma.reviewPlan.create({
    data: { name: body.name.trim(), isDefault: false },
    include: { _count: { select: { words: true } } },
  })

  return NextResponse.json({
    id: plan.id,
    name: plan.name,
    isDefault: plan.isDefault,
    wordCount: plan._count.words,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  }, { status: 201 })
}

async function ensureDefaultReviewPlan() {
  await prisma.reviewPlan.upsert({
    where: { id: DEFAULT_REVIEW_PLAN_ID },
    update: {},
    create: { id: DEFAULT_REVIEW_PLAN_ID, name: DEFAULT_REVIEW_PLAN_NAME, isDefault: true },
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
