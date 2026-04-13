"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { TrendChart } from "@/components/trend-chart";
import { formatDate, gradeColor, scoreColor } from "@/lib/utils";
import { Search, Trash2 } from "lucide-react";

interface EvalSummary {
  id: string;
  target: string;
  mode: string;
  score: number;
  grade: string;
  createdAt: string;
}

export default function HistoryPage() {
  const [evals, setEvals] = useState<EvalSummary[]>([]);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (filter) params.set("target", filter);
    const res = await fetch(`/api/history?${params}`);
    setEvals(await res.json());
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const deleteEval = async (id: string) => {
    await fetch(`/api/history?id=${id}`, { method: "DELETE" });
    load();
  };

  // Group by target for trend chart
  const targets = new Map<string, EvalSummary[]>();
  for (const e of evals) {
    const key = e.target;
    if (!targets.has(key)) targets.set(key, []);
    targets.get(key)!.push(e);
  }
  const trendTarget =
    filter && targets.size === 1 ? [...targets.values()][0] : null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Evaluation History</h1>

      <div className="relative mb-6">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
        />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by URL..."
          className="w-full pl-10 pr-4 py-2.5 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
        />
      </div>

      {trendTarget && trendTarget.length >= 2 && (
        <div className="mb-8 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 bg-white dark:bg-neutral-950">
          <h2 className="text-sm font-medium text-neutral-500 mb-3">
            Score Trend
          </h2>
          <TrendChart
            data={[...trendTarget]
              .reverse()
              .map((e) => ({ date: e.createdAt, score: e.score }))}
          />
        </div>
      )}

      {evals.length === 0 ? (
        <p className="text-center text-neutral-500 py-12">
          No evaluations yet. Go evaluate a site!
        </p>
      ) : (
        <div className="space-y-2">
          {evals.map((e) => (
            <div
              key={e.id}
              className="flex items-center justify-between p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
            >
              <Link
                href={`/results/${e.id}`}
                className="flex-1 min-w-0 mr-4"
              >
                <p className="text-sm font-medium truncate">{e.target}</p>
                <p className="text-xs text-neutral-400">
                  {formatDate(e.createdAt)} &middot; {e.mode}
                </p>
              </Link>
              <div className="flex items-center gap-4 shrink-0">
                <span className={`text-sm font-mono ${scoreColor(e.score)}`}>
                  {e.score}
                </span>
                <span className={`text-sm font-bold ${gradeColor(e.grade)}`}>
                  {e.grade}
                </span>
                <button
                  onClick={() => deleteEval(e.id)}
                  className="p-1.5 text-neutral-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
