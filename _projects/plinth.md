---
layout: project
title: plinth
description: A foundation for all the factories.
image: /assets/images/projects/plinth.webp
card_image: /assets/images/projects/cards/plinth-card.webp
start_date: 2026-11-22
activity_status: active
links:
  - title: Website
    url: https://plinth.matmanna.dev
    icon: fa-solid fa-up-right-from-square
  - title: Source
    url: https://github.com/matmanna/plinth
    icon: fa-brands fa-github
tags:
  - Rust
  - Bun
  - Agentic Tooling
  - Open Source
skills:
  - name: Agentic Tooling
    icon: fa-solid fa-code
  - name: Systems Programming
    icon: fa-solid fa-gear
---

plinth is the block a column stands on: the shared foundation for agent harnesses like openmotion and mytholog, covering the parts that don't know what a "timeline" or a "finding" is. The behavior is written in Rust and loaded into Bun or Node as an N-API addon, handling versioned documents, a durable lane-based job runner on SQLite, outbound request policy, prompt assembly and an event bus, with a thin TypeScript layer on top.
