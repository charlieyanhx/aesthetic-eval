"use client";
import {
  RadarChart as ReRadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { shortCategoryName } from "@/lib/utils";

interface CategoryScore {
  id: string;
  score: number;
}

interface DataSet {
  label: string;
  categories: CategoryScore[];
  color: string;
}

const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444"];

export function RadarChartView({ datasets }: { datasets: DataSet[] }) {
  if (datasets.length === 0) return null;

  const categories = datasets[0].categories;
  const data = categories.map((cat) => {
    const point: Record<string, unknown> = {
      category: shortCategoryName(cat.id),
      fullMark: 100,
    };
    datasets.forEach((ds) => {
      const match = ds.categories.find((c) => c.id === cat.id);
      point[ds.label] = match?.score ?? 0;
    });
    return point;
  });

  return (
    <ResponsiveContainer width="100%" height={350}>
      <ReRadarChart data={data}>
        <PolarGrid stroke="#374151" />
        <PolarAngleAxis dataKey="category" tick={{ fontSize: 12 }} />
        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10 }} />
        {datasets.map((ds, i) => (
          <Radar
            key={ds.label}
            name={ds.label}
            dataKey={ds.label}
            stroke={ds.color || COLORS[i]}
            fill={ds.color || COLORS[i]}
            fillOpacity={0.15}
            strokeWidth={2}
          />
        ))}
        {datasets.length > 1 && <Legend />}
      </ReRadarChart>
    </ResponsiveContainer>
  );
}

export function SingleRadarChart({
  categories,
}: {
  categories: CategoryScore[];
}) {
  return (
    <RadarChartView
      datasets={[{ label: "Score", categories, color: "#10b981" }]}
    />
  );
}
