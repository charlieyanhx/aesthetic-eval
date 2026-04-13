import { getEvaluation } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const evaluation = getEvaluation(id);
  if (!evaluation) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json(evaluation);
}
