# LDRbooth 💌📸

A tiny long-distance photobooth for two: create a room, share the code,
and take a synchronized 4-photo strip together over video chat.

**Stack:** Python (FastAPI) for the room/signaling server, TypeScript
(no framework — just the DOM + WebRTC + Canvas APIs) for the client.

## How it works

- The landing page lets you **create** a room (get a 5-character code) or
  **join** one with a code. A room holds at most 2 people.
- Once both people are in, a WebRTC peer connection is established
  (server only relays the offer/answer/ICE signaling — video never
  touches the server).
- Either person can hit **Snap**. Both browsers get a synchronized
  3-second countdown, then each browser captures **both** the local
  video frame and the incoming remote video frame at the same instant.
  Because both sides capture both frames, no image ever has to be
  uploaded anywhere — each browser ends up with the identical final set.
- This repeats for 4 rows. The layout is always "host" on the left
  column and "guest" on the right column (labeled "You"/"Partner" for
  whoever is looking), so both people get an identical final image —
  a 2-column x 4-row strip, 8 photos total.
- The final composite is drawn to a `<canvas>`, stamped with the
  session date (YYYY-MM-DD), and offered as a PNG download.
- On the result screen, a **theme dropdown** lets you pick a background
  overlay (or plain white, the default) for the downloaded strip. Themes
  only affect the final image — the live capture view is unaffected.

## Project layout

```
ldrbooth/
├── server/
│   ├── main.py            FastAPI app: room management + WS signaling/sync
│   └── requirements.txt
├── client/
│   ├── index.html         Landing / room / result views
│   ├── style.css
│   ├── assets/
│   │   └── themes/        Preset background overlay images (SVG)
│   ├── src/
│   │   ├── types.ts       Shared message/type definitions
│   │   ├── themes.ts      Theme manifest (id, name, image path)
│   │   ├── dom.ts         Centralized DOM element references
│   │   ├── state.ts       Shared app state + constants
│   │   ├── views.ts       Landing/room/result view switching
│   │   ├── connection.ts  WebSocket transport + WebRTC peer setup
│   │   ├── capture.ts     Countdown, frame capture, live grid thumbnails
│   │   ├── composite.ts   Final image: grid layout, theme bg, date footer
│   │   ├── session.ts     Room entry + server-message dispatch (orchestrator)
│   │   ├── landing.ts     Create/join room button handlers
│   │   └── main.ts        Entry point — wires all of the above together
│   ├── dist/               Compiled JS output (already built, but see below)
│   ├── package.json
│   └── tsconfig.json
└── README.md
```

Each client module has one job, and dependencies only flow one direction
(e.g. `connection.ts` knows nothing about `capture.ts` or `composite.ts`,
so the signaling/WebRTC plumbing can be read or changed in isolation).
`session.ts` is the one place that ties the pieces together in response to
server messages — that's the file to open if you want to trace the overall
flow end to end.

## Running it

### 1. Backend

```bash
cd server
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The server serves the compiled frontend directly (via `client/`), so once
it's running, just open **http://localhost:8000** — no separate frontend
server needed.

### 2. Frontend (only needed if you change the TypeScript)

The compiled output is already checked into `client/dist/`, so you can
run the app as-is. If you edit `client/src/*.ts`, rebuild with:

```bash
cd client
npm install
npm run build      # compiles src/*.ts -> dist/*.js
```

## Trying it locally with two "people"

Open **http://localhost:8000** in two different browser windows (or one
normal + one incognito window, since each needs its own camera
permission prompt). Create a room in one, join with the code in the
other.

## Notes & things you may want to extend

- Uses only a public STUN server (`stun.l.google.com`) for NAT
  traversal. If both people are behind strict/symmetric NATs (common on
  some corporate or mobile networks), the peer connection may fail to
  establish — you'd want to add a TURN server for reliability across
  arbitrary networks.
- Rooms and their state live in memory in the FastAPI process, so they
  don't survive a server restart and won't work across multiple server
  instances. Fine for a single-process deployment; swap in Redis or
  similar if you need to scale out.
- Only video is captured; audio track is deliberately not requested so
  the browser doesn't ask for mic permission you don't need.
- The countdown, snap button, and photo grid are intentionally simple —
  lots of room to add filters, retake, timer length options, etc.
- **Adding a new theme:** drop an image (SVG, PNG, whatever) into
  `client/assets/themes/`, then add one entry to the `THEMES` array in
  `client/src/themes.ts` (an id, a display name, and the image path). The
  dropdown and the compositor both read from that one list, so nothing
  else needs to change. An entry with `imagePath: null` renders as a
  plain white background — that's what "Default" uses.
