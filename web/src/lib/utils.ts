import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function gradeColor(grade: string): string {
  if (grade.startsWith("A")) return "text-emerald-500";
  if (grade === "B") return "text-blue-500";
  if (grade === "C") return "text-yellow-500";
  if (grade === "D") return "text-orange-500";
  return "text-red-500";
}

export function gradeBg(grade: string): string {
  if (grade.startsWith("A")) return "bg-emerald-500/10 border-emerald-500/30";
  if (grade === "B") return "bg-blue-500/10 border-blue-500/30";
  if (grade === "C") return "bg-yellow-500/10 border-yellow-500/30";
  if (grade === "D") return "bg-orange-500/10 border-orange-500/30";
  return "bg-red-500/10 border-red-500/30";
}

export function scoreColor(score: number): string {
  if (score >= 90) return "text-emerald-500";
  if (score >= 80) return "text-blue-500";
  if (score >= 70) return "text-yellow-500";
  if (score >= 60) return "text-orange-500";
  return "text-red-500";
}

export function scoreBg(score: number): string {
  if (score >= 90) return "bg-emerald-500";
  if (score >= 80) return "bg-blue-500";
  if (score >= 70) return "bg-yellow-500";
  if (score >= 60) return "bg-orange-500";
  return "bg-red-500";
}

const CATEGORY_LABELS: Record<string, string> = {
  "color-contrast": "Color",
  typography: "Type",
  spacing: "Space",
  layout: "Layout",
  imagery: "Image",
  accessibility: "A11y",
  performance: "Perf",
  animation: "Motion",
  "cross-browser": "Compat",
  "text-wrapping": "Text",
};

export function shortCategoryName(id: string): string {
  return CATEGORY_LABELS[id] || id;
}

const CATEGORY_NAMES: Record<string, string> = {
  "color-contrast": "Color & Contrast",
  typography: "Typography",
  spacing: "Spacing",
  layout: "Layout & Structure",
  imagery: "Imagery",
  accessibility: "Accessibility",
  performance: "Performance",
  animation: "Animation & Motion",
  "cross-browser": "Cross-Browser",
  "text-wrapping": "Text Wrapping",
};

export function categoryName(id: string): string {
  return CATEGORY_NAMES[id] || id;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
