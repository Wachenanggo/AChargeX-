# AChargeX Go — Design Reference (Evro-style)

These 7 HTML files are **visual references only**. Open any of them in a browser to see the screen at 390×844.
Do NOT copy them into the app as-is. Rebuild each screen with the project's real components, routing and data.

## Screens → app routes
| File | Screen | Notes |
|---|---|---|
| 01-welcome.html | Onboarding / Welcome | 5-step pager, Skip, navy pill "Next" |
| 02-find-map.html | Find (map view) | Vehicle card, search, filter chips, pins + clusters, selected-station bottom sheet |
| 03-station-list.html | Find (list view) | Map/List toggle, active filter chips, station cards (price · charge points · output) |
| 04-station-details.html | Station details | Deal banner, connector cards: Available / Occupied / Faulted; only Available is selectable |
| 05-charge-setup.html | Charge setup | Step bar, ₱200 / ₱500 / Full (capped ₱1,500) limit, payment method, hold explanation |
| 06-live-session.html | Live session | Dark navy, ring = % of spending limit used, kWh, kW, elapsed, cost, Stop |
| 07-garage.html | Garage | Selected vehicle, connector compatibility grid, add vehicle |

## Design tokens
```
--ax-green:        #00BF80   /* fills, primary accent; text on it = navy */
--ax-green-text:   #007A55   /* green TEXT on white (contrast-safe) */
--ax-navy:         #192338   /* primary buttons, headings */
--ax-navy-deep:    #111A2B   /* live-session background */
--ax-navy-card:    #1A2640   /* cards on dark */
--ax-bg:           #F4F9F6
--ax-card:         #FFFFFF
--ax-surface:      #EDF3F7
--ax-border:       #E1EAF0
--ax-muted:        #5E6F86   /* muted text (passes 4.5:1) */
--ax-busy:         #A3302A  bg #FDF0EF
--ax-deal:         #F2B53A
```
- Fonts: **Inter** (UI), **JetBrains Mono** (prices, kWh, connector IDs, timers)
- Radius: cards 16–22px, buttons fully round (pill), chips 16–18px
- Micro-labels: 10–11px, uppercase, letter-spacing 1.2–1.4px, muted colour
- Primary action = navy pill (white text). Charging action = green pill (navy text)
- Bottom nav: Home · Find · **Scan (raised green FAB)** · Garage · Wallet; safe-area padding; content never hidden behind it
- Icons: Lucide equivalents (bolt/zap, map-pin, scan-qr, car, wallet, headset, sliders)
- All sample data is DEMO and must be labelled so in the app until real data is connected
