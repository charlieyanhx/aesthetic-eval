"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ScoreBadge } from "@/components/score-badge";
import { SingleRadarChart } from "@/components/radar-chart";
import { CategoryCard } from "@/components/category-card";
import { SitePreview } from "@/components/site-preview";
import { formatDate } from "@/lib/utils";
import {
  Loader2,
  ExternalLink,
  Eye,
  EyeOff,
  RefreshCw,
  GitCompare,
} from "lucide-react";

interface GuardResult {
  guardId: string;
  passed: boolean;
  penalty: number;
  value: unknown;
  detail?: string;
  skipped?: boolean;
}

interface CategoryResult {
  id: string;
  name: string;
  score: number;
  weight: number;
  guardResults: GuardResult[];
  recommendations: string[];
}

interface EvalData {
  id: string;
  target: string;
  mode: string;
  createdAt: string;
  result: {
    score: number;
    grade: string;
    categories: CategoryResult[];
    generatedAt: string;
  };
}

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<EvalData | null>(null);
  const [error, setError] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    fetch(`/api/history/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [id]);

  const isUrl = data?.target.startsWith("http");

  const reEvaluate = async () => {
    if (!data || !isUrl) return;
    setReloading(true);
    try {
      const res = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: data.target, mode: data.mode }),
      });
      const result = await res.json();
      if (res.ok) router.push(`/results/${result.id}`);
    } finally {
      setReloading(false);
    }
  };

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-16 text-center">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-16 flex justify-center">
        <Loader2 size={32} className="animate-spin text-neutral-400" />
      </div>
    );
  }

  const result = data.result;
  const categories = result.categories;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
        <div className="min-w-0">
          <h1 className="text-xl font-bold truncate">{data.target}</h1>
          <p className="text-sm text-neutral-500">
            {formatDate(data.createdAt)} &middot; {data.mode} mode
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {isUrl && (
            <>
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-neutral-300 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
              >
                {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
                {showPreview ? "Hide Preview" : "Preview"}
              </button>
              <a
                href={data.target}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-neutral-300 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
              >
                <ExternalLink size={14} /> Open Site
              </a>
            </>
          )}
          <button
            onClick={reEvaluate}
            disabled={reloading || !isUrl}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-neutral-300 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={reloading ? "animate-spin" : ""} />
            Re-evaluate
          </button>
          <button
            onClick={() =>
              router.push(
                `/compare?prefill=${encodeURIComponent(data.target)}`
              )
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
          >
            <GitCompare size={14} /> Compare
          </button>
        </div>
      </div>

      {/* Site Preview */}
      {showPreview && isUrl && (
        <SitePreview url={data.target} />
      )}

      {/* Score + Radar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <div className="flex flex-col items-center justify-center p-8 border border-neutral-200 dark:border-neutral-800 rounded-lg bg-white dark:bg-neutral-950">
          <ScoreBadge score={result.score} grade={result.grade} size="lg" />
          <p className="mt-4 text-sm text-neutral-500">Overall Score</p>
        </div>
        <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 bg-white dark:bg-neutral-950">
          <h2 className="text-sm font-medium text-neutral-500 mb-2">
            Category Breakdown
          </h2>
          <SingleRadarChart
            categories={categories.map((c) => ({
              id: c.id,
              score: c.score,
            }))}
          />
        </div>
      </div>

      {/* Category Cards */}
      <h2 className="text-sm font-medium text-neutral-500 mb-4">
        Detailed Results
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {categories.map((cat) => (
          <CategoryCard key={cat.id} category={cat} />
        ))}
      </div>
    </div>
  );
}
