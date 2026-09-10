# Multiplayer and latency

Dustline runs an authoritative Node.js server with browser WebSocket clients. Clients send controls; the server owns collision, damage, ammunition, respawns, teams, scores, flags and match state. Free for All supports eight players. Team Deathmatch and Capture the Flag support sixteen, with at most eight players per team. Humans must supply a name.

## Movement and recovery

Client and server run the same map-specific movement function at **60 Hz**. The server sends **20 snapshots per second**; the client batches two input commands at 30 Hz. Commands contain increasing sequence numbers and a match ID. Each snapshot acknowledges a command prefix, and the browser reconciles by replaying only newer inputs over the authoritative state. A new match ID prevents commands from a previous round affecting a new round. Rendering smooths small corrections separately from collision state.

Every server tick earns one movement credit. Up to **eight credits** can be saved during packet gaps, allowing about **133 ms** of delayed movement to catch up without exceeding elapsed simulation time. The server does not repeat missing commands. Queued shots execute at their command's position, aim and equipped weapon; cooldowns, reloads, regeneration and hit history advance on server time rather than the number of commands processed.

A delivery gap longer than the saved credit enters a short recovery window. If the backlog exceeds the earned movement budget, the server acknowledges its obsolete prefix without moving it and processes recent commands. The browser reconciles this correction once instead of retaining permanent input delay. Recovery also keeps multi-second backlogs inside the 30-command queue. This deliberately favors regaining responsive control over replaying every movement made during an outage. Movement still cannot advance beyond earned credits. Dead-player commands are acknowledged without movement, and a new life starts with no saved credit.

The server clock and browser clock use monotonic elapsed time anchored to epoch seconds. Ping/pong samples estimate clock offset and round-trip time. Offset follows the three fastest samples in the last twelve, with a bounded adjustment, so a slow asymmetric ping does not abruptly move the aiming timeline. Reported RTT rises immediately and falls gradually. Remote players interpolate between buffered snapshots on a timeline delayed by the larger of **100 ms** or **half the measured RTT plus 75 ms**.

## Shooting and game modes

The server validates weapon state and traces from the shooter's authoritative eye position through the selected arena's collision solids. Player hitboxes use historical standing, crouching or sliding height. Team modes exclude teammates from damage and bot targeting. Individual kills decide FFA; combined team kills decide TDM; only captures advance the CTF score. Ties at the time limit are draws.

About **500 ms** of target history supports a maximum **400 ms rewind**. The input's `viewTime` describes the remote-player timeline actually displayed when the shot was created. It must be finite and cannot exceed command creation time. Older inputs without `viewTime` retain the `time - 100 ms` fallback. The server clamps rewind to the allowed interval, respects historical death and spawn protection, and discards hit history on respawn. Bots use current authoritative positions. As with other rewind systems, a shot may land after the target reaches cover if the shooter saw the earlier position.

CTF flags are authoritative. Opponents pick them up by reaching them, carriers drop them on death, departure or disconnect, defenders return dropped flags by touching them, and dropped flags return automatically after **20 seconds**. A capture requires the carrier to reach their base while their own flag is home. Pickup and capture checks include nearby solid-cover occlusion. Practice bots use a cached ground navigation graph and pursue capture or recovery objectives.

## Sessions and transport

A disconnected player retains their room, identity, team, loadout and score for **20 seconds**. The host role moves to a connected player immediately. The browser retries with bounded exponential backoff and sends a private resume token over the WebSocket; tokens are stored in that tab's session storage, never included in URLs, room broadcasts or snapshots. A successful resume rotates the token, clears stale commands, and sends an authoritative snapshot. Old socket handlers cannot control or disconnect the replacement session. Explicitly leaving releases the room slot immediately, and expired sessions are removed.

WebSocket provides ordered reliable TCP delivery, so packet loss can delay subsequent messages. The client checks liveness, and both ends close congested sockets rather than silently dropping movement while allowing prediction to drift. Reconnection then uses the session mechanism. Message size, message rate, command batch length, queue length and room count are bounded; malformed inputs and stale sequences are rejected. Recent gameplay events repeat in snapshots with unique IDs for client deduplication. The server serializes each broadcast snapshot once for all recipients.

Room codes select rooms on the connected server. Rooms, scores and sessions live in memory and do not survive a server restart. There is no cross-server discovery or account service. Production `/api/info` returns no interface addresses; LAN discovery information is available only in development.

The client's added-latency control delays each direction by half the selected value. It models additional round-trip delay, not packet loss or TCP retransmissions.

## Verification

Run `npm test`, or `node --import tsx --test tests/*.test.ts` where the `tsx` CLI's temporary IPC socket is unavailable. `npm run build` checks TypeScript before bundling. The regression suite covers collision and traversal on all three maps, stance transitions, weapon rules, map selection, mode capacities, balanced bot replacement, friendly-fire exclusion, CTF lifecycle, token rotation, private-token isolation, expired sessions, stale socket protection, jitter-resistant clock synchronization and input validation.

Latency tests compare acknowledged movement with deterministic replay at 0 / 80 / 160 / 250 ms modeled RTT. They verify complete catchup after a 100 ms gap, bounded prefix recovery after a 300 ms stall and a multi-second backlog, and that input floods cannot create extra movement or accelerate weapon cooldowns. Hit-history cases cover interpolation, stance, cover, the 400 ms boundary and a 325 ms rewind corresponding to a 250 ms RTT client's displayed timeline.

With a server running, `node --import tsx tests/multiplayer.mjs` exercises real WebSocket rooms with eight FFA players and sixteen players each in TDM and CTF. It checks room limits, map and team replication, 150 acknowledged inputs per player, a 300 ms stalled sender, simulated transit delays, identity-preserving reconnect and token privacy. `DUSTLINE_TEST_URL` optionally selects a test instance. It prints measured snapshot rate and mean payload size.

`npm run test:browser` runs the browser movement, weapon and latency checks. `node --import tsx tests/modes-browser.mjs` checks the map/mode UI and reconnect flow. Browser tests use real keyboard and mouse input; their delayed-delivery checks do not establish behavior on an arbitrary internet connection.
