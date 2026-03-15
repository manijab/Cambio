// ── Multiplayer state ─────────────────────────────────────
const MP = {
  active:       false,   // game is in multiplayer mode
  role:         null,    // 'host' | 'joiner'
  ws:           null,    // WebSocket connection to server
  connected:    false,   // other player is connected
  name:         null,    // this player's display name
  opponentName: null,    // opponent's display name
};

// Current view snapshot for the joiner's renderer (joiner-side only)
let JV = null;

// ── WebSocket helpers ─────────────────────────────────────
function mpSend(msg) {
  if (MP.ws && MP.ws.readyState === WebSocket.OPEN)
    MP.ws.send(JSON.stringify(msg));
}

function mpOpenWS(onOpen) {
  if (MP.ws) { try { MP.ws.close(); } catch {} }
  const url = `wss://${location.host}`;
  const ws  = new WebSocket(url);
  MP.ws     = ws;
  ws.onopen    = onOpen;
  ws.onmessage = e => handleMPMessage(JSON.parse(e.data));
  ws.onerror   = ()  => mpSetStatus('Could not connect to server.', 'err');
  ws.onclose   = ()  => { if (MP.connected && MP.active) showDisconnectOverlay(); };
}

function mpSetStatus(text, cls) {
  const el = document.getElementById('mp-status');
  if (!el) return;
  el.textContent = text;
  el.className   = 'mp-status' + (cls ? ' '+cls : '');
}

// ── Lobby actions ─────────────────────────────────────────
function mpHost() {
  MP.role = 'host';
  document.getElementById('ga').innerHTML = `
    <div class="mp-lobby"><h2>Connecting&#8230;</h2>
      <div class="mp-status" id="mp-status">Connecting to server&#8230;</div>
    </div>`;
  mpOpenWS(() => mpSend({ type: 'host', name: MP.name || '' }));
}

function mpJoin() {
  MP.role = 'joiner';
  mpSetStatus('Connecting&#8230;');
  mpOpenWS(() => mpSend({ type: 'join', name: MP.name || '' }));
}

function mpStartGame() {
  mpSend({ type: 'start' });
}

function mpCancel() {
  if (MP.ws) { try { MP.ws.close(); } catch {} MP.ws = null; }
  MP.role = null; MP.connected = false; MP.active = false;
  MP.name = null; MP.opponentName = null;
  showSplash();
}

// ── Message dispatcher (runs on both host and joiner) ─────
function handleMPMessage(msg) {
  switch (msg.type) {

    case 'hosting':
      showHostLobby(msg.ip, msg.port);
      break;

    case 'player_joined':
      MP.connected = true;
      MP.opponentName = msg.joinerName || null;
      mpSetStatus(`${MP.opponentName || 'Opponent'} connected! Start when ready.`, 'ok');
      const sb = document.getElementById('mp-start-btn');
      if (sb) sb.disabled = false;
      break;

    case 'join_ok':
      MP.connected = true;
      MP.opponentName = msg.hostName || null;
      // Send our name to the host via the server relay
      mpSend({ type: 'player_name', name: MP.name || '' });
      document.getElementById('ga').innerHTML = `
        <div class="mp-lobby">
          <h2>Connected!</h2>
          <div class="mp-status ok">Waiting for ${MP.opponentName || 'host'} to start the game&#8230;</div>
        </div>`;
      break;

    case 'player_name':
      if (MP.role === 'host') {
        MP.opponentName = msg.name || null;
        // Update the lobby status if still waiting
        const stEl = document.getElementById('mp-status');
        if (stEl && MP.opponentName) mpSetStatus(`${MP.opponentName} connected! Start when ready.`, 'ok');
      }
      break;

    case 'game_start':
      MP.active = true;
      _jvPrevCambioBy = null;
      if (MP.role === 'host') {
        showMPBadge('host');
        startNewGame();
      } else {
        showMPBadge('joiner');
        document.getElementById('ga').innerHTML = `
          <div class="mp-lobby">
            <h2>Game starting&#8230;</h2>
            <div class="mp-status">Waiting for host&#8230;</div>
          </div>`;
      }
      break;

    case 'state':
      if (MP.role === 'joiner') {
        JV = msg.view;
        renderJoinerView(JV);
      }
      break;

    case 'snap_banner':
      showSnapBanner(msg.text);
      setTimeout(() => {
        const el = document.getElementById('snap-banner');
        if (el) el.remove();
      }, 5000);
      break;

    case 'action':
      if (MP.role === 'host') mpProcessJoinerAction(msg);
      break;

    case 'error':
      mpSetStatus(msg.msg, 'err');
      break;

    case 'opponent_disconnected':
      showDisconnectOverlay();
      break;
  }
}

// ── Host→Joiner state sync ────────────────────────────────
function mpSyncJoiner() {
  mpSend({ type:'state', view: mpBuildJoinerView() });
}

function mpBuildJoinerView() {
  const anim = G.mpAnim; G.mpAnim = null; // consume once
  const p = G.phase;

  const phaseMap = {
    'joiner_draw':       'draw',
    'joiner_action':     'action',
    'joiner_peek_own':   'peek_own',
    'joiner_peeking_own':'peeking_own',
    'joiner_bs_own':     'bs_own',
    'joiner_bs_opp':     'bs_opp',
    'joiner_q_peek':     'q_peek',
    'joiner_pk_own_first':'pk_own_first',
    'joiner_pk_opp':     'pk_opp',
    'joiner_peeking_opp': G.jQueenPeek ? 'q_peek_result' : 'peeking_opp',
    'revealing':         'revealing',
    'game_over':         'game_over',
    'dealing':           'dealing',
  };
  const jPhase = phaseMap[p] || 'wait';

  const myCards = G.cCards.map((s,i)=>{
    const revealKing=(p==='joiner_pk_opp'||p==='joiner_peeking_opp')&&G.jPeekOwnKingIdx===i;
    return {card:s.card, faceUp:s.faceUp||revealKing};
  });

  const oppCards = G.pCards.map((s,i)=>{
    const reveal = s.faceUp
      || p==='game_over' || p==='revealing'
      || ((p==='joiner_peeking_opp') && G.peekOppIdx===i);
    return reveal ? {card:s.card, faceUp:true} : {card:null, faceUp:false};
  });

  let jMsg = 'Waiting for opponent\u2026';
  if (jPhase==='draw') {
    jMsg = G.cambioBy==='host'
      ? 'Opponent called CAMBIO! This is your final turn. Draw or call Cambio.'
      : 'Your turn. Draw from the deck or discard pile, or call Cambio.';
  } else if (jPhase==='action') {
    const ab = G.drawnFrom==='deck' ? ability(G.drawn?.rank) : null;
    let hint='';
    if(ab==='peek_own')   hint=' [Special: peek own if discarded]';
    if(ab==='blind_swap') hint=' [Special: blind swap if discarded]';
    if(ab==='peek_opp')   hint=' [Special: peek opponent if discarded]';
    if(ab==='peek_swap')  hint=' [Special: peek & swap if discarded]';
    jMsg = G.drawn ? `You drew ${fmt(G.drawn)}. Swap a card or discard.${hint}` : '';
  } else if (jPhase==='peek_own')    { jMsg='Select one of YOUR cards to peek at.'; }
  else if (jPhase==='peeking_own') {
    const pi=G.jPeekOwnIdx;
    jMsg = pi!=null&&G.cCards[pi] ? `Your card ${pi+1}: ${fmt(G.cCards[pi].card)} \u2014 memorize it!` : 'Peeking\u2026';
  } else if (jPhase==='bs_own')      { jMsg='Blind swap! Select one of YOUR cards first.'; }
  else if (jPhase==='bs_opp')        { jMsg=`Card ${(G.jBsOwnIdx??0)+1} selected. Now pick OPPONENT\'S card.`; }
  else if (jPhase==='q_peek')        { jMsg="Queen! Select one of OPPONENT\u2019S cards to peek at."; }
  else if (jPhase==='q_peek_result') {
    const oi=G.peekOppIdx;
    const oc=oi!=null&&G.pCards[oi]?G.pCards[oi].card:null;
    jMsg = oc ? `Opponent\u2019s card ${oi+1}: ${fmt(oc)} (${oc.value} pts) \u2014 memorize it!` : 'Peeking\u2026';
  } else if (jPhase==='pk_own_first') { jMsg="King! First select one of YOUR cards to peek at."; }
  else if (jPhase==='pk_opp')      {
    const ki=G.jPeekOwnKingIdx, kc=ki!=null&&G.cCards[ki]?G.cCards[ki].card:null;
    jMsg = kc ? `Your card ${ki+1}: ${fmt(kc)} \u2014 now select one of OPPONENT\u2019S cards to peek at.` : "Now select one of OPPONENT\u2019S cards to peek at.";
  } else if (jPhase==='peeking_opp') {
    const oi=G.peekOppIdx, ki=G.jPeekOwnKingIdx;
    const oc=oi!=null&&G.pCards[oi]?G.pCards[oi].card:null;
    const kc=ki!=null&&G.cCards[ki]?G.cCards[ki].card:null;
    jMsg = (oc&&kc) ? `Your card ${ki+1}: ${fmt(kc)} vs Opponent\u2019s card ${oi+1}: ${fmt(oc)}. Swap them?` : 'Peeking\u2026';
  } else if (jPhase==='revealing')   { jMsg='Revealing cards\u2026'; }
  else if (jPhase==='game_over') {
    const js=G.cScore, ps=G.pScore;
    if(js<ps) jMsg=`You win! Your score: ${js} vs Opponent: ${ps}`;
    else if(ps<js) jMsg=`Opponent wins! Opponent: ${ps} vs You: ${js}`;
    else jMsg=`Tie game! Both scored ${js} points.`;
  } else {
    if (G.phase === 'player_action') {
      jMsg = G.drawnFrom === 'deck'
        ? 'Opponent drew a card from the deck.'
        : 'Opponent took a card from the discard pile.';
    } else if (G.phase.startsWith('player_') || G.phase === 'peeking_own' || G.phase === 'animating') {
      jMsg = 'Waiting for opponent\u2026';
    } else if (G.phase === 'joiner_draw') {
      jMsg = G.cambioBy === 'host'
        ? 'Opponent called CAMBIO! This is your final turn.'
        : 'Your turn. Draw from the deck or discard pile, or call Cambio.';
    } else {
      jMsg = G.msg.replace(/\bComputer\b/g,'Opponent');
    }
  }

  // Only reveal the drawn card to the joiner when it is their own draw.
  // When the host has drawn (jPhase==='wait'), send a face-down placeholder
  // so the joiner sees that a card was drawn without knowing its identity.
  const drawnForJoiner = jPhase === 'action'
    ? G.drawn
    : (G.drawn ? {rank:'?', suit:'?', color:'black', value:null} : null);

  return {
    myCards, oppCards,
    deckCount:  G.deck.length,
    discard:    G.discard,
    drawn:      drawnForJoiner,
    drawnFrom:  G.drawnFrom,
    jPhase, jMsg,
    jKnown:     {...G.jKnown},
    bsOwnIdx:   G.jBsOwnIdx,
    peekingIdx: jPhase==='peeking_own' ? G.jPeekOwnIdx : null,
    peekingOppIdx: (jPhase==='peeking_opp'||jPhase==='q_peek_result') ? G.peekOppIdx : null,
    snapActive: G.snapActive,
    snapValue:  G.snapValue,
    cambioBy:   G.cambioBy,
    pScore:     G.pScore,
    jScore:     G.cScore,
    lastMove:   (G.playerMove||'')
      .replace(/^You\b/, 'Opponent')
      .replace(/\byour\b/g, 'their')
      .replace(/\bcomputer's\b/gi, 'your'),
    hostName:   MP.name || '',
    joinerName: MP.opponentName || '',
    anim,
  };
}

// ── Host processes joiner actions ────────────────────────
function mpProcessJoinerAction(msg) {
  const a = msg.action;

  if (a==='draw_deck') {
    if (G.phase!=='joiner_draw') return;
    if (!G.deck.length) reshuffleDiscard();
    if (!G.deck.length) { endGame(); return; }
    G.drawn     = G.deck.pop();
    G.drawnFrom = 'deck';
    G.phase     = 'joiner_action';
    G.msg       = `Opponent draws from the deck.`;
    G.mpAnim    = {type:'draw_deck'};
    render();
    return;
  }

  if (a==='draw_discard') {
    if (G.phase!=='joiner_draw' || !G.discard.length) return;
    G.drawn     = G.discard.pop();
    G.drawnFrom = 'discard';
    G.phase     = 'joiner_action';
    G.msg       = 'Opponent takes a card from the discard pile.';
    G.mpAnim    = {type:'draw_discard'};
    render();
    return;
  }

  if (a==='call_cambio') {
    if (G.phase!=='joiner_draw' || G.cambioBy) return;
    G.cambioBy = 'joiner';
    G.msg      = 'Opponent called CAMBIO! You get one final turn.';
    showCambioExplosion();
    G.phase    = 'player_draw';
    render();
    return;
  }

  if (a==='discard') {
    if (G.phase!=='joiner_action') return;
    if (G.drawnFrom==='discard') return;
    const c = G.drawn; G.drawn = null;
    G.discard.push(c);
    const ab = G.drawnFrom==='deck' ? ability(c.rank) : null;
    G.msg = ab ? `Opponent discards ${fmt(c)} — ${ab.replace(/_/g,' ')} activated.`
               : `Opponent discards ${fmt(c)}.`;
    G.mpAnim = {type:'discard_drawn'};
    render();
    triggerSnapWindow(c, ()=>{
      if      (ab==='peek_own')   { G.phase='joiner_peek_own';  G.msg='Opponent peeking one of their cards…';  render(); }
      else if (ab==='blind_swap') { G.phase='joiner_bs_own';    G.msg='Opponent selecting card for blind swap…'; render(); }
      else if (ab==='peek_opp')   { G.phase='joiner_q_peek';    G.msg='Opponent selecting your card to peek…'; render(); }
      else if (ab==='peek_swap')  { G.phase='joiner_pk_own_first'; G.msg='Opponent selecting their card to peek at first…'; render(); }
      else endJoinerTurn();
    });
    return;
  }

  if (a==='swap') {
    if (G.phase!=='joiner_action') return;
    const idx = msg.idx;
    if (idx<0||idx>=G.cCards.length) return;
    const old = G.cCards[idx].card;
    G.cCards[idx] = {card:G.drawn, faceUp:false};
    delete G.jKnown[idx];
    G.drawn = null;
    G.discard.push(old);
    G.msg = `Opponent swaps their card ${idx+1} (discards ${fmt(old)}).`;
    G.mpAnim = {type:'swap_my', idx};
    render();
    triggerSnapWindow(old, ()=>endJoinerTurn());
    return;
  }

  if (a==='peek_own') {
    if (G.phase!=='joiner_peek_own') return;
    const idx = msg.idx;
    if (idx<0||idx>=G.cCards.length) return;
    G.jKnown[idx]    = G.cCards[idx].card.value;
    G.jPeekOwnIdx    = idx;
    G.phase          = 'joiner_peeking_own';
    G.msg            = `Opponent peeks at their card ${idx+1}.`;
    render();
    setTimeout(()=>{ G.jPeekOwnIdx=null; endJoinerTurn(); }, 2000);
    return;
  }

  if (a==='bs_own') {
    if (G.phase!=='joiner_bs_own') return;
    const idx = msg.idx;
    G.jBsOwnIdx = idx;
    delete G.jKnown[idx];
    G.phase = 'joiner_bs_opp';
    G.msg   = `Opponent selected their card ${idx+1}. Now picking your card…`;
    render();
    return;
  }

  if (a==='bs_opp') {
    if (G.phase!=='joiner_bs_opp') return;
    const oi  = G.jBsOwnIdx;
    const idx = msg.idx;
    if (oi==null||idx<0||idx>=G.pCards.length) return;
    G.jBsOwnIdx = null;
    const tmp = G.cCards[oi].card;
    G.cCards[oi] = {card:G.pCards[idx].card, faceUp:false};
    G.pCards[idx]= {card:tmp,                faceUp:false};
    delete G.pKnown[idx];
    G.msg = `Opponent blind-swapped their card ${oi+1} with your card ${idx+1}.`;
    G.mpAnim = {type:'bs', jpcIdx:oi, jccIdx:idx};
    render();
    endJoinerTurn();
    return;
  }

  if (a==='q_peek') {
    if (G.phase!=='joiner_q_peek') return;
    const idx = msg.idx;
    if (idx<0||idx>=G.pCards.length) return;
    G.jKnownOpp[idx] = G.pCards[idx].card.value;
    G.peekOppIdx     = idx;
    G.jQueenPeek     = true;
    G.phase          = 'joiner_peeking_opp';
    G.msg            = `Opponent peeks at your card ${idx+1}.`;
    render();
    setTimeout(()=>{ G.peekOppIdx=null; G.jQueenPeek=false; endJoinerTurn(); }, 2000);
    return;
  }

  if (a==='pk_own_first') {
    if (G.phase!=='joiner_pk_own_first') return;
    const idx = msg.idx;
    if (idx<0||idx>=G.cCards.length) return;
    G.jPeekOwnKingIdx = idx;
    G.jKnown[idx] = G.cCards[idx].card.value;
    G.phase = 'joiner_pk_opp';
    G.msg = `Opponent peeks at their card ${idx+1}. Now selecting your card to peek at…`;
    render();
    return;
  }

  if (a==='pk_opp') {
    if (G.phase!=='joiner_pk_opp') return;
    const idx = msg.idx;
    if (idx<0||idx>=G.pCards.length) return;
    G.jKnownOpp[idx] = G.pCards[idx].card.value;
    G.peekOppIdx     = idx;
    G.jQueenPeek     = false;
    G.phase          = 'joiner_peeking_opp';
    const ownCard = G.cCards[G.jPeekOwnKingIdx]?.card;
    G.msg = ownCard
      ? `Opponent peeks at your card ${idx+1}. Saw their card ${G.jPeekOwnKingIdx+1} (${fmt(ownCard)}). May swap…`
      : `Opponent peeks at your card ${idx+1}. May swap…`;
    render();
    return;
  }

  if (a==='king_swap') {
    if (G.phase!=='joiner_peeking_opp' || G.jQueenPeek) return;
    const jIdx = G.jPeekOwnKingIdx;
    const hIdx = G.peekOppIdx;
    if (jIdx==null||hIdx==null||jIdx<0||jIdx>=G.cCards.length) return;
    const tmp = G.pCards[hIdx].card;
    G.pCards[hIdx] = {card:G.cCards[jIdx].card, faceUp:false};
    G.cCards[jIdx] = {card:tmp,                  faceUp:false};
    delete G.pKnown[hIdx]; delete G.jKnown[jIdx];
    G.peekOppIdx = null; G.jPeekOwnKingIdx = null;
    G.msg = `Opponent swapped their card ${jIdx+1} with your card ${hIdx+1}.`;
    G.mpAnim = {type:'bs', jpcIdx:jIdx, jccIdx:hIdx};
    render();
    endJoinerTurn();
    return;
  }

  if (a==='king_skip') {
    if (G.phase!=='joiner_peeking_opp' || G.jQueenPeek) return;
    G.peekOppIdx = null; G.jPeekOwnKingIdx = null;
    G.msg = `Opponent peeked at both cards but didn't swap.`;
    render();
    endJoinerTurn();
    return;
  }

  if (a==='snap') {
    if (!G.snapActive || G.snapResolved) return;
    const idx = msg.idx;
    if (idx<0||idx>=G.cCards.length) return;
    const card = G.cCards[idx].card;
    if (card.value===G.snapValue) {
      G.snapResolved = true;
      clearTimeout(G._snapCompTimer); clearTimeout(G._snapWindowTimer);
      hideSnapTimer();
      showSnapBanner(`⚡ Opponent SNAPPED! Removes their card ${idx+1}`);
      mpSend({type:'snap_banner', text:`✓ SNAP! You removed card ${idx+1} (${fmt(card)})!`});
      removeComputerCard(idx);
      G.msg = `Opponent snapped and removed their card ${idx+1}!`;
      render();
      setTimeout(()=>{
        const el=document.getElementById('snap-banner'); if(el) el.remove();
        G.snapActive=false; G.snapValue=null;
        const fn=G.snapResumeFn; G.snapResumeFn=null;
        render(); if(fn) fn();
      }, 5000);
    } else {
      for(let i=0;i<2;i++){
        if(!G.deck.length) reshuffleDiscard();
        if(G.deck.length) G.cCards.push({card:G.deck.pop(), faceUp:false});
      }
      showSnapBanner(`Opponent wrong snap! +2 cards added to them`);
      mpSend({type:'snap_banner', text:`✗ Wrong snap! You got +2 penalty cards`});
      G.msg = `Opponent wrong snap! +2 penalty cards added to their hand.`;
      render();
    }
    return;
  }
}

// ── Multiplayer lobby UI ──────────────────────────────────

function mpValidateName() {
  const input = document.getElementById('mp-name-input');
  const errEl = document.getElementById('mp-name-error');
  const name  = input ? input.value.trim() : '';
  if (!name) {
    if (errEl) errEl.textContent = 'Please enter your name to continue';
    if (input) input.focus();
    return false;
  }
  MP.name = name;
  return true;
}

function showMultiplayerMenu() {
  if (window.location.protocol === 'file:') {
    document.getElementById('ga').innerHTML = `
      <div class="mp-lobby">
        <h2>Multiplayer</h2>
        <p>Multiplayer requires the Node.js server.<br>
           Run <strong>npm install</strong> then <strong>node server.js</strong>,<br>
           then open the displayed URL in both browsers.</p>
        <button class="btn-grey" onclick="showSplash()">&#8592; Back</button>
      </div>`;
    return;
  }
  document.getElementById('ga').innerHTML = `
    <div class="mp-lobby">
      <h2>Multiplayer</h2>
      <p>Both players must be on the same Wi-Fi network.<br>One player hosts, the other joins.</p>
      <div style="margin:4px 0 16px;width:100%;max-width:260px;">
        <input type="text" id="mp-name-input" maxlength="20" placeholder="Your name"
          style="width:100%;padding:10px 12px;font-size:1rem;border-radius:8px;border:2px solid rgba(255,255,255,0.25);background:rgba(255,255,255,0.12);color:#fff;outline:none;box-sizing:border-box;"
          onkeydown="if(event.key==='Enter'&&mpValidateName())mpHost()" />
        <div id="mp-name-error" style="color:#ff7070;font-size:0.8rem;min-height:1.2em;margin-top:4px;text-align:center;"></div>
      </div>
      <button class="btn-green" style="min-width:200px;" onclick="if(mpValidateName())mpHost()">&#127968; Host Game</button>
      <button class="btn-grey"  style="min-width:200px;" onclick="if(mpValidateName())mpShowJoinScreen()">&#128279; Join Game</button>
      <button class="btn-grey"  style="font-size:0.75rem;opacity:0.6;" onclick="showSplash()">&#8592; Back</button>
    </div>`;
  // Restore previously entered name if any
  if (MP.name) document.getElementById('mp-name-input').value = MP.name;
}

function showHostLobby(ip, port) {
  document.getElementById('ga').innerHTML = `
    <div class="mp-lobby">
      <h2>Hosting</h2>
      <p>Share this address with your opponent.<br>They must open it in their browser.</p>
      <div class="mp-address">
        <div class="lbl">Network address</div>
        <div class="val">http://${ip}:${port}</div>
      </div>
      <div class="mp-status" id="mp-status">Waiting for opponent to connect&#8230;</div>
      <button class="btn-green" id="mp-start-btn" onclick="mpStartGame()" disabled style="min-width:160px;">Start Game</button>
      <button class="btn-grey" style="font-size:0.75rem;opacity:0.6;" onclick="mpCancel()">&#8592; Cancel</button>
    </div>`;
}

function mpShowJoinScreen() {
  document.getElementById('ga').innerHTML = `
    <div class="mp-lobby">
      <h2>Join Game</h2>
      <p>Open your browser at the host&rsquo;s address,<br>then click Connect below.</p>
      <button class="btn-green" style="min-width:160px;" onclick="mpJoin()">Connect</button>
      <div class="mp-status" id="mp-status"></div>
      <button class="btn-grey" style="font-size:0.75rem;opacity:0.6;" onclick="showSplash()">&#8592; Back</button>
    </div>`;
}

function showDisconnectOverlay() {
  if (document.getElementById('disconnect-overlay')) return;
  const el = document.createElement('div');
  el.id = 'disconnect-overlay';
  el.innerHTML = `
    <h2>Disconnected</h2>
    <p>Your opponent has disconnected from the game.</p>
    <button class="btn-grey" onclick="location.reload()">Return to Menu</button>`;
  document.body.appendChild(el);
}

function showMPBadge(role) {
  const el = document.getElementById('mp-badge');
  el.textContent = role === 'host' ? 'HOST' : 'GUEST';
  el.className   = role === 'host' ? 'host-badge' : 'guest-badge';
  el.style.display = 'block';
}

function hideMPBadge() {
  document.getElementById('mp-badge').style.display = 'none';
}

// ── Joiner action senders ─────────────────────────────────

function joinerDraw() {
  if (!JV || JV.snapActive) return;
  mpSend({type:'action', action:'draw_deck'});
}
function joinerDrawDiscard() {
  if (!JV || JV.snapActive) return;
  mpSend({type:'action', action:'draw_discard'});
}
function joinerCallCambio() {
  if (!JV || JV.cambioBy) return;
  mpSend({type:'action', action:'call_cambio'});
}
function joinerDoDiscard() {
  if (!JV) return;
  mpSend({type:'action', action:'discard'});
}
function joinerClickMyCard(idx) {
  if (!JV) return;
  const {jPhase, snapActive} = JV;
  if (snapActive)                { mpSend({type:'action', action:'snap',         idx}); return; }
  if (jPhase==='action')         { mpSend({type:'action', action:'swap',         idx}); return; }
  if (jPhase==='peek_own')       { mpSend({type:'action', action:'peek_own',     idx}); return; }
  if (jPhase==='bs_own')         { mpSend({type:'action', action:'bs_own',       idx}); return; }
  if (jPhase==='pk_own_first')   { mpSend({type:'action', action:'pk_own_first', idx}); return; }
}
function joinerConfirmKingSwap() {
  mpSend({type:'action', action:'king_swap'});
}
function joinerClickOppCard(idx) {
  if (!JV) return;
  const {jPhase} = JV;
  if (jPhase==='bs_opp') { mpSend({type:'action', action:'bs_opp',  idx}); return; }
  if (jPhase==='q_peek') { mpSend({type:'action', action:'q_peek',  idx}); return; }
  if (jPhase==='pk_opp') { mpSend({type:'action', action:'pk_opp',  idx}); return; }
}
function joinerSkipKingSwap() {
  mpSend({type:'action', action:'king_skip'});
}
