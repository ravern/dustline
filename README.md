# Dustline

A playable browser FPS for 2–6 operators, including bots. The Yard is an original compact desert scrapyard with stacked containers, cover lanes and a climbable central drilling rig. The pace and quickscoping take inspiration from classic multiplayer shooters; this is an arcade game with respawns.

## Launch locally

On macOS, double-click **Start Dustline.command**. It installs missing dependencies, starts the server in Terminal, and opens the browser once the server responds. Keep that Terminal window open. Stop with Control-C or **Stop Dustline.command**; the stop launcher only targets a process recorded by the start launcher.

Alternatively, from this directory:

```sh
npm install
npm run dev
```

Open [localhost:3000](http://localhost:3000). Requires Node.js 22.12+ (or Node 20.19+) and a desktop browser with WebGL and a mouse. Chrome or Edge is recommended. No paid API keys or cloud services are needed. After dependencies are installed, gameplay runs locally.

**Solo warm-up** immediately starts a match with three bots. To play together, select a primary in **Loadout**, create a lobby, and share its invite. Everyone except the host must ready up before deployment. The host controls bots, score limit and time limit. Players can join a running match; a human replaces a bot when all six slots are occupied. Every loadout includes the M9 and combat knife.

For another computer on the same network, use the host's LAN address, for example `http://192.168.5.101:3000`, then enter the room code. **Copy invite** uses a LAN URL when possible. Available host addresses are listed by [/api/info](http://localhost:3000/api/info); addresses can change when the network changes. Allow the incoming local connection if macOS asks. Each browser tab is a separate operator.

## Controls

| Action | Control |
| --- | --- |
| Move / look | WASD / mouse |
| Sprint | Hold Shift while moving forward |
| Jump | Space |
| Crouch / slide | Hold C or Control; press during a sprint to slide |
| Fire / knife attack | Left mouse |
| Aim | Hold right mouse |
| Reload | R |
| Primary / M9 / knife | 1 / 2 / 3 |
| Quick melee / swap weapon | V / Q |
| Scoreboard | Hold Tab |
| Release mouse / resume menu | Escape |

The Intervention reaches aimed accuracy after **160 ms**, kills with one torso hit, holds five rounds and has a 950 ms bolt cycle. AK-47 and SCAR-H are automatic; the M9 is semiautomatic. Sprint is 9 m/s. The jump peaks near one metre and lands in about half a second. Slide momentum lasts about 650 ms. Health regenerates after five seconds without damage; respawns take 2.5 seconds.

Settings include sensitivity, field of view, volume, graphics and added network delay. The delay setting simulates 80, 160 or 250 ms of extra round-trip latency so you can feel the prediction and hit compensation.

## Build and check

```sh
npm test
npm run build
npm start
```

`npm start` serves the built client and WebSocket game server on port 3000. Set `PORT=3001` to use another port. If a restricted environment blocks the `tsx` CLI's temporary socket, run the tests with `node --import tsx --test tests/*.test.ts`.

With the server running, `npm run test:browser` runs the two-browser playtest (requires installed Google Chrome). It uses real keyboard and mouse input and writes screenshots plus results to `test-results/browser/`.

The final verification passed **36 automated tests and 13 real-browser checks**, including a player-to-player quickscope elimination, replicated death and respawn, and movement under 160/250 ms added network delay. Saved evidence is in `test-results/browser/`.

The automated suite covers collision, jumping, sprinting, sliding, both rig staircases, lobby permissions, loadouts, gunplay, reloads, respawns, bots, late joining and latency/reconciliation. [NETWORKING.md](NETWORKING.md) describes the implementation and research.

This is a local/LAN game, not an internet matchmaking service. Rooms and scores live in memory and disappear when the server stops. There are no accounts, persistent progression, dedicated hosting, NAT traversal or relay service. WebSocket connections go directly to this server; a room code alone cannot reach it from outside your network. Disconnecting creates a new operator when you reconnect. Bots provide moving, shooting practice opponents with simple steering.
