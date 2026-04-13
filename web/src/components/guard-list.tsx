"use client";
import { useState } from "react";
import { ChevronDown, ChevronRight, Check, X, Minus } from "lucide-react";

interface Guard {
  guardId: string;
  passed: boolean;
  penalty: number;
  value: unknown;
  detail?: string;
  skipped?: boolean;
}

export function GuardList({ guards }: { guards: Guard[] }) {
  const [open, setOpen] = useState(false);
  const failed = guards.filter((g) => !g.passed && !g.skipped).length;

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs text-neutral-500 hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {guards.length} checks ({failed} failed)
      </button>
      {open && (
        <div className="mt-2 space-y-1">
          {guards.map((g) => (
            <div
              key={g.guardId}
              className="flex items-start gap-2 text-xs py-1 px-2 rounded hover:bg-neutral-50 dark:hover:bg-neutral-900"
            >
              {g.skipped ? (
                <Minus size={14} className="text-neutral-400 shrink-0 mt-0.5" />
              ) : g.passed ? (
                <Check
                  size={14}
                  className="text-emerald-500 shrink-0 mt-0.5"
                />
              ) : (
                <X size={14} className="text-red-500 shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <span className="font-medium">{formatGuardId(g.guardId)}</span>
                {!g.passed && !g.skipped && (
                  <span className="text-red-500 ml-1">-{g.penalty}</span>
                )}
                {g.detail && (
                  <p className="text-neutral-400 mt-0.5 break-words">
                    {g.detail}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatGuardId(id: string): string {
  return id
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
