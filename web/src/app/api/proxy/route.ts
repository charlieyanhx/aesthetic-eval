import { NextRequest } from "next/server";

export const maxDuration = 15;

/**
 * Proxy a website's HTML through our server to bypass X-Frame-Options.
 * Rewrites relative URLs to absolute so assets (CSS, images, JS) still load.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return new Response("url parameter required", { status: 400 });
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
    });

    if (!res.ok) {
      return new Response("Failed to fetch site", { status: 502 });
    }

    let html = await res.text();
    const origin = new URL(url).origin;

    // Add <base> tag so all relative URLs resolve to the original site
    html = html.replace(
      /(<head[^>]*>)/i,
      `$1<base href="${origin}/" />`
    );

    // Remove X-Frame-Options and CSP headers from the proxied response
    // Also disable any JS that might try to bust out of frames
    const framebustedScript = `
      <script>
        // Prevent frame-busting scripts
        if (window.top !== window.self) {
          Object.defineProperty(window, 'top', { get: function() { return window.self; } });
        }
      </script>
    `;
    html = html.replace(/(<head[^>]*>)/i, `$1${framebustedScript}`);

    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        // No X-Frame-Options or CSP — we want this to be embeddable
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch {
    return new Response("Failed to fetch site", { status: 502 });
  }
}
