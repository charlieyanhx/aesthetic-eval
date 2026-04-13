import { NextRequest } from "next/server";
import { evaluateTarget, evaluateUploadedFiles } from "@/lib/evaluate-server";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const files: { name: string; content: Buffer }[] = [];
      for (const [, value] of formData.entries()) {
        if (value instanceof File) {
          const bytes = await value.arrayBuffer();
          files.push({ name: value.name, content: Buffer.from(bytes) });
        }
      }
      if (files.length === 0) {
        return Response.json({ error: "No files uploaded" }, { status: 400 });
      }
      const data = await evaluateUploadedFiles(files);
      return Response.json({ id: data.id, result: data.result });
    }

    const body = await request.json();
    const { url, mode = "static" } = body;
    if (!url || typeof url !== "string") {
      return Response.json({ error: "url is required" }, { status: 400 });
    }
    const data = await evaluateTarget(url, mode);
    return Response.json({ id: data.id, result: data.result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Evaluation failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
