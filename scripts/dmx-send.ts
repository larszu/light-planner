// Pruefsender fuer den DMX-Eingang: faehrt ein Universe mit einer Welle, damit
// man den Empfang ohne Pult sieht. Kein Guard, ein Werkzeug.
//
//   npm run dmx:send -- [artnet|sacn] [Universe] [Ziel-IP]
//
// Universe in der Zaehlung des Plans (ab 1). Art-Net geht an die Ziel-IP
// (Vorgabe 127.0.0.1), sACN an die Multicast-Gruppe des Universe.
// Kanal 1 = Dimmer-Welle, Kanaele 2..4 = Farbe laeuft um, danach Pan/Tilt.
import dgram from 'node:dgram';
import { ARTNET_PORT, SACN_PORT, buildArtDmx, buildSacn, sacnGroup } from '../src/core/dmxInput.ts';

const [proto = 'artnet', uArg = '1', host = '127.0.0.1'] = process.argv.slice(2);
const planUniverse = Math.max(1, Number(uArg) || 1);
const sock = dgram.createSocket('udp4');
let seq = 0;
const start = Date.now();

setInterval(() => {
  const t = (Date.now() - start) / 1000;
  const d = new Uint8Array(512);
  const wave = (p: number) => Math.round(127.5 + 127.5 * Math.sin(t * p));
  // Jede Gruppe von 8 Kanaelen: Dimmer, R, G, B, Pan, Pan fein, Tilt, Tilt fein.
  for (let base = 0; base + 8 <= 512; base += 8) {
    d[base] = wave(1.3);
    d[base + 1] = wave(0.7);
    d[base + 2] = wave(0.7 + 2.1);
    d[base + 3] = wave(0.7 + 4.2);
    d[base + 4] = wave(0.4);
    d[base + 6] = Math.round(128 + 40 * Math.sin(t * 0.5));
  }
  if (proto === 'sacn') {
    sock.send(buildSacn(planUniverse, d, { sequence: seq++, name: 'dmx-send' }), SACN_PORT, sacnGroup(planUniverse));
  } else {
    sock.send(buildArtDmx(planUniverse - 1, d, seq++), ARTNET_PORT, host);
  }
}, 1000 / 30);

console.log(`sende ${proto} auf Plan-Universe ${planUniverse} — Strg+C beendet`);
