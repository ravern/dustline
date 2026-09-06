import type { ClientMessage, ServerMessage } from '../shared/types';

export class Network {
  socket?: WebSocket;
  id = '';
  connected = false;
  rtt = 0;
  offset = 0;
  latency = Number(new URLSearchParams(location.search).get('latency')) || 0;
  onMessage: (m: ServerMessage) => void = () => {};
  onStatus: (connected: boolean) => void = () => {};
  private timer?: ReturnType<typeof setInterval>;
  private generation = 0;
  connect() {
    const gen = ++this.generation;
    this.socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    this.socket.addEventListener('open', () => {
      this.connected = true;
      this.onStatus(true);
      this.send({ type: 'ping', time: Date.now() / 1000 });
      this.send({ type: 'list' });
      clearInterval(this.timer);
      this.timer = setInterval(() => this.send({ type: 'ping', time: Date.now() / 1000 }), 1500);
    });
    this.socket.addEventListener('message', (e) => {
      const message = JSON.parse(e.data) as ServerMessage;
      const deliver = () => {
        if (gen !== this.generation) return;
        if (message.type === 'welcome') this.id = message.id;
        if (message.type === 'pong') {
          const now = Date.now() / 1000;
          const rtt = (now - message.time) * 1000;
          const nextOffset = message.serverTime - (message.time + now) / 2;
          this.offset = this.rtt ? this.offset * .7 + nextOffset * .3 : nextOffset;
          this.rtt = this.rtt && rtt < this.rtt ? this.rtt * .65 + rtt * .35 : rtt;
        }
        this.onMessage(message);
      };
      if (this.latency > 0) setTimeout(deliver, this.latency / 2); else deliver();
    });
    this.socket.addEventListener('close', () => {
      if (gen !== this.generation) return;
      this.connected = false;
      clearInterval(this.timer);
      this.onStatus(false);
      setTimeout(() => { if (gen === this.generation) this.connect(); }, 2000);
    });
    this.socket.addEventListener('error', () => {});
  }
  send(message: ClientMessage) {
    const gen = this.generation;
    const send = () => {
      if (gen === this.generation && this.socket?.readyState === WebSocket.OPEN && this.socket.bufferedAmount < 65536) this.socket.send(JSON.stringify(message));
    };
    if (this.latency > 0) setTimeout(send, this.latency / 2); else send();
  }
  now() { return Date.now() / 1000 + this.offset; }
}
