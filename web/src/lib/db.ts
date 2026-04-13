import fs from "fs";
import path from "path";

export interface StoredEvaluation {
  id: string;
  target: string;
  mode: string;
  score: number;
  grade: string;
  result: unknown;
  createdAt: string;
}

interface DB {
  evaluations: StoredEvaluation[];
}

const DB_PATH = path.join(process.cwd(), "data", "evaluations.json");

function ensureDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function read(): DB {
  ensureDir();
  if (!fs.existsSync(DB_PATH)) return { evaluations: [] };
  return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
}

function write(db: DB) {
  ensureDir();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

let counter = 0;
function genId(): string {
  return `ev_${Date.now()}_${++counter}`;
}

export function saveEvaluation(
  target: string,
  mode: string,
  score: number,
  grade: string,
  result: unknown
): StoredEvaluation {
  const db = read();
  const entry: StoredEvaluation = {
    id: genId(),
    target,
    mode,
    score,
    grade,
    result,
    createdAt: new Date().toISOString(),
  };
  db.evaluations.unshift(entry);
  write(db);
  return entry;
}

export function getEvaluation(id: string): StoredEvaluation | undefined {
  return read().evaluations.find((e) => e.id === id);
}

export function listEvaluations(
  target?: string,
  limit = 50
): StoredEvaluation[] {
  let evals = read().evaluations;
  if (target) {
    const q = target.toLowerCase();
    evals = evals.filter((e) => e.target.toLowerCase().includes(q));
  }
  return evals.slice(0, limit);
}

export function deleteEvaluation(id: string): boolean {
  const db = read();
  const before = db.evaluations.length;
  db.evaluations = db.evaluations.filter((e) => e.id !== id);
  if (db.evaluations.length < before) {
    write(db);
    return true;
  }
  return false;
}
