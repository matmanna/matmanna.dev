const HEATMAP_ORIGIN = "https://heatmap.shymike.dev";
const CACHE_TTL = 86400; // 24 hours

async function fetchHeatmap(theme) {
  const target = `${HEATMAP_ORIGIN}?id=U07VA44DNBA&timezone=America%2FNew_York&theme=${theme}&format=png`;
  const response = await fetch(target);
  return new Response(response.body, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": `public, max-age=${CACHE_TTL}, s-maxage=${CACHE_TTL}`,
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export default {
  async scheduled(event, env, ctx) {
    const cache = caches.default;
    for (const theme of ["light", "dark"]) {
      const url = `https://heatmap.matmanna.dev/${theme}`;
      const response = await fetchHeatmap(theme);
      ctx.waitUntil(cache.put(new Request(url), response));
    }
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const theme = url.pathname.replace("/", "") || "light";
    if (!["light", "dark"].includes(theme)) {
      return new Response("Not found", { status: 404 });
    }

    // Allow cache bypass with ?refresh=1
    const skipCache = url.searchParams.get("refresh") === "1";

    const cache = caches.default;
    const cacheKey = new Request(request.url.split("?")[0], request);

    if (!skipCache) {
      const cached = await cache.match(cacheKey);
      if (cached) return cached;
    }

    const response = await fetchHeatmap(theme);
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  },
};
