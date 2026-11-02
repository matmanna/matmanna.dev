const MAPBOX_API = "https://api.mapbox.com";
// Colourful, Apple Maps-like styles: green parks, blue water, soft roads
const STYLES = { light: "streets-v12", dark: "navigation-night-v1" };
// Bump when STYLES or ZOOM change so edge-cached maps are regenerated
const STYLE_VERSION = 2;
const ZOOM = 11;
const CORS = { "Access-Control-Allow-Origin": "*" };

// Only the city's centre is stored, never the exact coordinates sent by the widget
async function reverseGeocode(lat, lng, token) {
  const url = `${MAPBOX_API}/search/geocode/v6/reverse?longitude=${lng}&latitude=${lat}&types=place&access_token=${token}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`geocode failed: ${response.status}`);
  const feature = (await response.json()).features?.[0];
  if (!feature) throw new Error("no place found");
  const [placeLng, placeLat] = feature.geometry.coordinates;
  const context = feature.properties.context || {};
  return {
    city: feature.properties.name,
    region: context.region?.name || "",
    country: context.country?.name || "",
    lat: placeLat,
    lng: placeLng,
    updated: Date.now(),
  };
}

function clamp(value, fallback, min, max) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
}

async function mapImage(request, env, ctx, theme, location) {
  const url = new URL(request.url);
  const width = clamp(url.searchParams.get("w"), 742, 100, 1280);
  const height = clamp(url.searchParams.get("h"), 200, 100, 1280);

  // Versioned by the last update, so a new location never serves a stale map
  const cache = caches.default;
  const cacheKey = new Request(`https://location.matmanna.dev/${theme}?w=${width}&h=${height}&v=${location.updated}-${STYLE_VERSION}`);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const { lat, lng } = location;
  const target = `${MAPBOX_API}/styles/v1/mapbox/${STYLES[theme]}/static/pin-s+ef4444(${lng},${lat})/${lng},${lat},${ZOOM},0/${width}x${height}@2x?access_token=${env.MAPBOX_TOKEN}`;
  const upstream = await fetch(target);
  if (!upstream.ok) return new Response("Map unavailable", { status: 502 });

  const response = new Response(upstream.body, {
    headers: {
      "Content-Type": "image/png",
      // Browsers recheck every 10 minutes; the edge copy lives until the next update
      "Cache-Control": "public, max-age=600",
      ...CORS,
    },
  });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

async function update(request, env) {
  if (request.headers.get("Authorization") !== `Bearer ${env.UPDATE_TOKEN}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  // Without coordinates, fall back to Cloudflare's IP geolocation of the caller
  const lat = body.lat ?? parseFloat(request.cf?.latitude);
  const lng = body.lng ?? parseFloat(request.cf?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return new Response("lat and lng required", { status: 400 });
  }
  const location = await reverseGeocode(lat, lng, env.MAPBOX_TOKEN);
  await env.LOCATION.put("current", JSON.stringify(location));
  return Response.json(location);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/|\.png$/g, "");

    if (path === "update" && request.method === "POST") {
      return update(request, env);
    }

    const location = await env.LOCATION.get("current", "json");
    if (!location) return new Response("No location yet", { status: 404, headers: CORS });

    if (path === "json") {
      const { city, region, country, updated } = location;
      return Response.json(
        { city, region, country, updated },
        { headers: { "Cache-Control": "public, max-age=60", ...CORS } }
      );
    }
    if (path in STYLES) {
      return mapImage(request, env, ctx, path, location);
    }
    return new Response("Not found", { status: 404 });
  },
};
