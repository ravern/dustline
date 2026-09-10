# Dustline

A browser FPS with eighteen arenas, three game modes, quickscoping, bots, and an authoritative multiplayer server.

| Mode | Players | Win condition |
| --- | --- | --- |
| Free for All | Up to 32 | Individual eliminations |
| Team Deathmatch | Up to 32, 16 per team | Combined team eliminations |
| Capture the Flag | Up to 32, 16 per team | Bring the enemy flag to your home flag |

The Yard is a desert scrapyard with a climbable drilling rig. Foundry adds furnace halls, a central gantry, and covered flanks. Relay is a mountain communications compound with radar dishes and elevated galleries. Bazaar adds market alleys. Harbor has cargo lanes. Citadel has a stone court and raised galleries. Junction has rail lanes and crossing routes. Oasis has desert ruins. Overpass has a bridge and covered ground routes. Canal has parallel banks and crossings. Crossfire has offset streets. Hangar has twin covered halls. Quarry has stone terraces. Outpost has four compounds. Gardens has a central pavilion. Vault has a covered bunker. Terminal has a covered concourse. Switchback has staggered walls and diagonal routes. These are original layouts. Decorative dunes have been removed from the arena walls so players cannot hide inside them. Exterior props remain outside the playable area. Every arena uses the same collision and spawn definitions on the client and server. Teams are balanced automatically; friendly fire is disabled. In CTF, your flag must be home to capture, touching a dropped friendly flag returns it, and abandoned flags return automatically.

## Play locally

Requires Node.js 22.12+ (or Node 20.19+), WebGL, and a desktop mouse and keyboard.

```sh
npm install
npm run dev
```

Open [localhost:3000](http://localhost:3000). On macOS, **Start Dustline.command** installs missing dependencies and starts the game; **Stop Dustline.command** stops that launcher's process.

Enter your own callsign; the game never assigns a default human name. Create a lobby, choose the map, mode, bots, score limit, and time limit, then share **Copy invite**. Guests ready up before the host starts. **Solo warm-up** starts an FFA match with three bots. Humans can replace bots in a full running match. Loadouts include a primary weapon, M9, and knife.

For LAN play, open the host computer's LAN address in another browser. Local development exposes available addresses through `/api/info`; production does not publish server interface addresses. Invite links use the current public origin when hosted.

## Controls

Open **Settings → Key bindings** to change any action to a keyboard key or mouse button. Bindings apply to you only and persist in this browser. Used controls cannot be assigned twice. **Restore default controls** resets all bindings. Left and right modifier keys share a binding. Mouse movement controls your view; Escape always releases the mouse.

Default controls:

| Action | Control |
| --- | --- |
| Move / look | WASD / mouse |
| Sprint | Shift while moving forward |
| Jump | Space |
| Crouch / slide | Hold C or Control; press while sprinting to slide |
| Fire / knife | Left mouse |
| Aim | Hold right mouse |
| Reload | R |
| Primary / M9 / knife | 1 / 2 / 3 |
| Quick melee / swap | V / Q |
| Scoreboard | Hold Tab |
| Release mouse | Escape |

Crouch lowers the camera and collision body; standing requires overhead clearance. Sliding lowers the body further and shows your legs and boots. Remote players bend their hips and knees into these stances. The Intervention reaches aimed accuracy after 160 ms. Health regenerates after five seconds without damage and respawns take 2.5 seconds.

## Visual assets and performance

First-person arms use a continuous anatomical surface, fitted tactical gloves, and a six-bone rig that keeps the shoulders anchored during reloads. Weapon models include textured AK-family and M9 meshes, a textured bayonet, and original Blender-authored SCAR and Intervention models. The game shares geometry, uses 1K weapon textures, and keeps simpler weapons on distant players. Source files and rebuild scripts are in `art/` and `tools/`; see [weapon credits and rebuild instructions](public/models/weapons/SOURCES.md) and [arm provenance](art/arms/README.md).

The original prop kit contains boots, crates, drums, and concrete barriers. Regenerate `art/dustline-kit.blend` and its approximately 400 KB game export with Blender's `--background --python tools/build-assets.py`. The included game assets run without additional downloads from asset services.

Static scenery is batched by material; reused props are instanced. Player and weapon geometry is cached, decorative lighting avoids per-prop shadow maps, and pixel ratio is capped. **Performance** graphics turns off shadows and lowers the render resolution. **High** uses directional shadows and weapon self shadows. Each map has a matching sky and reflection environment; turning and entering cover change the lighting on the weapon and arms. The browser test suite records draw calls, triangles, and observed frame rate; results depend on browser and hardware.

## Multiplayer

Movement is predicted locally and reconciled against authoritative input acknowledgments. Other players render from a jitter-buffered snapshot timeline; server-side hitscan uses bounded historical hitboxes. Clock sampling uses monotonic local time and filters congested samples. Brief disconnects resume the same operator, team, loadout, and score within a 20-second grace period. Session tokens stay private to their socket and browser tab.

**Added network delay** simulates 80, 160, or 250 ms of additional round-trip delay. It does not emulate packet loss. See [NETWORKING.md](NETWORKING.md) for transport limitations and verification details.

## Build, test, and host

```sh
npm test
npm run build
npm start
```

Production serves the built game and WebSocket server on port 3000; set `PORT` to use another port. The Dockerfile builds a production image and runs as a non-root user. Route HTTP and WebSocket upgrades to the same instance. `/health` reports readiness. Keep deployment hosts, SSH aliases, credentials, and private addresses in external configuration, never in this repository.

Rooms and scores are in memory, so run one server instance. Restarting or redeploying ends existing matches and invalidates resume tokens. This game does not provide persistent accounts, cross-region matchmaking, or a UDP relay.

With the server running and Google Chrome installed:

```sh
npm run test:browser
npm run test:modes-browser
npm run test:multiplayer
```

The automated tests cover movement, map traversal, capacity, teams, CTF objectives, weapons, latency, input validation, and reconnect sessions. Browser tests use real input for movement and combat and save evidence to ignored `test-results/`. If a restricted environment blocks the `tsx` CLI socket, run `node --import tsx --test tests/*.test.ts`.
