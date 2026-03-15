const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { WebSocketServer, WebSocket } = require('ws');

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

// rooms: Map of roomId → { id, host: ws, joiner: ws|null, hostName: string }
const rooms = new Map();
// lobbyClients: clients currently watching the lobby
const lobbyClients = new Set();

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function broadcastLobby() {
  const games = [];
  for (const [id, room] of rooms) {
    if (!room.joiner) games.push({ id, hostName: room.hostName });
  }
  const msg = JSON.stringify({ type: 'lobby_state', games });
  for (const ws of lobbyClients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

wss.on('connection', ws => {
  ws.roomId = null;
  ws.isHost = false;

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // ── Subscribe to lobby ────────────────────────────────
    if (msg.type === 'lobby') {
      lobbyClients.add(ws);
      broadcastLobby(); // send current state immediately to this client
      return;
    }

    // ── Host a new game ───────────────────────────────────
    if (msg.type === 'host') {
      lobbyClients.delete(ws);
      // Clean up any previous room this socket was hosting
      if (ws.roomId && ws.isHost) rooms.delete(ws.roomId);
      const id = uid();
      rooms.set(id, { id, host: ws, joiner: null, hostName: msg.name || 'Anonymous' });
      ws.roomId = id;
      ws.isHost = true;
      ws.send(JSON.stringify({ type: 'hosting', roomId: id }));
      broadcastLobby();
      return;
    }

    // ── Join a specific game ──────────────────────────────
    if (msg.type === 'join') {
      lobbyClients.delete(ws);
      const room = rooms.get(msg.roomId);
      if (!room) {
        ws.send(JSON.stringify({ type: 'error', msg: 'Game not found — it may have been cancelled.' }));
        return;
      }
      if (room.joiner) {
        ws.send(JSON.stringify({ type: 'error', msg: 'Game is already full.' }));
        return;
      }
      room.joiner = ws;
      ws.roomId   = msg.roomId;
      ws.isHost   = false;
      // Notify both players of each other's name
      room.host.send(JSON.stringify({ type: 'player_joined', joinerName: msg.name || '' }));
      ws.send(JSON.stringify({ type: 'join_ok', hostName: room.hostName }));
      broadcastLobby(); // room is now full — remove from lobby
      // Auto-start
      const startMsg = JSON.stringify({ type: 'game_start' });
      room.host.send(startMsg);
      ws.send(startMsg);
      return;
    }

    // ── Relay everything else to the other player ─────────
    const room = ws.roomId ? rooms.get(ws.roomId) : null;
    if (!room) return;
    const other = ws.isHost ? room.joiner : room.host;
    if (other && other.readyState === WebSocket.OPEN) {
      other.send(raw.toString());
    }
  });

  ws.on('close', () => {
    lobbyClients.delete(ws);
    if (!ws.roomId) return;
    const room = rooms.get(ws.roomId);
    if (!room) return;
    const other = ws.isHost ? room.joiner : room.host;
    if (other && other.readyState === WebSocket.OPEN) {
      other.send(JSON.stringify({ type: 'opponent_disconnected' }));
    }
    if (ws.isHost) {
      rooms.delete(ws.roomId); // host leaving destroys the room
    } else {
      room.joiner = null; // joiner leaving reopens the slot
    }
    broadcastLobby();
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
