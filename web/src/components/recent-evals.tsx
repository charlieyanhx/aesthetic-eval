"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDate, gradeColor } from "@/lib/utils";

interface EvalSummary {
  id: string;
  target: string;
  mode: string;
  score: number;
  grade: string;
  createdAt: string;
}

export function RecentEvals() {
  const [evals, setEvals] = useState<EvalSummary[]>([]);

  useEffect(() => {
    fetch("/api/history?limit=5")
      .then((r) => r.json())
      .then(setEvals)
      .catch(() => {});
  }, []);

  if (evals.length === 0) return null;

  return (
    <div className="mt-16">
      <h2 className="text-sm font-medium text-neutral-500 mb-4">
        Recent Evaluations
      </h2>
      <div className="space-y-2">
        {evals.map((e) => (
          <Link
            key={e.id}
            href={`/results/${e.id}`}
            className="flex items-center justify-between p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{e.target}</p>
              <p className="text-xs text-neutral-400">
                {formatDate(e.createdAt)} &middot; {e.mode}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-sm font-mono">{e.score}/100</span>
              <span className={`text-sm font-bold ${gradeColor(e.grade)}`}>
                {e.grade}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
