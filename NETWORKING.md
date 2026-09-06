# Multiplayer and latency

Dustline uses a Node.js authoritative server and browser WebSocket clients. Clients send input intentions; the server owns positions, collision, damage, ammo, reloads, respawns, scores and match state. The local player is predicted immediately, while other players are rendered from buffered snapshots. These techniques keep movement responsive without trusting client-reported hits.

## Time, prediction and reconciliation

Movement runs at a fixed **60 Hz** through the same `shared/physics.ts` function on client and server. The server publishes **20 snapshots per second**. Inputs carry increasing sequence numbers and are batched at 30 Hz; each snapshot acknowledges the latest processed sequence. The browser replaces its simulation state with the authoritative result, replays inputs newer than the acknowledgment, and smooths small visual corrections separately from collision state.

An accepted command advances movement exactly once. Each elapsed server tick earns one command credit, with at most **eight credits** saved during delivery gaps. Arriving commands can spend that credit in order, so a short network stall does not leave a permanent queue behind the ongoing 60 Hz input stream. The server never repeats a command without advancing its acknowledgment, and the number of movement steps cannot exceed the ticks earned since that life began. Each queued action uses its own position, aim and equipped weapon; fire cooldowns still use server time, while reload completion, regeneration and history updates run once per tick. Inputs during death are acknowledged and discarded, and respawn resets the saved credit.

Eight credits allow a bounded catchup burst of about 133 ms. The regression test stalls delivery for 100 ms, releases the delayed 30 Hz batches, and verifies that the queue has caught up within the next tick. Gaps longer than the saved budget can leave residual queue delay; this mechanism does not promise recovery from an arbitrarily long stalled connection. Valve's [player command processing implementation](https://github.com/ValveSoftware/source-sdk-2013/blob/master/src/game/server/player.cpp) also limits how many delayed user-command ticks may be replayed; Dustline's eight-credit budget is its own implementation choice.

Remote players render between buffered snapshots instead of guessing their next position. The render timeline trails estimated server time by **the larger of 100 ms or half the measured RTT plus 75 ms**. This gives received snapshots room to bracket the rendered time even at 250 ms RTT, where a fixed 100 ms delay would run ahead of the newest available snapshot. Ping/pong exchanges estimate RTT and the offset between client and server clocks. Each input carries both its creation `time` and the remote-player timestamp actually viewed, `viewTime`, in estimated server-clock seconds.

The sequence-and-replay approach follows [Gabriel Gambetta's prediction and reconciliation explanation](https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html). His [entity interpolation article](https://www.gabrielgambetta.com/entity-interpolation.html) explains why remote players are rendered slightly in the past. [Valve's networking documentation](https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking) discusses snapshot buffering and the interaction between interpolation and lag compensation. The fixed accumulator follows the principle explained in [Fix Your Timestep](https://gafferongames.com/post/fix_your_timestep/): shared physics must not depend on display frame rate.

## Authoritative shooting

A shot begins at the shooter's current authoritative eye position. The server checks the equipped weapon, fire cooldown, reload state, ammo and aiming time. It traces against map solids and the nearest eligible player, so a target behind a solid wall does not receive the hit. Aimed accuracy on the Intervention starts at 160 ms; a scoped hit within 600 ms of starting aim is identified as a quickscope.

The server stores about **500 ms of target history**. Human shots rewind each target to the input's `viewTime`, clamped to **0–400 ms before the server's current time**. This timestamp already accounts for the adaptive interpolation delay; the server does not subtract that delay again. A supplied `viewTime` must be finite and cannot exceed the command creation time. Inputs without it retain the earlier `time - 100 ms` behavior. Historical positions interpolate between samples; historical stance determines hitbox height. Dead players and spawn protection are respected, and respawn discards the previous life's history. Bots use current authoritative positions.

The 400 ms cap limits how far an untrusted timestamp can move a target into the past while allowing a 250 ms RTT shot to reach the target position shown by the interpolation buffer: 200 ms of render delay plus 125 ms of outgoing transit requires 325 ms of history. The cap is this game's design choice, not a claim about Call of Duty's networking settings. Rewind can allow a shot to land just after the target reaches cover because the shooter saw an earlier position. That tradeoff is described in [Gambetta's lag compensation article](https://www.gabrielgambetta.com/lag-compensation.html). Valve's [open-source lag compensation implementation](https://github.com/ValveSoftware/source-sdk-2013/blob/master/src/game/server/player_lagcompensation.cpp) provides a concrete reference for bounded history and discontinuities; Dustline uses its own smaller rewind cap and simplified hitboxes.

## Transport and limits

The server bounds message size, message rate, command batch size and the per-player input queue. It rejects malformed or nonfinite inputs and duplicate or stale sequences. Server snapshots repeat recent events with unique IDs; the browser deduplicates those IDs. `bufferedAmount` limits prevent endlessly adding data to congested sockets. The standard [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket) does not provide automatic backpressure.

WebSocket gives ordered, reliable delivery over TCP. This keeps the local/LAN implementation straightforward but can stall later updates behind a lost packet. There is no UDP/WebRTC transport, relay, TURN server, region selection, authentication service or internet matchmaking. A room code selects a room on the already connected server; it does not discover or reach another host. The process stores rooms and scores only in memory.

The **Added network delay** setting delays each direction by half the selected value. It is useful for trying 80, 160 and 250 ms of extra round-trip latency; it does not emulate packet loss, bandwidth limits or TCP retransmission behavior.

## Verification

The automated suite covers movement, map traversal, lobbies and combat, with **fourteen latency tests** covering command replay, bounded catchup and hit history. A real two-WebSocket-client smoke test also verified private lobby creation, joining and ready checks, deployment with the selected loadout, replicated movement acknowledgments and host transfer after disconnect. `/health` and `/api/info` were checked against the running server.

| Test | Observed result |
| --- | --- |
| Jump arc | 1.033 m apex at 250 ms; landing at 517 ms |
| Movement speed | Walk 6 m/s; sprint 9 m/s; diagonal movement normalized |
| Stopping from walk / sprint | Approximately 100 / 133 ms |
| Slide | Approximately 633 ms of active slide; 5.82 m travel in the measured sequence |
| Rig traversal | Both staircases climb without jumping; upper deck reaches 6.6 m |
| Reconciliation | Acknowledged positions match their replayed input prefix within 0.000001 m at modeled 0 / 80 / 160 / 250 ms RTT with ordered jitter |
| Command catchup | A 100 ms delivery gap drains within one tick after release; flooding cannot advance movement beyond earned server ticks; queued shots preserve their original aim and weapon |
| Hit history | Historical interpolation, stance, cover, 400 ms cap/boundary, viewed-time validation and a 325 ms rewind for a modeled 250 ms RTT shot pass |
| Lifecycle and validation | Death history reset, dead-input discard, duplicate inputs, queue bounds and late human joins pass |

The automated jitter harness tests movement consistency and bounded rewind. It does not establish browser frame latency, real packet-loss behavior or visual smoothness over an internet connection. Browser playtesting is a separate check.

Run `npm test`, or `node --import tsx --test tests/*.test.ts` in environments that block the `tsx` CLI's temporary IPC socket. `npm run build` also performs a TypeScript check before bundling the client.

## Final browser playtest

Thirteen checks ran with two independent Chrome sessions using real keyboard and mouse input, with no state injection. Both selected loadouts, readied, deployed, moved, fired, reloaded, changed weapons, paused and resumed. The jump measured 1.033 m with 526 ms to landing; sprint reached 9 m/s. At measured 164 ms and 256 ms RTT, the stopped client converged to the authoritative position with zero error; the interpolation buffer reached about 202 ms on the 250 ms setting. Predicted ammo stayed nonnegative through an empty magazine. A human-to-human Intervention shot at 7.42 m registered a quickscope elimination on both clients, followed by a full-health respawn.

Run `npm run test:browser` with the server already running and Google Chrome installed. The harness saves its results and screenshots in `test-results/browser/`. These checks are local delayed-delivery tests, not a claim of internet packet-loss coverage.
