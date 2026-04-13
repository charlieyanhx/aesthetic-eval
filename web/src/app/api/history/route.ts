import { NextRequest } from "next/server";
import { listEvaluations, deleteEvaluation } from "@/lib/db";

export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get("target") || undefined;
  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "50");
  const evals = listEvaluations(target, limit);
  const summary = evals.map(({ id, target, mode, score, grade, createdAt }) => ({
    id,
    target,
    mode,
    score,
    grade,
    createdAt,
  }));
  return Response.json(summary);
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const deleted = deleteEvaluation(id);
  if (!deleted) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true });
}
