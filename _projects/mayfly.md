---
layout: project
title: Mayfly
description: An autonomous drone swarm for indoor search and rescue that maps a building in parallel and locates victims.
image: /assets/images/projects/mayfly.webp
card_image: /assets/images/projects/cards/mayfly-card.webp
start_date: 2026-10-23
end_date: 2026-10-25
activity_status: completed
competition: true
links:
  - title: Cal Hacks 13.0
    url: https://devpost.com/software/mayfly-7m5fwo
    icon: fa-solid fa-flag-checkered
  - title: Live console
    url: https://mayfly.matmanna.dev/
    icon: fa-solid fa-play
  - title: Watch
    url: https://vimeo.com/1239251813
    icon: fa-solid fa-play
  - title: src
    url: https://github.com/monpon/mayfly
    icon: fa-brands fa-github
tags:
  - Drones
  - ESP32
  - Rust
  - Computer Vision
skills:
  - name: Robotics
    icon: fa-solid fa-microchip
  - name: Embedded Systems
    icon: fa-solid fa-microchip
  - name: Full-stack Web
    icon: fa-solid fa-layer-group
---

When a building collapses, the first hour is spent finding out what's inside. Rescue teams usually fly one expensive indoor drone, room by room, with one pilot. Mayfly sends a swarm of cheap drones instead: each takes a different part of the building, flies without a pilot, and a central GPU computer merges what they all see into one live 3D map.

The map marks people, blocked passages and hazards. From a browser console, rescuers plan a mission on the floor plan with a geofence, launch every drone with one click, watch live feeds with a coverage meter, and get a camera snapshot, confidence score and estimated breathing and pulse when a person is found.

Built with a team at Cal Hacks 13.0.
