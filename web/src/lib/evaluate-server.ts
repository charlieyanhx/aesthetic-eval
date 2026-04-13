import { saveEvaluation } from "./db";
import fs from "fs";
import path from "path";
import os from "os";

export async function evaluateTarget(
  target: string,
  mode: "static" | "browser" = "static"
) {
  const { evaluate } = await import("aesthetic-eval");
  const result = await evaluate(target, { mode });
  const entry = saveEvaluation(
    target,
    mode,
    result.score,
    result.grade,
    result
  );
  return { id: entry.id, result };
}

export async function evaluateUploadedFiles(
  files: { name: string; content: Buffer }[]
) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ae-upload-"));
  try {
    for (const file of files) {
      const filePath = path.join(tmpDir, file.name);
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, file.content);
    }
    return await evaluateTarget(tmpDir, "static");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
