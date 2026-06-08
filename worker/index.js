const HEATMAP_ORIGIN = "https://heatmap.shymike.dev";
const CACHE_TTL = 86400; // 24 hours

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const target = new URL(HEATMAP_ORIGIN + url.pathname + url.search);

    const cache = caches.default;
    const cacheKey = new Request(target.toString(), request);

    const cached = await cache.match(cacheKey);
    if (cached) {
      return cached;
    }

    const originResponse = await fetch(target.toString(), {
      headers: request.headers,
    });

    const response = new Response(originResponse.body, originResponse);
    response.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}, s-maxage=${CACHE_TTL}`);
    response.headers.set("Access-Control-Allow-Origin", "*");

    if (response.ok) {
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }

    return response;
  },
};
