import { NextRequest } from "next/server";
import { evaluateTarget } from "@/lib/evaluate-server";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const { urls, mode = "static" } = await request.json();
    if (!Array.isArray(urls) || urls.length < 2) {
      return Response.json(
        { error: "Provide at least 2 URLs" },
        { status: 400 }
      );
    }

    const results = [];
    for (const url of urls.slice(0, 4)) {
      const data = await evaluateTarget(url, mode);
      const r = data.result;
      results.push({ id: data.id, target: url, score: r.score, grade: r.grade, categories: r.categories });
    }
    return Response.json({ results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Comparison failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
