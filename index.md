---
layout: page
title: Ahoy! I'm Mat,
description: My personal site's home page
permalink: /
---

<div class="flex flex-row gap-2 not-prose flex-wrap" style="height: 30.33px;">
  <a href="https://linkedin.com/in/matmanna" data-no-external-icon rel="nofollow">
    <img src="/assets/images/badges/social/linkedin-badge.svg" alt="LinkedIn badge" width="37" height="20">
  </a>
  <a href="https://devpost.com/matmanna" data-no-external-icon rel="nofollow">
    <img src="/assets/images/badges/social/devpost-badge.svg" alt="Devpost badge" width="51" height="20">
  </a>
  <a href="https://matmanna.itch.io/" data-no-external-icon rel="nofollow">
    <img src="/assets/images/badges/social/itch-badge.svg" alt="Itch.io badge" width="49" height="20">
  </a>
  <a href="https://pypi.org/user/matmanna/" data-no-external-icon rel="nofollow">
    <img src="/assets/images/badges/social/pypi-badge.svg" alt="PyPI badge" width="51" height="20">
  </a>
  <a href="https://rubygems.org/profiles/matmanna" data-no-external-icon rel="nofollow">
    <img src="/assets/images/badges/social/rubygems-badge.svg" alt="RubyGems badge" width="57" height="20">
  </a>
  <a href="https://gitlab.com/matmanna" data-no-external-icon rel="nofollow">
    <img src="/assets/images/badges/social/gitlab-badge.svg" alt="GitLab badge" width="45" height="20">
  </a>
  <p>(<code>:places</code>)</p>
</div>

an aspiring engineer focused on open protocols, automation, and rapid prototyping.

<hr class="not-prose">


## a lil' <code>:about</code> me

A decade of technical experience has shaped me into an indie maker who builds engaging, accessible, and secure tools<small>I see my projects as tools meant to serve, not products to exploit. I prefer to use tools which align with this.</small>[^1] for real people. I am especially passionate about search UX, crafting interfaces with the real world, and decentralized infrastructure. 

Outside of computing, I’m also a guitarist, competition aficionado, and linguaphile<small>English, Spanish, and Esperanto so far</small>[^2].



### what i'm up to <code>:now</code>

<details><summary>Recently, I've been shipping,<sub> (expand for stats!)</sub> but also: </summary>
  
</details>
  <a class="no-external-icon heatmap-link" href="https://heatmap.shymike.dev?id=U07VA44DNBA&timezone=America%2FNew_York&standalone=true" title="Click to view detailed data for each day!" style="min-height: 122.33px; display: inline-block;">
    <img id="heatmap-image" class="heatmap-image" alt="Hackatime activity heatmap" width="684" height="90.33" fetchpriority="high" src="https://heatmap.shymike.dev?id=U07VA44DNBA&timezone=America%2FNew_York&theme=light" data-light-src="https://heatmap.shymike.dev?id=U07VA44DNBA&timezone=America%2FNew_York&theme=light" data-dark-src="https://heatmap.shymike.dev?id=U07VA44DNBA&timezone=America%2FNew_York&theme=dark">
  </a>
  <noscript>
    <a class="no-external-icon heatmap-link" href="https://heatmap.shymike.dev?id=U07VA44DNBA&timezone=America%2FNew_York&standalone=true" title="Click to view detailed data for each day!">
      <img class="heatmap-image" alt="Hackatime activity heatmap" src="https://heatmap.shymike.dev?id=U07VA44DNBA&timezone=America%2FNew_York&theme=light" width="684" height="90.33">
    </a>
  </noscript>
  <style>
    .heatmap-link img {
      width: 100%;
      height: auto;
      max-width: 742px;
    }
  </style>
  <script>
    (function () {
      const img = document.getElementById('heatmap-image');
      if (!img) return;
      const lightSrc = img.dataset.lightSrc;
      const darkSrc = img.dataset.darkSrc;
      if (!lightSrc) return;
      const root = document.documentElement;
      const updateSrc = () => {
        const isDark = root.classList.contains('dark') || 
          (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches) ||
          localStorage.theme === 'dark';
        const target = isDark ? darkSrc : lightSrc;
        if (img.getAttribute('src') !== target) {
          img.setAttribute('src', target);
        }
      };
      const runAfterDoctored = () => {
        updateSrc();
        setTimeout(updateSrc, 100);
        setTimeout(updateSrc, 500);
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runAfterDoctored);
      } else {
        runAfterDoctored();
      }
      document.addEventListener('click', (e) => {
        const toggle = document.getElementById('theme-toggle');
        if (toggle && (toggle.contains(e.target) || toggle === e.target)) {
          setTimeout(updateSrc, 50);
        }
      });
      window.addEventListener('storage', (e) => {
        if (e.key === 'theme') updateSrc();
      });
      if (window.MutationObserver) {
        new MutationObserver(updateSrc).observe(root, { attributes: true, attributeFilter: ['class'] });
      }
    })();
  </script>
- reverse-engineering electric and bass guitar amplifiers to build:
  - LtAmp.py: a Python [library](https://pypi.org/p/ltamp) for interacting with supported amplifiers
  - The Twist: an augmentation [module](https://github.com/benderhq/the-twist/tree/nix) with features incl. remote control and preset playlists
- maintaining<small class="no-external-icon">I've also contributed code to systems (such as [Hackatime](https://hackatime.hackclub.com), [Revoker](https://revoke.hackclub.com), & [site](https://hackclub.com?uwu)), and reported data leaks through the security [program](https://security.hackclub.com).</small>[^3] Hack Club tools such as [Slacker News](https://news.hackclub.com), the <a class="slack_channel" href="https://app.slack.com/client/E09V59WQY1E/C0M8PUPU6">#ship</a> channel (30k+ members), and technical support systems for new hackers & YSWS participants.

<style>
  .slack_channel {
  color: #1264a3 !important;
  background: #1264a31a;
  border-radius: 3px;
  padding: 0 3px;
  white-space: nowrap;
}
</style>

<hr class="not-prose">


### formative <code>:experiences</code>

Since being exposed to computer programming on [Scratch](https://scratch.mit.edu) a decade ago, I’ve:
- built a life-sized [board game](https://github.com/ldnano/o-fn) using industrial tech which supports community outreach & won:
  - 1st in the 2025 **PLCNext Innovation Contest Nationals**
  - 1st at the 2026 **Pennsylvania Invention Convention**
  - a Hack Club X Congressional App Challenge **Open-source** [**Certification**](http://congressional.hackclub.com/)
- made videogame [submissions](https://matmanna.itch.io) within 48hrs-2wks for ~7 game jams
- run AV systems (livestreams and sound mixers) for funerals and weddings
- discovered and disclosed vulnerabilities / data leaks within my school and Hack Club
- <details><summary>been recognized in other ways <sub>(not that interesting)</sub></summary><ul>
  <li>participated in the selective PennApps XXVI college [hackathon](https://pennapps.com)</li>
  <li>received recognition for Integrity and Sportsmanship within academics and competitions.</li>
  <li>earned ~$1k in grants and prizes for personal projects submitted to Hack Club programs incl. High Seas, Summer of Making, CMD-K, and Magazine.</li></ul>
  </details>

<style>

  @media (min-width: 170ch) {
    .projects-width-breakout {
        --projects-breakout-width: min(170ch, calc(100vw - 2rem));
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        width: var(--projects-breakout-width);
        max-width: none;
        margin-left: calc((80ch - var(--projects-breakout-width)) / 2);
        margin-right: calc((80ch - var(--projects-breakout-width)) / 2);
    }
}
.prose :where(code):not(:where([class~=not-prose],
[class~=not-prose] *)):before {
  content:""
}
.prose :where(code):not(:where([class~=not-prose],
[class~=not-prose] *)):after {
  content:""
}
</style>

_Here are some more orgs & projects I've contributed to... (<a href="/projects">all</a>)_

<ul class="projects-width-breakout px-0 flex mt-3 flex-col gap-3 not-prose">
  {% assign projects_without_end = site.projects | where_exp: "project", "project.end_date == nil or project.end_date == ''" %}
  {% assign projects_with_end = site.projects | where_exp: "project", "project.end_date != nil and project.end_date != ''" | sort: "end_date" | reverse %}
  {% assign recent_projects = projects_without_end | concat: projects_with_end %}
  {% for project in recent_projects limit:8 %}
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
[^3]: I've also contributed code in infrastructure (such as [Hackatime](https://hackatime.hackclub.com), [Revoker](https://revoke.hackclub.com), & [site](https://hackclub.com?uwu)), and reported data leaks through the security [program](https://security.hackclub.com).

<hr class="not-prose">
