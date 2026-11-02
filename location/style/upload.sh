#!/usr/bin/env bash
# Uploads the cartoon styles to your Mapbox account and prints their IDs.
# Needs a SECRET token with the styles:write scope in MAPBOX_SECRET_TOKEN
# (create one at https://account.mapbox.com/access-tokens/, don't commit it).
set -euo pipefail
cd "$(dirname "$0")"

token="${MAPBOX_SECRET_TOKEN:?set MAPBOX_SECRET_TOKEN to a secret token with styles:write}"
user=$(curl -fsS "https://api.mapbox.com/tokens/v2?access_token=$token" | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"]["user"])')

for theme in light dark; do
  id=$(curl -fsS -X POST "https://api.mapbox.com/styles/v1/$user?access_token=$token" \
    -H "Content-Type: application/json" --data @"cartoon-$theme.json" |
    python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
  echo "STYLE_${theme^^}=$user/$id"
done
echo "Add these under [vars] in location/wrangler.toml, then run: wrangler deploy"
