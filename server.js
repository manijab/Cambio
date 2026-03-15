const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;

// ── Local IP ──────────────────────────────────────────────
function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

// ── HTTP server (serves static files) ────────────────────
const MIME = { '.html': 'text/html', '.js': 'application/javascript' };
const server = http.createServer((req, res) => {
  const url  = req.url === '/' ? '/index.html' : req.url;
  const ext  = path.extname(url);
  const file = path.join(__dirname, url);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': (MIME[ext] || 'text/plain') + '; charset=utf-8' });
    res.end(data);
  });
});

// ── WebSocket server ──────────────────────────────────────
const wss = new WebSocketServer({ server });

// Only one room at a time: { host: ws, joiner: ws|null }
let room = null;

wss.on('connection', ws => {
  ws.isHost = false;
  ws.inRoom = false;

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // ── Lobby handshakes ──────────────────────────────────
    if (msg.type === 'host') {
      // Close any previous room
      if (room) {
        if (room.host  && room.host  !== ws) try { room.host.close();   } catch {}
        if (room.joiner && room.joiner !== ws) try { room.joiner.close(); } catch {}
      }
      room = { host: ws, joiner: null };
      ws.isHost    = true;
      ws.inRoom    = true;
      ws.hostName  = msg.name || '';
      ws.send(JSON.stringify({ type: 'hosting', ip: getLocalIP(), port: PORT }));
      return;
    }

    if (msg.type === 'join') {
      if (!room) {
        ws.send(JSON.stringify({ type: 'error', msg: 'No host is waiting.' }));
        return;
      }
      if (room.joiner) {
        ws.send(JSON.stringify({ type: 'error', msg: 'Room is already full.' }));
        return;
      }
      room.joiner = ws;
      ws.isHost   = false;
      ws.inRoom   = true;
      // Notify both players, exchanging names
      room.host.send(JSON.stringify({ type: 'player_joined', joinerName: msg.name || '' }));
      ws.send(JSON.stringify({ type: 'join_ok', hostName: room.host.hostName || '' }));
      return;
    }

    if (msg.type === 'start') {
      if (!ws.isHost || !room || !room.joiner) return;
      const startMsg = JSON.stringify({ type: 'game_start' });
      room.host.send(startMsg);
      room.joiner.send(startMsg);
      return;
    }

    // ── Relay everything else to the other player ─────────
    if (!room) return;
    const other = ws.isHost ? room.joiner : room.host;
    if (other && other.readyState === WebSocket.OPEN) {
      other.send(raw.toString());
    }
  });

  ws.on('close', () => {
    if (!room) return;
    const wasHost   = ws.isHost;
    const other     = wasHost ? room.joiner : room.host;

    if (other && other.readyState === WebSocket.OPEN) {
      other.send(JSON.stringify({ type: 'opponent_disconnected' }));
    }

    if (wasHost) {
      room = null; // host leaving destroys the room
    } else if (room) {
      room.joiner = null; // joiner leaving clears the slot
    }
  });
});

// ── Start ─────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log('\n🃏  Cambio server running!\n');
  console.log(`   Local:    http://localhost:${PORT}`);
  console.log(`   Network:  http://${ip}:${PORT}`);
  console.log('\n   Share the Network URL with the other player.\n');
  console.log('   Both players must be on the same Wi-Fi network.\n');
});
