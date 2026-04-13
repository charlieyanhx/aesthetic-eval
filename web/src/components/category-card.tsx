"use client";
import { categoryName, scoreBg, scoreColor } from "@/lib/utils";
import { GuardList } from "./guard-list";

interface CategoryData {
  id: string;
  name: string;
  score: number;
  weight: number;
  guardResults: {
    guardId: string;
    passed: boolean;
    penalty: number;
    value: unknown;
    detail?: string;
    skipped?: boolean;
  }[];
  recommendations: string[];
}

export function CategoryCard({ category }: { category: CategoryData }) {
  const pct = Math.round(category.weight * 100);

  return (
    <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 bg-white dark:bg-neutral-950">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-medium text-sm">
            {categoryName(category.id)}
          </h3>
          <span className="text-xs text-neutral-400">{pct}% weight</span>
        </div>
        <span className={`text-2xl font-bold ${scoreColor(category.score)}`}>
          {category.score}
        </span>
      </div>
      <div className="w-full h-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden mb-3">
        <div
          className={`h-full rounded-full transition-all ${scoreBg(category.score)}`}
          style={{ width: `${category.score}%` }}
        />
      </div>
      <GuardList guards={category.guardResults} />
      {category.recommendations.length > 0 && (
        <div className="mt-3 space-y-1">
          {category.recommendations.map((rec, i) => (
            <p key={i} className="text-xs text-amber-600 dark:text-amber-400">
              {rec}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
