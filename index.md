---
layout: page
title: Ahoy! I'm Mat,
description: My personal site's home page
permalink: /
---

<div class="flex flex-row gap-2 not-prose flex-wrap">
  <a href="https://linkedin.com/in/matmanna" data-no-external-icon rel="nofollow">
    <img src="https://custom-icon-badges.demolab.com/badge/in-0A66C2?logo=linkedin-white&logoColor=fff" alt="LinkedIn badge">
  </a>
  <a href="https://devpost.com/matmanna" data-no-external-icon rel="nofollow">
    <img src="https://img.shields.io/badge/post-003E54?logo=devpost&logoColor=white" alt="Devpost badge">
  </a>
  <a href="https://matmanna.itch.io/" data-no-external-icon rel="nofollow">
    <img src="https://img.shields.io/badge/itch-FA5C5C?logo=itchdotio&logoColor=white" alt="Itch.io badge">
  </a>
  <a href="https://pypi.org/user/matmanna/" data-no-external-icon rel="nofollow">
    <img src="https://img.shields.io/badge/pypi-3775A9?logo=pypi&logoColor=white" alt="PyPI badge">
  </a>
  <a href="https://rubygems.org/profiles/matmanna" data-no-external-icon rel="nofollow">
    <img src="https://img.shields.io/badge/gems-CC342D?logo=rubygems&logoColor=white" alt="RubyGems badge">
  </a>
  <a href="https://gitlab.com/matmanna" data-no-external-icon rel="nofollow">
    <img src="https://img.shields.io/badge/lab-FC6D26?logo=gitlab&logoColor=white" alt="GitLab badge">
  </a>
  <p>(
    <code>:places</code> 
    to find me)</p>
</div>

an aspiring engineer focused on open protocols, automation, and rapid prototyping.

<hr class="not-prose">


### a lil' `:about` me

A decade of technical experience has shaped me into an indie maker who builds engaging, accessible, and secure tools<small>I see my projects as tools meant to serve humans, not exploit them. I prefer to use products which align with this.</small>[^1] for real people. I am especially passionate about search UX, secure interfaces with the real world, and decentralized infrastructure. 

Outside of computing, I’m also a guitarist, competition aficionado, and linguaphile<small>English, Spanish, and Esperanto so far</small>[^2].



### what i'm up to `:now`

<details><summary>Recently, I've been shipping,<sub> (expand for stats!)</sub> but also: </summary>
  <a href="https://heatmap.shymike.dev?id=U07VA44DNBA&timezone=America%2FNew_York&standalone=true" title="Click to view detailed data for each day!">    <picture>        <source media="(prefers-color-scheme: dark)" srcset="https://heatmap.shymike.dev?id=U07VA44DNBA&timezone=America%2FNew_York&theme=dark">        <img alt="Hackatime activity heatmap" src="https://heatmap.shymike.dev?id=U07VA44DNBA&timezone=America%2FNew_York&theme=light">    </picture></a> 
</details>

- reverse-engineering electric and bass guitar amplifiers to build:
  - LtAmp.py: a Python [library](https://pypi.org/p/ltamp) for interacting with supported amplifiers
  - The Twist: an augmentation [module](https://github.com/benderhq/the-twist/tree/nix) with features incl. remote control and preset playlists
- maintaining<small class="no-external-icon">I've also contrubuted code in infrastructure (such as [Hackatime](https://hackatime.hackclub.com), [Revoker](https://revoke.hackclub.com), & [site](https://hackclub.com?uwu)), and reported data leaks through the security [program](https://security.hackclub.com).</small>[^3] Hack Club tools such as [Slacker News](https://news.hackclub.com), the #ship feed, and technical support channels to new hackers & YSWS participants.

<hr class="not-prose">


### formative `:experiences`

Since being exposed to computer programming on [Scratch](https://scratch.mit.edu) a decade ago, I’ve:
- built a life-sized [board game](https://github.com/ldnano/o-fn) using industrial tech which supports community outreach & won:
  - 1st in the 2025 **PLCNext Innovation Contest Nationals**
  - 1st at the 2026 **Pennsylvania Invention Convention**
  - a Hack Club X Congressional App Challenge **Open-source** [**Certification**](http://congressional.hackclub.com/)
- made videogame [submissions](https://matmanna.itch.io) within 48hrs-2wks for ~7 game jams
- ran AV systems (livestreams and sound mixers) for funerals and weddings
- discovered and disclosed vulnerabilities and data leaks within my school and Hack Club
- <details><summary>other miscellaneous things <sub>(not that interesting)</sub></summary><ul>
  <li>Participated in the selective PennApps XXVI college [hackathon](https://pennapps.com)</li>
  <li>Received recognition for Integrity and Sportsmanship within academic competitions.</li>
  <li>Earned ~$1k in grants and prizes for personal projects submitted to Hack Club programs incl. High Seas, Summer of Making, CMD-K, and Magazine.</li></ul>
  </details>


_Here are some more orgs & projects I've contributed to... (<a href="/projects">all projects</a>)_

<ul class="px-0 flex mt-3 flex-col gap-3 not-prose">
  {% assign projects_without_end = site.projects | where_exp: "project", "project.end_date == nil or project.end_date == ''" %}
  {% assign projects_with_end = site.projects | where_exp: "project", "project.end_date != nil and project.end_date != ''" | sort: "end_date" | reverse %}
  {% assign recent_projects = projects_without_end | concat: projects_with_end %}
  {% for project in recent_projects limit:5 %}
  {% include post-card.html entry=project kind='project' %}
  {% endfor %}
</ul>

_...and here are some thoughts I've had and shared..._

<ul class="px-0 flex mt-3 flex-col gap-3 not-prose">
  {% for post in site.posts limit:3 %}
  {% include post-card.html entry=post kind='post' %}
  {% endfor %}
</ul>

<!-- _.. and some ways to use the site or reach out:_ -->

## Footnotes 
[^1]: I see my projects as tools meant to serve humans, not exploit them. I prefer to use products which align with this.
[^2]: English, Spanish, and Esperanto so far
[^3]: I've also contrubuted code in infrastructure (such as [Hackatime](https://hackatime.hackclub.com), [Revoker](https://revoke.hackclub.com), & [site](https://hackclub.com?uwu)), and reported data leaks through the security [program](https://security.hackclub.com).

<hr class="not-prose">
