"use client";
import { gradeColor, gradeBg } from "@/lib/utils";

export function ScoreBadge({
  score,
  grade,
  size = "lg",
}: {
  score: number;
  grade: string;
  size?: "sm" | "lg";
}) {
  const dims = size === "lg" ? "w-36 h-36" : "w-20 h-20";
  const textSize = size === "lg" ? "text-4xl" : "text-xl";
  const gradeSize = size === "lg" ? "text-sm" : "text-xs";
  const radius = size === "lg" ? 58 : 32;
  const stroke = size === "lg" ? 6 : 4;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const viewBox = size === "lg" ? "0 0 144 144" : "0 0 80 80";
  const center = size === "lg" ? 72 : 40;

  return (
    <div
      className={`relative ${dims} flex items-center justify-center rounded-full border ${gradeBg(grade)}`}
    >
      <svg className="absolute inset-0" viewBox={viewBox}>
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-neutral-200 dark:text-neutral-700"
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
          className={gradeColor(grade)}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </svg>
      <div className="text-center z-10">
        <div className={`${textSize} font-bold ${gradeColor(grade)}`}>
          {score}
        </div>
        <div className={`${gradeSize} font-medium text-neutral-500`}>
          {grade}
        </div>
      </div>
    </div>
  );
}
