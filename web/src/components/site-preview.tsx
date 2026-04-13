"use client";
import { useState } from "react";
import { ExternalLink, ImageOff, Loader2 } from "lucide-react";

export function SitePreview({ url }: { url: string }) {
  const [loading, setLoading] = useState(true);
  const [proxyFailed, setProxyFailed] = useState(false);
  const [screenshotLoaded, setScreenshotLoaded] = useState(false);
  const [screenshotFailed, setScreenshotFailed] = useState(false);

  // Proxy the site through our API to bypass X-Frame-Options
  const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
  const screenshotUrl = `/api/screenshot?url=${encodeURIComponent(url)}`;

  return (
    <div className="mb-8 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden bg-white dark:bg-neutral-950">
      {/* Browser chrome bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-400" />
          <div className="w-3 h-3 rounded-full bg-yellow-400" />
          <div className="w-3 h-3 rounded-full bg-green-400" />
        </div>
        <span className="text-xs text-neutral-500 truncate flex-1">{url}</span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-neutral-400 hover:text-foreground"
        >
          <ExternalLink size={14} />
        </a>
      </div>

      {/* Content: proxy iframe → screenshot → fallback */}
      {!proxyFailed ? (
        <div className="relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-neutral-950 z-10">
              <Loader2 size={24} className="animate-spin text-neutral-400 mr-2" />
              <span className="text-sm text-neutral-400">Loading preview...</span>
            </div>
          )}
          <iframe
            src={proxyUrl}
            title="Site preview"
            className="w-full h-[500px] border-0"
            sandbox="allow-scripts allow-same-origin allow-popups"
            onLoad={() => setLoading(false)}
            onError={() => setProxyFailed(true)}
          />
        </div>
      ) : !screenshotFailed ? (
        <div className="relative">
          {!screenshotLoaded && (
            <div className="flex items-center justify-center h-[400px] text-neutral-400">
              <Loader2 size={24} className="animate-spin mr-2" />
              <span className="text-sm">Capturing screenshot...</span>
            </div>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={screenshotUrl}
            alt={`Screenshot of ${url}`}
            className={`w-full object-cover object-top ${screenshotLoaded ? "" : "hidden"}`}
            onLoad={() => setScreenshotLoaded(true)}
            onError={() => setScreenshotFailed(true)}
          />
          {screenshotLoaded && (
            <div className="absolute top-3 right-3 bg-black/60 text-white text-xs px-2 py-1 rounded">
              Screenshot
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-[300px] text-neutral-400">
          <ImageOff size={40} className="mb-3" />
          <p className="text-sm">Preview unavailable</p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 text-xs text-emerald-500 hover:underline flex items-center gap-1"
          >
            <ExternalLink size={12} /> Open in new tab
          </a>
        </div>
      )}
    </div>
  );
}
