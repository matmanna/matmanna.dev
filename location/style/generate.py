#!/usr/bin/env python3
"""Rebuilds the four cartoon-*.json styles from Mapbox Streets v12:
colourful light/dark, and brown-light/brown-dark that use only the site's orange/brown scale.

Recolours every layer with the site's orange palette, thickens roads and drops
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
 "brown-light": dict(
  land="#ffedd5", grass="#fed7aa", wood="#fdba74", park="#fed7aa", water="#fb923c", waterline="#fb923c",
  building="#fed7aa", aero="#fed7aa", pitch="#fdba74", hospital="#fed7aa", school="#fed7aa", industrial="#fed7aa", sand="#ffedd5",
  minor="#fff7ed", minor_c="#fed7aa", sec="#fff7ed", sec_c="#fdba74", pri="#fdba74", pri_c="#fb923c",
  mot="#f97316", mot_c="#c2410c", path="#fdba74", rail="#fb923c", pedestrian="#fff7ed",
  text="#7c2d12", halo="#ffedd5", wtext="#431407", boundary="#fb923c", ferry="#c2410c"),
 "brown-dark": dict(
  land="#431407", grass="#5a1f0c", wood="#7c2d12", park="#5a1f0c", water="#9a3412", waterline="#9a3412",
  building="#5a1f0c", aero="#5a1f0c", pitch="#7c2d12", hospital="#5a1f0c", school="#5a1f0c", industrial="#5a1f0c", sand="#431407",
  minor="#7c2d12", minor_c="#2a0c04", sec="#9a3412", sec_c="#2a0c04", pri="#c2410c", pri_c="#2a0c04",
  mot="#f97316", mot_c="#7c2d12", path="#7c2d12", rail="#7c2d12", pedestrian="#7c2d12",
  text="#ffedd5", halo="#431407", wtext="#fdba74", boundary="#9a3412", ferry="#c2410c"),
}

REMOVE = {"hillshade","water-depth","water-shadow","waterway-shadow","building-underground","poi-label","transit-label",
 "block-number-label","building-number-label","building-entrance","crosswalks","level-crossing","golf-hole-line","golf-hole-label",
 "turning-feature","turning-feature-outline","road-intersection","road-exit-shield","road-number-shield","path-pedestrian-label",
 "pitch-outline","land-structure-line","ferry-aerialway-label","aerialway","road-pedestrian-polygon-pattern","admin-0-boundary-disputed",
 "tunnel-oneway-arrow-blue","tunnel-oneway-arrow-white","road-oneway-arrow-blue","road-oneway-arrow-white","bridge-oneway-arrow-blue","bridge-oneway-arrow-white"}

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
        if i in REMOVE: continue
        l=copy.deepcopy(l); paint=l.setdefault('paint',{}); t=l['type']
        if i=="land": paint['background-color']=p['land']
        elif i=="landcover":
            paint['fill-color']=["match",["get","class"],"wood",p['wood'],"scrub",p['grass'],"grass",p['grass'],"crop",p['grass'],"snow","#ffffff",p['grass']]
            paint['fill-opacity']=1
        elif i=="national-park": paint['fill-color']=p['park']; paint['fill-opacity']=["interpolate",["linear"],["zoom"],5,0,6,1]
        elif i=="landuse":
            paint['fill-color']=["match",["get","class"],"park",p['park'],"pitch",p['pitch'],"golf_course",p['park'],"cemetery",p['park'],
              "wood",p['wood'],"grass",p['grass'],"scrub",p['grass'],"agriculture",p['grass'],"hospital",p['hospital'],"school",p['school'],
              "college",p['school'],"sand",p['sand'],"glacier","#ffffff","airport",p['aero'],"industrial",p['industrial'],p['land']]
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
            if 'line-width' in paint: paint['line-width']=scale(paint['line-width'], 1.45 if casing else 1.3)
            if 'line-gap-width' in paint: paint['line-gap-width']=scale(paint['line-gap-width'],1.3)
            paint.pop('line-opacity',None) if "tunnel" not in i else None
        elif t=="symbol" and 'text-field' in l.get('layout',{}):
            natural = i in("water-line-label","water-point-label","waterway-label")
            paint['text-color']= p['wtext'] if natural else p['text']
            paint['text-halo-color']=p['halo']; paint['text-halo-width']=2; paint['text-halo-blur']=0.5
            paint.pop('text-opacity',None)
        out.append(l)
    s['layers']=out
    s['name']=f"matmanna cartoon {theme}"
    for k in('owner','id','created','modified','visibility','draft'): s.pop(k,None)
    return s

for th in("light","dark","brown-light","brown-dark"):
    json.dump(build(th),open(f"cartoon-{th}.json","w"),separators=(',',':'))
    print(th, len(json.load(open(f"cartoon-{th}.json"))['layers']))
