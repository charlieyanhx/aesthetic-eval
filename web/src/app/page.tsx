import { EvalForm } from "@/components/eval-form";
import { RecentEvals } from "@/components/recent-evals";

export default function Home() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-16">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold tracking-tight mb-3">
          Website Design Quality Scorer
        </h1>
        <p className="text-neutral-500 text-lg max-w-2xl mx-auto">
          Score any website across 10 UI/UX dimensions with research-backed
          thresholds. Enter a URL or upload HTML files.
        </p>
      </div>

      <EvalForm />
      <RecentEvals />
    </div>
  );
}
