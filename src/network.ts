import type { ClientMessage, ServerMessage } from '../shared/types';

const localTime = () => (performance.timeOrigin + performance.now()) / 1000;
const SESSION_KEY = 'dustline.session';

/** Clock samples with long round trips are useful for latency reporting, but
 * should not drag the aiming timeline around during a burst of congestion. */
export class NetworkClock {
  offset = 0;
  rtt = 0;
  private samples: { rtt: number; offset: number }[] = [];
  private last = 0;
  synchronize(sent: number, received: number, server: number) {
    const rtt = (received - sent) * 1000;
    if (![sent, received, server, rtt].every(Number.isFinite) || rtt < 0 || rtt > 10000) return;
    this.samples.push({ rtt, offset: server - (sent + received) / 2 });
    if (this.samples.length > 12) this.samples.shift();
    this.rtt = this.samples.length === 1 || rtt >= this.rtt ? rtt : this.rtt * .8 + rtt * .2;
    const best = [...this.samples].sort((a, b) => a.rtt - b.rtt).slice(0, 3);
    const target = best.reduce((sum, sample) => sum + sample.offset, 0) / best.length;
    this.offset = this.samples.length === 1 ? target : this.offset + Math.max(-.01, Math.min(.01, (target - this.offset) * .2));
  }
  initialize(server: number, received: number) { if (!this.samples.length && Number.isFinite(server)) this.offset = server - received; }
  now(at: number) { this.last = Math.max(this.last, at + this.offset); return this.last; }
}

export class Network {
  socket?: WebSocket;
  id = '';
  connected = false;
  readonly clock = new NetworkClock();
  get rtt() { return this.clock.rtt; }
  get offset() { return this.clock.offset; }
  latency = Math.max(0, Math.min(2000, Number(new URLSearchParams(location.search).get('latency')) || 0));
  onMessage: (m: ServerMessage) => void = () => {};
  onStatus: (connected: boolean) => void = () => {};
  private timer?: ReturnType<typeof setInterval>;
  private retry?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private attempts = 0;
  private lastHeard = 0;
  private token = '';
  private awaitingResume = false;
  private incomingDue = 0;
  private outgoingDue = 0;
  constructor() { try { this.token = sessionStorage.getItem(SESSION_KEY) || ''; } catch {} }
  connect() {
    clearTimeout(this.retry); clearInterval(this.timer);
    const gen = ++this.generation;
    this.incomingDue = this.outgoingDue = 0;
    this.socket?.close();
    this.connected = false;
    this.awaitingResume = !!this.token;
    const socket = this.socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    socket.addEventListener('open', () => {
      if (gen !== this.generation) return;
      this.lastHeard = performance.now();
      if (this.token) this.send({ type: 'resume', token: this.token });
      this.send({ type: 'ping', time: localTime() });
      this.timer = setInterval(() => {
        if (performance.now() - this.lastHeard > 10000) { socket.close(4001, 'Connection timed out'); return; }
        this.send({ type: 'ping', time: localTime() });
      }, 1500);
    });
    socket.addEventListener('message', (event) => {
      let message: ServerMessage;
      try { message = JSON.parse(event.data) as ServerMessage; if (!message || typeof message.type !== 'string') return; } catch { return; }
      const deliver = () => {
        if (gen !== this.generation) return;
        this.lastHeard = performance.now();
        if (message.type === 'welcome') {
          // The server greets a new socket before it receives our resume request.
          // Its temporary identity must never replace a still-resumable player.
          if (this.awaitingResume && !message.resumed) return;
          this.id = message.id; this.token = message.token; this.awaitingResume = false;
          try { sessionStorage.setItem(SESSION_KEY, this.token); } catch {}
          this.clock.initialize(message.serverTime, localTime());
          this.connected = true; this.attempts = 0;
          this.onStatus(true);
          this.send({ type: 'list' });
        }
        if (message.type === 'error' && message.code === 'resume_expired') {
          this.awaitingResume = false; this.token = '';
          try { sessionStorage.removeItem(SESSION_KEY); } catch {}
        }
        if (message.type === 'pong') this.clock.synchronize(message.time, localTime(), message.serverTime);
        this.onMessage(message);
      };
      // Changing simulated latency must preserve WebSocket message order.
      this.incomingDue = Math.max(this.incomingDue, performance.now() + this.latency / 2);
      const wait = this.incomingDue - performance.now();
      if (wait > 0) setTimeout(deliver, wait); else deliver();
    });
    socket.addEventListener('close', () => {
      if (gen !== this.generation) return;
      this.connected = false; clearInterval(this.timer); this.onStatus(false);
      const delay = Math.min(4000, 250 * 2 ** this.attempts++) * (.9 + Math.random() * .2);
      this.retry = setTimeout(() => { if (gen === this.generation) this.connect(); }, delay);
    });
    socket.addEventListener('error', () => {});
  }
  send(message: ClientMessage): boolean {
    const gen = this.generation, socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN || (message.type === 'inputs' && !this.connected)) return false;
    if (socket.bufferedAmount > 65536) { socket.close(4001, 'Connection congested'); return false; }
    const send = () => {
      if (gen !== this.generation || socket.readyState !== WebSocket.OPEN) return;
      // Never silently discard a movement batch: recover the authoritative
      // player session instead of accumulating divergent prediction indefinitely.
      if (socket.bufferedAmount > 65536) { socket.close(4001, 'Connection congested'); return; }
      socket.send(JSON.stringify(message));
    };
    this.outgoingDue = Math.max(this.outgoingDue, performance.now() + this.latency / 2);
    const wait = this.outgoingDue - performance.now();
    if (wait > 0) setTimeout(send, wait); else send();
    return true;
  }
  now() { return this.clock.now(localTime()); }
}
