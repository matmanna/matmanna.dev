const MAPBOX_API = "https://api.mapbox.com";
// Map styles as "owner/style-id". Defaults are Mapbox's colourful ready-made styles;
// set STYLE_LIGHT / STYLE_DARK (see location/style) to use the site-palette cartoon styles
const STYLES = { light: "mapbox/streets-v12", dark: "mapbox/navigation-night-v1" };
// Bump when the rendered image changes (zoom, overlays) so edge-cached maps are regenerated
const RENDER_VERSION = 3;
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

// Regions shown as a whole instead of zooming to the city come from the WHOLE_REGIONS
// secret, a JSON object of region name -> [west, south, east, north]. Unset means city view.
// ?view=city always shows the city.
function wholeRegionBbox(env, region) {
  try {
    const bbox = JSON.parse(env.WHOLE_REGIONS || "{}")[region];
    return Array.isArray(bbox) && bbox.length === 4 && bbox.every(Number.isFinite) ? bbox : null;
  } catch {
    return null;
  }
}

function clamp(value, fallback, min, max) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
}

async function mapImage(request, env, ctx, theme, location) {
  const url = new URL(request.url);
  // ?style=plain serves the unthemed cartoon map (for places that can't match the site's colours,
  // like a GitHub README); it falls back to Mapbox's own styles until STYLE_*_PLAIN are set
  const plain = url.searchParams.get("style") === "plain";
  const custom = plain
    ? (theme === "dark" ? env.STYLE_DARK_PLAIN : env.STYLE_LIGHT_PLAIN)
    : (theme === "dark" ? env.STYLE_DARK : env.STYLE_LIGHT);
  const style = custom || STYLES[theme];
  const width = clamp(url.searchParams.get("w"), 742, 100, 1280);
  const height = clamp(url.searchParams.get("h"), 200, 100, 1280);
  const view = url.searchParams.get("view");
  const bbox = view === "city" ? null : wholeRegionBbox(env, location.region);
  const framing = bbox ? `%5B${bbox.join(",")}%5D` : `${location.lng},${location.lat},${ZOOM},0`;

  // Versioned by the last update, so a new location never serves a stale map
  const cache = caches.default;
  const cacheKey = new Request(`https://location.matmanna.dev/${theme}?w=${width}&h=${height}&s=${encodeURIComponent(style)}&f=${framing}&r=${RENDER_VERSION}&v=${location.updated}`);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const target = `${MAPBOX_API}/styles/v1/${style}/static/${framing}/${width}x${height}@2x?${bbox ? "padding=10&" : ""}attribution=false&logo=false&access_token=${env.MAPBOX_TOKEN}`;
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
      const { region, country, updated } = location;
      // In a whole-region area only the region is public, never the city
      const city = wholeRegionBbox(env, region) ? "" : location.city;
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
