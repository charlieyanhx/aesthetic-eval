"use client";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ScoreBadge } from "@/components/score-badge";
import { RadarChartView } from "@/components/radar-chart";
import { categoryName, scoreColor } from "@/lib/utils";
import { Loader2, Plus, X } from "lucide-react";

const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444"];

interface CompareResult {
  id: string;
  target: string;
  score: number;
  grade: string;
  categories: {
    id: string;
    name: string;
    score: number;
    weight: number;
  }[];
}

export default function ComparePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefill = searchParams.get("prefill") || "";
  const [urls, setUrls] = useState([prefill, ""]);
  const [mode, setMode] = useState<"static" | "browser">("static");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<CompareResult[]>([]);

  const addUrl = () => {
    if (urls.length < 4) setUrls([...urls, ""]);
  };
  const removeUrl = (i: number) => {
    if (urls.length > 2) setUrls(urls.filter((_, idx) => idx !== i));
  };
  const setUrl = (i: number, v: string) => {
    const next = [...urls];
    next[i] = v;
    setUrls(next);
  };

  const compare = async () => {
    const validUrls = urls.filter((u) => u.trim());
    if (validUrls.length < 2) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: validUrls, mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setResults(data.results);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Comparison failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Compare Sites</h1>

      <div className="space-y-3 mb-4">
        {urls.map((url, i) => (
          <div key={i} className="flex gap-2 items-center">
            <div
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: COLORS[i] }}
            />
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(i, e.target.value)}
              placeholder={`https://site-${i + 1}.com`}
              className="flex-1 px-4 py-2.5 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
            {urls.length > 2 && (
              <button
                onClick={() => removeUrl(i)}
                className="p-2 text-neutral-400 hover:text-red-500"
              >
                <X size={16} />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 mb-6">
        {urls.length < 4 && (
          <button
            onClick={addUrl}
            className="text-xs text-neutral-500 hover:text-foreground flex items-center gap-1"
          >
            <Plus size={14} /> Add site
          </button>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <label className="text-xs text-neutral-500">Mode:</label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as "static" | "browser")}
            className="text-xs px-2 py-1 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-900"
          >
            <option value="static">Static</option>
            <option value="browser">Browser</option>
          </select>
        </div>
        <button
          onClick={compare}
          disabled={loading || urls.filter((u) => u.trim()).length < 2}
          className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-neutral-300 dark:disabled:bg-neutral-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          {loading && <Loader2 size={14} className="animate-spin" />}
          {loading ? "Comparing..." : "Compare"}
        </button>
      </div>

      {error && (
        <div className="mb-6 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg text-sm text-red-600">
          {error}
        </div>
      )}

      {results.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {results.map((r, i) => (
              <button
                key={r.id}
                onClick={() => router.push(`/results/${r.id}`)}
                className="flex flex-col items-center p-4 border border-neutral-200 dark:border-neutral-800 rounded-lg bg-white dark:bg-neutral-950 hover:border-emerald-500/50 transition-colors"
              >
                <div
                  className="w-2 h-2 rounded-full mb-2"
                  style={{ backgroundColor: COLORS[i] }}
                />
                <ScoreBadge score={r.score} grade={r.grade} size="sm" />
                <p className="text-xs text-neutral-500 mt-2 truncate max-w-full">
                  {r.target.replace(/^https?:\/\//, "")}
                </p>
              </button>
            ))}
          </div>

          <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 bg-white dark:bg-neutral-950 mb-8">
            <RadarChartView
              datasets={results.map((r, i) => ({
                label: r.target.replace(/^https?:\/\//, "").split("/")[0],
                categories: r.categories.map((c) => ({
                  id: c.id,
                  score: c.score,
                })),
                color: COLORS[i],
              }))}
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800">
                  <th className="text-left py-2 pr-4 font-medium text-neutral-500">
                    Category
                  </th>
                  {results.map((r, i) => (
                    <th
                      key={r.id}
                      className="text-right py-2 px-3 font-medium"
                    >
                      <span
                        className="inline-block w-2 h-2 rounded-full mr-1"
                        style={{ backgroundColor: COLORS[i] }}
                      />
                      {r.target.replace(/^https?:\/\//, "").split("/")[0]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results[0].categories.map((cat) => {
                  const scores = results.map(
                    (r) => r.categories.find((c) => c.id === cat.id)?.score ?? 0
                  );
                  const maxScore = Math.max(...scores);
                  return (
                    <tr
                      key={cat.id}
                      className="border-b border-neutral-100 dark:border-neutral-900"
                    >
                      <td className="py-2 pr-4">{categoryName(cat.id)}</td>
                      {scores.map((s, i) => (
                        <td
                          key={results[i].id}
                          className={`text-right py-2 px-3 font-mono ${scoreColor(s)} ${
                            s === maxScore ? "font-bold" : ""
                          }`}
                        >
                          {s}
                        </td>
                      ))}
                    </tr>
                  );
                })}
                <tr className="font-bold">
                  <td className="py-2 pr-4">Overall</td>
                  {results.map((r) => (
                    <td
                      key={r.id}
                      className={`text-right py-2 px-3 font-mono ${scoreColor(r.score)}`}
                    >
                      {r.score}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
