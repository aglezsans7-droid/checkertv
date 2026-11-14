// Proxy CORS para IPTV Checker (Cloudflare Worker)
// Cambia esto por tu dominio de GitHub Pages (sin barra final). Déjalo [] para permitir todos.
const ALLOWED = ["https://TUUSUARIO.github.io"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, Content-Type",
};

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    const ref = request.headers.get("Origin") || request.headers.get("Referer") || "";
    if (ALLOWED.length && !ALLOWED.some((a) => ref.startsWith(a))) {
      return new Response("Forbidden", { status: 403, headers: CORS });
    }

    const self = new URL(request.url);
    const target = self.searchParams.get("url");
    if (!target || !/^https?:\/\//i.test(target)) {
      return new Response("Falta ?url=http(s)://...", { status: 400, headers: CORS });
    }
    const wrap = (u) => `${self.origin}/?url=${encodeURIComponent(u)}`;

    const headers = { "User-Agent": "VLC/3.0.20 LibVLC/3.0.20" };
    const range = request.headers.get("Range");
    if (range) headers["Range"] = range;

    let r;
    try {
      r = await fetch(target, { headers, redirect: "follow" });
    } catch (e) {
      return new Response("Error al conectar: " + e.message, { status: 502, headers: CORS });
    }

    const ct = r.headers.get("content-type") || "";
    const isM3U8 = /mpegurl/i.test(ct) || /\.m3u8(\?|$)/i.test(r.url);

    // Listas HLS: reescribimos las URLs internas para que también pasen por el proxy
    if (isM3U8) {
      const base = r.url;
      const text = await r.text();
      const out = text
        .split("\n")
        .map((line) => {
          const t = line.trim();
          if (!t) return line;
          if (t.startsWith("#")) {
            return line.replace(/URI="([^"]+)"/g, (m, u) => `URI="${wrap(new URL(u, base).href)}"`);
          }
          return wrap(new URL(t, base).href);
        })
        .join("\n");
      return new Response(out, {
        status: r.status,
        headers: { ...CORS, "Content-Type": "application/vnd.apple.mpegurl", "Cache-Control": "no-store" },
      });
    }

    // Resto (JSON de la API, vídeo mp4, segmentos .ts...): se pasa tal cual
    const h = new Headers(CORS);
    for (const k of ["content-type", "content-length", "content-range", "accept-ranges"]) {
      const v = r.headers.get(k);
      if (v) h.set(k, v);
    }
    return new Response(r.body, { status: r.status, headers: h });
  },
};
