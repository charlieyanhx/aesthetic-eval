"use client";
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload, Globe } from "lucide-react";

export function EvalForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<"static" | "browser">("static");
  const [tab, setTab] = useState<"url" | "upload">("url");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const normalizeUrl = (input: string): string => {
    let u = input.trim();
    if (!u) return u;
    // If it looks like a domain (has a dot, no spaces, no protocol), add https://
    if (!u.startsWith("http://") && !u.startsWith("https://") && u.includes(".") && !u.includes(" ")) {
      u = "https://" + u;
    }
    return u;
  };

  const evaluateUrl = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    const target = normalizeUrl(url);
    try {
      const res = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: target, mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      router.push(`/results/${data.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Evaluation failed");
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = useCallback(
    async (files: FileList) => {
      setLoading(true);
      setError("");
      try {
        const formData = new FormData();
        for (let i = 0; i < files.length; i++) {
          formData.append("files", files[i]);
        }
        const res = await fetch("/api/evaluate", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed");
        router.push(`/results/${data.id}`);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setLoading(false);
      }
    },
    [router]
  );

  return (
    <div className="w-full max-w-xl mx-auto">
      <div className="flex gap-1 mb-4 bg-neutral-100 dark:bg-neutral-900 rounded-lg p-1">
        <button
          onClick={() => setTab("url")}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            tab === "url"
              ? "bg-white dark:bg-neutral-800 shadow-sm"
              : "text-neutral-500"
          }`}
        >
          <Globe size={16} /> URL
        </button>
        <button
          onClick={() => setTab("upload")}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            tab === "upload"
              ? "bg-white dark:bg-neutral-800 shadow-sm"
              : "text-neutral-500"
          }`}
        >
          <Upload size={16} /> Upload Files
        </button>
      </div>

      {tab === "url" ? (
        <div>
          <div className="flex gap-2">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && evaluateUrl()}
              placeholder="example.com"
              className="flex-1 px-4 py-3 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              disabled={loading}
            />
            <button
              onClick={evaluateUrl}
              disabled={loading || !url.trim()}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-neutral-300 dark:disabled:bg-neutral-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              {loading ? "Evaluating..." : "Evaluate"}
            </button>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <label className="text-xs text-neutral-500">Mode:</label>
            <button
              onClick={() => setMode("static")}
              className={`text-xs px-2 py-1 rounded ${
                mode === "static"
                  ? "bg-neutral-800 text-white dark:bg-neutral-200 dark:text-black"
                  : "text-neutral-500"
              }`}
            >
              Static
            </button>
            <button
              onClick={() => setMode("browser")}
              className={`text-xs px-2 py-1 rounded ${
                mode === "browser"
                  ? "bg-neutral-800 text-white dark:bg-neutral-200 dark:text-black"
                  : "text-neutral-500"
              }`}
            >
              Browser
            </button>
          </div>
        </div>
      ) : (
        <div
          className="border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg p-8 text-center hover:border-emerald-500/50 transition-colors cursor-pointer"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files.length) handleUpload(e.dataTransfer.files);
          }}
          onClick={() => {
            const input = document.createElement("input");
            input.type = "file";
            input.multiple = true;
            input.accept = ".html,.htm,.css";
            input.onchange = () => {
              if (input.files?.length) handleUpload(input.files);
            };
            input.click();
          }}
        >
          {loading ? (
            <Loader2 size={32} className="animate-spin mx-auto text-emerald-500" />
          ) : (
            <>
              <Upload size={32} className="mx-auto text-neutral-400 mb-3" />
              <p className="text-sm text-neutral-500">
                Drop HTML & CSS files here, or click to browse
              </p>
              <p className="text-xs text-neutral-400 mt-1">
                .html, .htm, .css files
              </p>
            </>
          )}
        </div>
      )}

      {error && (
        <div className="mt-3 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}
