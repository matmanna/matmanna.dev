#!/usr/bin/env python3
"""Rebuilds the four cartoon-*.json styles from Mapbox Streets v12:
colourful light/dark, and stone-light/stone-dark that use only the site's own Tailwind stone scale.

Flattens the map (one tone for green areas, only the main road network,
thick rounded roads, just town labels) and recolours every layer with the site's orange palette, thickens roads and drops
POI/shield icons that can't be recoloured. Needs a Mapbox token in MAPBOX_TOKEN
to download the base style: MAPBOX_TOKEN=pk... python3 generate.py
"""
import json, copy, os, re, sys, urllib.request

if not os.path.exists("streets.json"):
    url = "https://api.mapbox.com/styles/v1/mapbox/streets-v12?access_token=" + os.environ["MAPBOX_TOKEN"]
    urllib.request.urlretrieve(url, "streets.json")

PAL = {
 "light": dict(
  land="#fff4e6", grass="#cfe8b0", wood="#b4dc94", park="#bfe5a0", water="#9fd6f0", waterline="#9fd6f0",
  building="#f3dcc2", aero="#f4e3cf", pitch="#d4ecb8", hospital="#fbd9d3", school="#fde7c4", industrial="#f3e3d0", sand="#f9ebc8",
  minor="#ffffff", minor_c="#eed3b6", sec="#ffffff", sec_c="#e8c9a6", pri="#ffe0b8", pri_c="#f3a96b",
  mot="#fdba74", mot_c="#ea7a20", path="#f2d3b3", rail="#d9c3ae", pedestrian="#fdebd3",
  text="#5a2a12", halo="#fff4e6", wtext="#3b7fa6", boundary="#e1b894", ferry="#7fc4e8"),
 "dark": dict(
  land="#241812", grass="#2e3d2c", wood="#2a382a", park="#34503a", water="#25557a", waterline="#25557a",
  building="#3a271c", aero="#2e2019", pitch="#33503a", hospital="#4a2c2a", school="#3d2e1e", industrial="#2f221a", sand="#3d3320",
  minor="#4a3628", minor_c="#1a110c", sec="#5d4331", sec_c="#1a110c", pri="#a8501c", pri_c="#1a110c",
  mot="#ea580c", mot_c="#7c2d12", path="#5a4231", rail="#4a3a2e", pedestrian="#3a2a20",
  text="#ffedd5", halo="#241812", wtext="#7fb4d6", boundary="#5c4030", ferry="#3d6f94"),
 "stone-light": dict(
  land="#f5f5f4", grass="#e7e5e4", wood="#d6d3d1", park="#e7e5e4", water="#a8a29e", waterline="#a8a29e",
  building="#e7e5e4", aero="#e7e5e4", pitch="#d6d3d1", hospital="#e7e5e4", school="#e7e5e4", industrial="#e7e5e4", sand="#f5f5f4",
  minor="#fafaf9", minor_c="#d6d3d1", sec="#fafaf9", sec_c="#a8a29e", pri="#e7e5e4", pri_c="#78716c",
  mot="#a8a29e", mot_c="#57534e", path="#d6d3d1", rail="#a8a29e", pedestrian="#fafaf9",
  text="#292524", halo="#f5f5f4", wtext="#44403c", boundary="#a8a29e", ferry="#78716c"),
 "stone-dark": dict(
  land="#1c1917", grass="#292524", wood="#292524", park="#292524", water="#0c0a09", waterline="#0c0a09",
  building="#292524", aero="#292524", pitch="#44403c", hospital="#292524", school="#292524", industrial="#292524", sand="#1c1917",
  minor="#44403c", minor_c="#0c0a09", sec="#57534e", sec_c="#0c0a09", pri="#78716c", pri_c="#0c0a09",
  mot="#a8a29e", mot_c="#44403c", path="#44403c", rail="#44403c", pedestrian="#44403c",
  text="#e7e5e4", halo="#1c1917", wtext="#a8a29e", boundary="#57534e", ferry="#78716c"),
}

REMOVE = {"hillshade","water-depth","water-shadow","waterway-shadow","building-underground","poi-label","transit-label",
 "block-number-label","building-number-label","building-entrance","crosswalks","level-crossing","golf-hole-line","golf-hole-label",
 "turning-feature","turning-feature-outline","road-intersection","road-exit-shield","road-number-shield","path-pedestrian-label",
 "pitch-outline","land-structure-line","ferry-aerialway-label","aerialway","road-pedestrian-polygon-pattern","admin-0-boundary-disputed",
 "tunnel-oneway-arrow-blue","tunnel-oneway-arrow-white","road-oneway-arrow-blue","road-oneway-arrow-white","bridge-oneway-arrow-blue","bridge-oneway-arrow-white"}

# Cartoon simplification: keep only the road network you can read at city zoom, drop small
# labels, paths, rail, ferries, waterways and boundaries
DROP_RE = re.compile(r"^(road|bridge|tunnel)-(minor|street|path|steps|pedestrian|construction|rail|oneway)|^tunnel-|-oneway-|^ferry|^admin-|^aeroway|^waterway|^road-polygon|^road-pedestrian|^land-structure|^building|^golf|^natural-|^water-(line|point)-label$|^road-label$|^airport-label$|^settlement-subdivision-label$|^state-label$|^country-label$|^continent-label$|^block-")
KEEP_LABELS = {"settlement-major-label","settlement-minor-label"}

def scale(e, k):
    if isinstance(e,(int,float)): return round(e*k,3)
    if not isinstance(e,list) or not e: return e
    h=e[0]; e=list(e)
    if h=="interpolate" or h=="interpolate-hcl" or h=="interpolate-lab":
        for i in range(4,len(e),2): e[i]=scale(e[i],k)
    elif h=="step":
        e[2]=scale(e[2],k)
        for i in range(4,len(e),2): e[i]=scale(e[i],k)
    elif h=="match":
        for i in range(3,len(e)-1,2): e[i]=scale(e[i],k)
        e[-1]=scale(e[-1],k)
    elif h=="case":
        for i in range(2,len(e)-1,2): e[i]=scale(e[i],k)
        e[-1]=scale(e[-1],k)
    return e

def build(theme):
    p=PAL[theme]; s=json.load(open('streets.json'))
    out=[]
    for l in s['layers']:
        i=l['id']
        if i in REMOVE or (DROP_RE.search(i) and i not in KEEP_LABELS): continue
        l=copy.deepcopy(l); paint=l.setdefault('paint',{}); t=l['type']
        if i=="land": paint['background-color']=p['land']
        elif i=="landcover":
            paint['fill-color']=p['park']
            paint['fill-opacity']=1
        elif i=="national-park": paint['fill-color']=p['park']; paint['fill-opacity']=["interpolate",["linear"],["zoom"],5,0,6,1]
        elif i=="landuse":
            paint['fill-color']=["match",["get","class"],"park",p['park'],"pitch",p['park'],"golf_course",p['park'],"cemetery",p['park'],
              "wood",p['park'],"grass",p['park'],"scrub",p['park'],"agriculture",p['land'],p['land']]
            paint['fill-opacity']=["interpolate",["linear"],["zoom"],5,0,8,1]
        elif i=="waterway": paint['line-color']=p['waterline']
        elif i=="water": paint['fill-color']=p['water']
        elif i=="land-structure-polygon": paint['fill-color']=p['land']
        elif i=="aeroway-polygon": paint['fill-color']=p['aero']
        elif i=="aeroway-line": paint['line-color']=p['aero']
        elif i=="building": paint['fill-color']=p['building']; paint['fill-outline-color']=p['building']
        elif i=="road-polygon": paint['fill-color']=p['minor']; paint.pop('fill-outline-color',None)
        elif i=="road-pedestrian-polygon-fill": paint['fill-color']=p['pedestrian']
        elif i.startswith(("ferry",)) and t=="line": paint['line-color']=p['ferry']
        elif i in("admin-1-boundary","admin-0-boundary"): paint['line-color']=p['boundary']
        elif i in("admin-1-boundary-bg","admin-0-boundary-bg"): paint['line-color']=p['land']
        elif t=="line" and re.match(r'^(road|bridge|tunnel)-',i):
            casing=i.endswith("case") or i.endswith("-bg") or i.endswith("-2-case")
            if "motorway" in i or "trunk" in i or "major-link" in i: c,cc=p['mot'],p['mot_c']
            elif "primary" in i: c,cc=p['pri'],p['pri_c']
            elif "secondary" in i or "tertiary" in i: c,cc=p['sec'],p['sec_c']
            elif "rail" in i: c,cc=p['rail'],p['rail']
            elif any(x in i for x in("path","steps","pedestrian","construction")): c,cc=p['path'],p['path']
            else: c,cc=p['minor'],p['minor_c']
            paint['line-color']= cc if casing else c
            if "rail-tracks" in i: paint['line-color']=p['land']
            if 'line-width' in paint: paint['line-width']=scale(paint['line-width'], 2.1 if casing else 1.8)
            l.setdefault('layout',{}).update({'line-cap':'round','line-join':'round'})
            if 'line-gap-width' in paint: paint['line-gap-width']=scale(paint['line-gap-width'],1.8)
            l.setdefault('layout',{}).update({'line-cap':'round','line-join':'round'})
            paint.pop('line-opacity',None) if "tunnel" not in i else None
        elif t=="symbol" and 'text-field' in l.get('layout',{}):
            natural = i in("water-line-label","water-point-label","waterway-label")
            paint['text-color']= p['wtext'] if natural else p['text']
            paint['text-halo-color']=p['halo']; paint['text-halo-width']=2.5; paint['text-halo-blur']=0.5
            paint.pop('text-opacity',None)
        out.append(l)
    s['layers']=out
    s['name']=f"matmanna cartoon {theme}"
    for k in('owner','id','created','modified','visibility','draft'): s.pop(k,None)
    return s

for th in("light","dark","stone-light","stone-dark"):
    json.dump(build(th),open(f"cartoon-{th}.json","w"),separators=(',',':'))
    print(th, len(json.load(open(f"cartoon-{th}.json"))['layers']))
