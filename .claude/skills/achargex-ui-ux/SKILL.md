---
name: achargex-ui-ux
description: Audit and refactor AChargeX screens for mobile-first responsive UI using the AChargeX design system. Use when changing any page or component in apps/web, fixing layout on phones/tablets, or comparing against design-references.
---

# AChargeX UI/UX audit & responsive refactor

## Before editing
1. Find the component that ACTUALLY renders the route: start at `apps/web/src/App.tsx`, follow the route element. Never edit an unused file.
2. Open the matching reference in `design-references/achargex-go/` (README maps files → routes and lists tokens).
3. Render the current state: build web, run `node scripts/screens.mjs http://localhost:4173 <out> <route-filter>`, and look at the PNGs.

## Rules
- Tokens only (`ax-*` light, `ctl-*` dark in `tailwind.config.js`). Reuse `src/ui/index.tsx` (Button, Chip, Card, Sheet, ConfirmDialog, StatusBadge, DemoBadge, Notice, EmptyState, Segmented, Stat, IconButton).
- Mobile (<768): one column, compact header, bottom nav with Scan FAB, `.pb-nav` padding, sticky action bars sit above the nav with `pb-7` to clear the FAB. No desktop sidebar or module switcher on phones.
- Tablet (768–1023): adapt, don't shrink desktop. Split views only where useful (Find list+map).
- Desktop (≥1024): sidebar; Control keeps dense tables (cards below 768).
- Touch targets ≥ 44px; visible focus; labels on inputs; `aria-pressed`/`role=radio` on toggles.
- Navy pill = primary; green pill + navy text = charging action. Prices/IDs/timers use `.num`.
- No emoji icons, no giant hero areas, no nested cards, no arbitrary gradients, no oversized metrics.
- Demo/simulated data must carry a DemoBadge.

## Verify (required)
- `screens.mjs` must report `0 overflow; 0 with errors` across 320/360/390/430/768/1024/1440.
- Look at the 390 and 768 screenshots yourself and describe what changed. Don't claim visual verification without rendering.
