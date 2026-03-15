// ── Cambio explosion ──────────────────────────────────────
function showCambioExplosion() {
  const existing = document.getElementById('cambio-explosion');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.id = 'cambio-explosion';
  el.innerHTML = '<div class="ce-flash"></div><div class="ce-text">CAMBIO!</div>';
  document.body.appendChild(el);
  setTimeout(() => { if (el.parentNode) el.remove(); }, 2500);
}

// ── Snap timer ────────────────────────────────────────────
let _snapTimerRAF = null;

function showSnapTimer(duration) {
  hideSnapTimer();
  const el = document.createElement('div');
  el.id = 'snap-timer';
  el.innerHTML = `
    <div class="snap-timer-label">SNAP</div>
    <div class="snap-timer-track"><div class="snap-timer-bar"></div></div>
    <div class="snap-timer-num">2.5s</div>`;
  document.body.appendChild(el);

  // Position to the right of the discard pile, vertically centred on it
  function positionTimer() {
    const discardEl = document.getElementById('discard-card')
                   || document.querySelector('.pile-wrap:last-child .card');
    if (discardEl) {
      const r = discardEl.getBoundingClientRect();
      el.style.left = (r.right + 10) + 'px';
      el.style.top  = (r.top + r.height / 2) + 'px';
      el.style.transform = 'translateY(-50%)';
    } else {
      el.style.left = '58%';
      el.style.top  = '50%';
      el.style.transform = 'translateY(-50%)';
    }
  }
  positionTimer();

  const bar    = el.querySelector('.snap-timer-bar');
  const numEl  = el.querySelector('.snap-timer-num');
  const start  = Date.now();

  function tick() {
    const remaining = Math.max(0, duration - (Date.now() - start));
    const secs = (remaining / 1000).toFixed(1);
    if (numEl) numEl.textContent = secs + 's';
    const color = remaining <= 1000 ? '#f44336' : remaining <= 1800 ? '#ff9800' : '#4caf50';
    if (bar)   bar.style.background = color;
    if (numEl) numEl.style.color = remaining <= 1000 ? '#f44336' : '#fff';
    if (remaining > 0) _snapTimerRAF = requestAnimationFrame(tick);
  }
  _snapTimerRAF = requestAnimationFrame(tick);
}

function hideSnapTimer() {
  if (_snapTimerRAF) { cancelAnimationFrame(_snapTimerRAF); _snapTimerRAF = null; }
  const el = document.getElementById('snap-timer');
  if (el) el.remove();
}

// ── Snap banner ───────────────────────────────────────────
function showSnapBanner(text) {
  let el=document.getElementById('snap-banner');
  if(el) el.remove();
  el=document.createElement('div'); el.id='snap-banner';
  el.innerHTML=text;
  document.body.appendChild(el);
}

// ── Animation helpers ─────────────────────────────────────
function getRect(id) {
  const el = document.getElementById(id);
  return el ? el.getBoundingClientRect() : null;
}

function flyCard(fromRect, toRect, onDone, duration=0.22) {
  const el = document.createElement('div');
  el.className = 'flying-card';
  el.innerHTML = '<div class="card-back"></div>';

  el.style.left   = fromRect.left + 'px';
  el.style.top    = fromRect.top  + 'px';
  el.style.width  = fromRect.width + 'px';
  el.style.height = fromRect.height + 'px';
  document.body.appendChild(el);

  el.getBoundingClientRect();
  el.style.transition = `left ${duration}s cubic-bezier(0.4,0,0.2,1), top ${duration}s cubic-bezier(0.4,0,0.2,1)`;
  el.style.left = toRect.left + 'px';
  el.style.top  = toRect.top  + 'px';

  el.addEventListener('transitionend', () => {
    el.remove();
    onDone();
  }, {once:true});
}

function animatePileToDraw(srcRect) {
  if (!srcRect) return;
  const dstEl = document.getElementById('drawn-card');
  if (!dstEl) return;
  const dstRect = dstEl.getBoundingClientRect();
  dstEl.style.visibility = 'hidden';
  flyCard(srcRect, dstRect, () => { dstEl.style.visibility = ''; });
}

function animateSwap(id1, id2, callback) {
  const el1=document.getElementById(id1);
  const el2=document.getElementById(id2);
  if (!el1||!el2) { callback(); return; }

  const r1=el1.getBoundingClientRect();
  const r2=el2.getBoundingClientRect();

  function makeFly(rect) {
    const f=document.createElement('div');
    f.className='flying-card';
    f.innerHTML='<div class="card-back"></div>';
    f.style.left=rect.left+'px'; f.style.top=rect.top+'px';
    f.style.width=rect.width+'px'; f.style.height=rect.height+'px';
    return f;
  }

  const fly1=makeFly(r1), fly2=makeFly(r2);
  el1.style.visibility='hidden';
  el2.style.visibility='hidden';
  document.body.appendChild(fly1);
  document.body.appendChild(fly2);

  fly1.getBoundingClientRect();

  const t='left 0.38s cubic-bezier(0.4,0,0.2,1), top 0.38s cubic-bezier(0.4,0,0.2,1)';
  fly1.style.transition=t; fly2.style.transition=t;
  fly1.style.left=r2.left+'px'; fly1.style.top=r2.top+'px';
  fly2.style.left=r1.left+'px'; fly2.style.top=r1.top+'px';

  setTimeout(()=>{
    fly1.remove(); fly2.remove();
    el1.style.visibility=''; el2.style.visibility='';
    callback();
  }, 420);
}

// ── Card element builders ─────────────────────────────────
function cardEl(slot, owner, idx) {
  const {card,faceUp}=slot;
  const isPeek=(owner==='player'&&G.peekingIdx===idx)
    ||(owner==='computer'&&G.peekingOppIdx===idx)
    ||(owner==='player'&&(G.phase==='player_pk_opp'||G.phase==='player_peeking_opp')&&G.peekOwnKingIdx===idx);
  const show=faceUp||isPeek;

  let sel=false,onclick='';
  if (G.snapActive && owner==='player') {
    sel=true; onclick=`playerTrySnap(${idx})`;
  } else {
    if (owner==='player') {
      if (['player_action','player_peek_own','player_bs_own','player_pk_own_first'].includes(G.phase))
        {sel=true; onclick=`clickPC(${idx})`;}
    }
    if (owner==='computer') {
      if (['player_bs_opp','player_pk_opp','player_q_peek'].includes(G.phase))
        {sel=true; onclick=`clickCC(${idx})`;}
    }
  }
  const selClass=(sel?'selectable ':'')+
    (G.phase==='player_bs_opp'&&owner==='player'&&G.bsOwnIdx===idx?'selected-own':'');

  const inner=show
    ?`<div class="card-face ${card.color}">
        <div class="card-corner">${card.rank}<span class="s">${card.suit}</span></div>
        <div class="card-mid">${card.rank==='Jo'?'🃏':card.suit}</div>
        <div class="card-corner bot">${card.rank}</div>
      </div>`
    :`<div class="card-back"></div>`;

  const scoreLbl=(G.phase==='game_over'||G.phase==='revealing')
    ?`<div class="card-score">${card.value}pts</div>`:'';

  const badge='';

  const showScore=G.phase==='game_over'||G.phase==='revealing';
  const numBadge=showScore?'':`<div class="card-num">${idx+1}</div>`;
  const cardId=`${owner==='player'?'pc':'cc'}-${idx}`;

  return `<div class="card ${selClass}" id="${cardId}" ${onclick?`onclick="${onclick}"`:''}>${inner}${badge}${scoreLbl}${numBadge}</div>`;
}

function pileCardEl(card,clickable,fn,id='') {
  if (!card) return `<div class="card-empty"></div>`;
  return `<div class="card${clickable?' pile-click':''}" ${id?`id="${id}"`:''}${fn?` onclick="${fn}"`:''}><div class="card-face ${card.color}">
    <div class="card-corner">${card.rank}<span class="s">${card.suit}</span></div>
    <div class="card-mid">${card.rank==='Jo'?'🃏':card.suit}</div>
    <div class="card-corner bot">${card.rank}</div>
  </div></div>`;
}
function deckCardEl(clickable) {
  if (!G.deck.length) return `<div class="card-empty"></div>`;
  return `<div class="card${clickable?' pile-click':''}" id="deck-card" ${clickable?'onclick="drawDeck()"':''}><div class="card-back"></div></div>`;
}

// ── Main render ───────────────────────────────────────────
function render() {
  const p=G.phase;
  const canDraw=p==='player_draw'&&!G.snapActive;
  const topDiscard=G.discard.length?G.discard[G.discard.length-1]:null;

  const ccHTML=G.cCards.map((s,i)=>cardEl(s,'computer',i)).join('');
  // Hide the drawn card from the host when it's the joiner's drawn card
  const drawnFaceDown = G.drawn && p.startsWith('joiner_');
  const drawnHTML=G.drawn?`<div class="drawn-wrap">
    <div class="pile-label" style="color:rgba(255,255,255,0.8)">Drawn</div>
    ${drawnFaceDown
      ? `<div class="card" id="drawn-card"><div class="card-back"></div></div>`
      : pileCardEl(G.drawn,false,null,'drawn-card')}</div>`:'';

  const middleHTML=`<div class="middle">
    <div class="pile-wrap" id="deck-pile">
      <div class="pile-label">Deck (${G.deck.length})</div>
      ${deckCardEl(canDraw)}
    </div>
    ${drawnHTML}
    <div class="pile-wrap">
      <div class="pile-label">Discard</div>
      ${topDiscard?pileCardEl(topDiscard,canDraw,canDraw?'drawDiscard()':null,'discard-card'):'<div class="card-empty"></div>'}
    </div>
  </div>`;

  let btnsHTML='';
  if (p==='player_draw'&&!G.snapActive) {
    btnsHTML=`
      <button class="btn-green" onclick="drawDeck()">Draw from Deck</button>
      <button class="btn-grey"  onclick="drawDiscard()" ${!G.discard.length?'disabled':''}>Take from Discard</button>
      <button class="btn-orange" onclick="callCambio()" ${G.cambioBy?'disabled':''}>Call Cambio!</button>`;
  } else if (p==='player_action') {
    const ab=G.drawn?ability(G.drawn.rank):null;
    let hint='';
    if(ab==='peek_own')   hint=' + peek own';
    if(ab==='blind_swap') hint=' + blind swap';
    if(ab==='peek_opp')   hint=' + peek opponent card';
    if(ab==='peek_swap')  hint=' + peek & swap';
    const canDiscard = G.drawnFrom==='deck';
    btnsHTML=canDiscard
      ? `<button class="btn-grey" onclick="doDiscard()">Discard${hint}</button>`
      : `<span style="font-size:0.8rem;color:rgba(255,255,255,0.45);font-style:italic;">Must swap — card taken from discard pile</span>`;
  } else if (p==='player_peeking_opp') {
    btnsHTML=`<button class="btn-green" onclick="confirmKingSwap()">Swap Cards</button><button class="btn-grey" onclick="skipKingSwap()">Keep</button>`;
  } else if (p==='game_over') {
    const ps=G.pScore,cs=G.cScore;
    btnsHTML=`
      <div class="scores" style="width:100%">
        <div class="score-block"><div class="score-lbl">${MP.active ? (MP.name || 'You') : 'You'}</div>
          <div class="score-num ${ps<cs?'win':ps>cs?'lose':'tie'}">${ps}</div></div>
        <div class="score-block"><div class="score-lbl">${MP.active ? (MP.opponentName || 'Opponent') : 'Computer'}</div>
          <div class="score-num ${cs<ps?'win':cs>ps?'lose':'tie'}">${cs}</div></div>
      </div>
      <button class="btn-green" onclick="showModeModal()">Play Again</button>`;
  }

  const playerPhases=['player_draw','player_action','player_peek_own','player_bs_own',
    'player_bs_opp','player_pk_opp','player_pk_own_first','player_q_peek','player_peeking_opp','peeking_own','animating'];
  const joinerPhases=['joiner_draw','joiner_action','joiner_peek_own','joiner_peeking_own',
    'joiner_bs_own','joiner_bs_opp','joiner_q_peek','joiner_pk_opp','joiner_peeking_opp'];
  const oppName  = MP.active ? (MP.opponentName || 'Opponent') : 'Computer';
  const myName   = MP.active ? (MP.name || 'You') : 'You';
  const oppLabel = MP.active ? `${oppName}'s Turn` : "Computer's Turn";
  const chipHTML = p==='computer_turn' || joinerPhases.includes(p)
    ? `<div class="turn-chip">${oppLabel}</div>`
    : playerPhases.includes(p) ? `<div class="turn-chip">${myName === 'You' ? 'Your' : myName+"'s"} Turn</div>` : '';

  const oppSectionLabel = MP.active
    ? `${oppName}'s Cards`
    : `Computer's Cards <span style="text-transform:capitalize;letter-spacing:1px;opacity:0.6;">(${G.difficulty})</span>`;

  const pcHTML=G.pCards.map((s,i)=>cardEl(s,'player',i)).join('');

  const showPlayerMove = G.playerMove && (p==='computer_turn' || joinerPhases.includes(p));
  const showLastMove   = G.lastMove   && p==='player_draw';

  document.getElementById('ga').innerHTML=`
    <div class="section">
      <div class="section-label">${oppSectionLabel}</div>
      <div class="cards-row">${ccHTML}</div>
    </div>
    <div class="section" style="background:transparent;padding:8px 0;">${middleHTML}</div>
    ${chipHTML}
    <div class="message">
      <div class="message-main">${G.msg}</div>
      ${showPlayerMove ? `<div class="message-last">${G.playerMove}</div>` : ''}
      ${showLastMove   ? `<div class="message-last">${G.lastMove}</div>`   : ''}
    </div>
    <div class="btns">${btnsHTML}</div>
    <div class="section">
      <div class="section-label">${myName === 'You' ? 'Your Cards' : myName+"'s Cards"}</div>
      <div class="cards-row">${pcHTML}</div>
    </div>`;

  // Push state to joiner after every render on host side
  if (MP.active && MP.role==='host' && MP.connected) mpSyncJoiner();
}

// ── Settings modal ────────────────────────────────────────
function showSettingsModal() {
  const inGame = G.phase !== 'start';
  // Sync difficulty buttons
  ['easy','medium','hard'].forEach(d => {
    const btn = document.getElementById('sdiff-' + d);
    btn.classList.toggle('diff-active', G.difficulty === d);
    btn.disabled = inGame;
  });
  document.getElementById('sdiff-note').style.display = inGame ? '' : 'none';
  // Sync theme buttons
  const theme = localStorage.getItem('cambio-theme') || 'classic';
  ['classic','dark','neon'].forEach(t => {
    document.getElementById('stheme-' + t).classList.toggle('active', theme === t);
  });
  document.getElementById('settings-overlay').classList.add('open');
}
function hideSettingsModal() {
  document.getElementById('settings-overlay').classList.remove('open');
}

// ── Mode modal ────────────────────────────────────────────
function showModeModal() {
  document.getElementById('mode-modal-overlay').classList.add('open');
}
function hideModeModal() {
  document.getElementById('mode-modal-overlay').classList.remove('open');
}

// ── Card theme ────────────────────────────────────────────
function applyTheme(name) {
  document.body.classList.remove('theme-classic','theme-dark','theme-neon');
  if (name === 'dark' || name === 'neon') document.body.classList.add('theme-' + name);
}
function setTheme(name) {
  applyTheme(name);
  localStorage.setItem('cambio-theme', name);
  ['classic','dark','neon'].forEach(t => {
    const btn = document.getElementById('stheme-' + t);
    if (btn) btn.classList.toggle('active', t === name);
  });
  if (G.phase === 'start') showSplash();
}

// ── Splash screen ─────────────────────────────────────────
function showSplash() {
  G.phase='start';
  lockDifficulty(false);
  const deckCards = [
    {rot:-8,tx:-8},{rot:-4,tx:-4},{rot:0,tx:0},{rot:4,tx:4},{rot:8,tx:8}
  ];
  const stackHTML = deckCards.map(({rot,tx})=>
    `<div class="card" style="transform:rotate(${rot}deg) translateX(${tx}px)"><div class="card-back"></div></div>`
  ).join('');
  document.getElementById('ga').innerHTML = `
    <div class="section">
      <div class="section-label">Computer's Cards</div>
      <div class="cards-row">${'<div class="card-empty"></div>'.repeat(4)}</div>
    </div>
    <div class="section" style="background:transparent;padding:8px 0;">
      <div class="middle">
        <div class="pile-wrap"><div class="pile-label">Deck</div><div class="card-empty"></div></div>
        <div class="pile-wrap"><div class="pile-label">Discard</div><div class="card-empty"></div></div>
      </div>
    </div>
    <div class="splash">
      <div class="splash-deck">${stackHTML}</div>
      <div class="splash-text">Press New Game to start</div>
    </div>
    <div class="section">
      <div class="section-label">Your Cards</div>
      <div class="cards-row">${'<div class="card-empty"></div>'.repeat(4)}</div>
    </div>
  `;
}

function toggleRules() {
  document.getElementById('rules-overlay').classList.toggle('open');
}

// ── Joiner-side rendering ─────────────────────────────────

function joinerCardEl(slot, owner, idx, view) {
  const {jPhase, jKnown, bsOwnIdx, peekingIdx, peekingOppIdx, snapActive} = view;
  const {card, faceUp} = slot;

  const isPeek = (owner==='mine' && peekingIdx===idx)
              || (owner==='opp'  && peekingOppIdx===idx);
  const show   = faceUp || isPeek || (owner==='opp' && card && faceUp);

  let sel=false, onclick='';
  if (snapActive && owner==='mine') {
    sel=true; onclick=`joinerClickMyCard(${idx})`;
  } else if (owner==='mine') {
    if (['action','peek_own','bs_own','pk_own_first'].includes(jPhase))
      { sel=true; onclick=`joinerClickMyCard(${idx})`; }
  } else {
    if (['bs_opp','q_peek','pk_opp'].includes(jPhase))
      { sel=true; onclick=`joinerClickOppCard(${idx})`; }
  }

  const selClass = (sel?'selectable ':'')
    + (jPhase==='bs_opp' && owner==='mine' && bsOwnIdx===idx ? 'selected-own' : '');

  const inner = (show && card)
    ? `<div class="card-face ${card.color}">
        <div class="card-corner">${card.rank}<span class="s">${card.suit}</span></div>
        <div class="card-mid">${card.rank==='Jo'?'🃏':card.suit}</div>
        <div class="card-corner bot">${card.rank}</div>
       </div>`
    : `<div class="card-back"></div>`;

  const isEnd   = jPhase==='game_over'||jPhase==='revealing';
  const scoreLbl= isEnd && card ? `<div class="card-score">${card.value}pts</div>` : '';
  const badge   = '';
  const numBadge= isEnd ? '' : `<div class="card-num">${idx+1}</div>`;
  const cardId  = (owner==='mine'?'jpc':'jcc')+'-'+idx;

  return `<div class="card ${selClass.trim()}" id="${cardId}" ${onclick?`onclick="${onclick}"`:''}>${inner}${badge}${scoreLbl}${numBadge}</div>`;
}

function joinerRunDealAnimation() {
  const order = ['c0','p0','c1','p1','c2','p2','c3','p3'];
  const deckEl = document.querySelector('#deck-pile .card');
  if (!deckEl) return;
  const deckRect = deckEl.getBoundingClientRect();
  let i = 0;
  function dealNext() {
    if (i >= order.length) {
      setTimeout(joinerShowDiscardCard, 250);
      return;
    }
    const slotEl = document.getElementById('slot-' + order[i]);
    if (!slotEl) { i++; dealNext(); return; }
    const slotRect = slotEl.getBoundingClientRect();
    i++;
    flyCard(deckRect, slotRect, () => {
      slotEl.style.visibility = 'visible';
      slotEl.style.animation = 'card-land 0.15s ease-out';
      dealNext();
    });
  }
  dealNext();
}

function joinerShowDiscardCard() {
  const discardSlot = document.getElementById('discard-slot');
  if (!discardSlot) return;
  const deckEl = document.querySelector('#deck-pile .card');
  if (!deckEl) return;
  const deckRect    = deckEl.getBoundingClientRect();
  const discardRect = discardSlot.getBoundingClientRect();
  flyCard(deckRect, discardRect, () => {
    discardSlot.outerHTML = `<div class="card" id="discard-shown"><div class="card-face black"><div class="card-corner">?</div><div class="card-mid">?</div><div class="card-corner bot">?</div></div></div>`;
  });
}

function joinerShowShuffleOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'shuffle-overlay';
  let cardsHTML = '';
  for (let i = 0; i < 6; i++) {
    const delay = (i * 0.06).toFixed(2);
    const baseRot = (i - 3) * 3;
    cardsHTML += `<div class="shuffle-card" style="animation-delay:${delay}s;transform:rotate(${baseRot}deg)"><div class="card-back"></div></div>`;
  }
  overlay.innerHTML = `<div id="shuffle-deck">${cardsHTML}<div id="shuffle-label">Shuffling…</div></div>`;
  document.body.appendChild(overlay);
  setTimeout(() => {
    if (overlay.parentNode) overlay.remove();
    joinerRunDealAnimation();
  }, 1400);
}

let _jvPrevCambioBy = null;
function renderJoinerView(view) {
  if (!view) return;
  const {myCards, oppCards, deckCount, discard, drawn, drawnFrom,
         jPhase, jMsg, snapActive, snapValue, cambioBy,
         pScore, jScore, lastMove, anim,
         hostName, joinerName} = view;

  // Show explosion when cambio is first called
  if (cambioBy && !_jvPrevCambioBy) showCambioExplosion();
  _jvPrevCambioBy = cambioBy;
  const jOppLabel = (hostName   || MP.opponentName) ? `${hostName || MP.opponentName}'s Cards`   : "Opponent's Cards";
  const jMyLabel  = (joinerName || MP.name)         ? `${joinerName || MP.name}'s Cards`         : "Your Cards";

  // Show shuffling screen while host deals
  if (jPhase === 'dealing') {
    if (!document.getElementById('shuffle-overlay')) {
      const n = (oppCards && oppCards.length) || 4;
      const oppSlots = Array(n).fill(0).map((_,i) =>
        `<div class="card" id="slot-p${i}" style="visibility:hidden"><div class="card-back"></div></div>`).join('');
      const mySlots = Array(n).fill(0).map((_,i) =>
        `<div class="card" id="slot-c${i}" style="visibility:hidden"><div class="card-back"></div></div>`).join('');
      document.getElementById('ga').innerHTML = `
        <div class="section">
          <div class="section-label">${jOppLabel}</div>
          <div class="cards-row">${oppSlots}</div>
        </div>
        <div class="section" style="background:transparent;padding:8px 0;">
          <div class="middle">
            <div class="pile-wrap" id="deck-pile"><div class="pile-label">Deck</div><div class="card"><div class="card-back"></div></div></div>
            <div class="pile-wrap"><div class="pile-label">Discard</div><div class="card-empty" id="discard-slot"></div></div>
          </div>
        </div>
        <div class="message">Shuffling and dealing...</div>
        <div class="btns"></div>
        <div class="section">
          <div class="section-label">${jMyLabel}</div>
          <div class="cards-row">${mySlots}</div>
        </div>`;
      joinerShowShuffleOverlay();
    }
    return;
  }

  // Remove dealing overlay if still showing
  const dealOverlay = document.getElementById('shuffle-overlay');
  if (dealOverlay) dealOverlay.remove();

  // Capture pre-render rects for animation
  let animSrcRect = null;
  let animOldSlotRect = null;
  if (anim) {
    if      (anim.type === 'draw_deck')    animSrcRect = getRect('j-deck-card');
    else if (anim.type === 'draw_discard') animSrcRect = getRect('j-discard-card');
    else {
      animSrcRect = getRect('j-drawn-card');
      if (anim.type === 'swap_my')  animOldSlotRect = getRect('jpc-' + anim.idx);
      if (anim.type === 'swap_opp') animOldSlotRect = getRect('jcc-' + anim.idx);
    }
  }

  const topDiscard = discard && discard.length ? discard[discard.length-1] : null;
  const canDraw    = jPhase==='draw' && !snapActive;

  const oppHTML = (oppCards||[]).map((s,i)=>joinerCardEl(s,'opp',i,view)).join('');
  const myHTML  = (myCards||[]).map((s,i)=>joinerCardEl(s,'mine',i,view)).join('');

  const deckEl = deckCount>0
    ? `<div class="card${canDraw?' pile-click':''}" id="j-deck-card" ${canDraw?'onclick="joinerDraw()"':''}><div class="card-back"></div></div>`
    : `<div class="card-empty"></div>`;

  const drawnHTML = drawn
    ? `<div class="drawn-wrap">
         <div class="pile-label" style="color:rgba(255,255,255,0.8)">Drawn</div>
         ${pileCardEl(drawn,false,null,'j-drawn-card')}
       </div>`
    : '';

  const middleHTML = `<div class="middle">
    <div class="pile-wrap">
      <div class="pile-label">Deck (${deckCount})</div>${deckEl}
    </div>
    ${drawnHTML}
    <div class="pile-wrap">
      <div class="pile-label">Discard</div>
      ${topDiscard ? pileCardEl(topDiscard,canDraw,canDraw?'joinerDrawDiscard()':null,'j-discard-card') : '<div class="card-empty"></div>'}
    </div>
  </div>`;

  const myTurnPhases = ['draw','action','peek_own','peeking_own','bs_own','bs_opp',
                        'q_peek','q_peek_result','pk_opp','peeking_opp'];
  const jMyTurnLabel  = (joinerName || MP.name)         ? `${joinerName || MP.name}'s Turn`         : 'Your Turn';
  const jOppTurnLabel = (hostName   || MP.opponentName) ? `${hostName || MP.opponentName}'s Turn`   : "Opponent's Turn";
  const chipHTML = myTurnPhases.includes(jPhase)
    ? `<div class="turn-chip">${jMyTurnLabel}</div>`
    : (jPhase!=='game_over'&&jPhase!=='revealing'&&jPhase!=='dealing')
      ? `<div class="turn-chip">${jOppTurnLabel}</div>` : '';

  let btnsHTML = '';
  if (jPhase==='draw' && !snapActive) {
    btnsHTML = `
      <button class="btn-green"  onclick="joinerDraw()">Draw from Deck</button>
      <button class="btn-grey"   onclick="joinerDrawDiscard()" ${!topDiscard?'disabled':''}>Take from Discard</button>
      <button class="btn-orange" onclick="joinerCallCambio()"  ${cambioBy?'disabled':''}>Call Cambio!</button>`;
  } else if (jPhase==='action') {
    const ab = drawnFrom==='deck' ? ability(drawn?.rank) : null;
    let hint='';
    if(ab==='peek_own')   hint=' + peek own';
    if(ab==='blind_swap') hint=' + blind swap';
    if(ab==='peek_opp')   hint=' + peek opponent';
    if(ab==='peek_swap')  hint=' + peek & swap';
    btnsHTML = drawnFrom==='deck'
      ? `<button class="btn-grey" onclick="joinerDoDiscard()">Discard${hint}</button>`
      : `<span style="font-size:0.8rem;color:rgba(255,255,255,0.45);font-style:italic;">Must swap — card taken from discard pile</span>`;
  } else if (jPhase==='peeking_opp') {
    btnsHTML = `<button class="btn-green" onclick="joinerConfirmKingSwap()">Swap Cards</button><button class="btn-grey" onclick="joinerSkipKingSwap()">Keep</button>`;
  } else if (jPhase==='game_over') {
    const myWin=jScore<pScore, oppWin=pScore<jScore;
    btnsHTML = `
      <div class="scores" style="width:100%">
        <div class="score-block"><div class="score-lbl">${joinerName || MP.name || 'You'}</div>
          <div class="score-num ${myWin?'win':oppWin?'lose':'tie'}">${jScore}</div></div>
        <div class="score-block"><div class="score-lbl">${hostName || MP.opponentName || 'Opponent'}</div>
          <div class="score-num ${oppWin?'win':myWin?'lose':'tie'}">${pScore}</div></div>
      </div>
      <div style="font-size:0.78rem;color:rgba(255,255,255,0.5);margin-top:4px;">Waiting for host to start a new game…</div>`;
  }

  document.getElementById('ga').innerHTML = `
    <div class="section">
      <div class="section-label">${jOppLabel}</div>
      <div class="cards-row">${oppHTML}</div>
    </div>
    <div class="section" style="background:transparent;padding:8px 0;">${middleHTML}</div>
    ${chipHTML}
    <div class="message">
      <div class="message-main">${jMsg||''}</div>
      ${lastMove && myTurnPhases.includes(jPhase) ? `<div class="message-last">${lastMove}</div>` : ''}
    </div>
    <div class="btns">${btnsHTML}</div>
    <div class="section">
      <div class="section-label">${jMyLabel}</div>
      <div class="cards-row">${myHTML}</div>
    </div>`;

  // ── Post-render animations ─────────────────────────────
  if (!anim) return;
  if (anim.type === 'draw_deck' || anim.type === 'draw_discard') {
    if (!animSrcRect) return;
    const dstEl = document.getElementById('j-drawn-card');
    if (!dstEl) return;
    const dstRect = dstEl.getBoundingClientRect();
    dstEl.style.visibility = 'hidden';
    flyCard(animSrcRect, dstRect, () => { dstEl.style.visibility = ''; });
  } else if (anim.type === 'discard_drawn') {
    if (!animSrcRect) return;
    const dstEl = document.getElementById('j-discard-card');
    if (!dstEl) return;
    const dstRect = dstEl.getBoundingClientRect();
    dstEl.style.visibility = 'hidden';
    flyCard(animSrcRect, dstRect, () => { dstEl.style.visibility = ''; });
  } else if (anim.type === 'swap_my' || anim.type === 'swap_opp') {
    if (!animSrcRect) return;
    const dstId = anim.type === 'swap_my' ? 'jpc-' + anim.idx : 'jcc-' + anim.idx;
    const dstEl = document.getElementById(dstId);
    if (!dstEl) return;
    const dstRect    = dstEl.getBoundingClientRect();
    const discardEl  = document.getElementById('j-discard-card');
    const discardRect = discardEl ? discardEl.getBoundingClientRect() : null;
    dstEl.style.visibility = 'hidden';
    // Old card flies to discard simultaneously (fire-and-forget)
    if (animOldSlotRect && discardRect) flyCard(animOldSlotRect, discardRect, ()=>{}, 0.45);
    flyCard(animSrcRect, dstRect, () => { dstEl.style.visibility = ''; }, 0.45);
  } else if (anim.type === 'bs') {
    const el1 = document.getElementById('jpc-' + anim.jpcIdx);
    const el2 = document.getElementById('jcc-' + anim.jccIdx);
    if (!el1 || !el2) return;
    const r1 = el1.getBoundingClientRect();
    const r2 = el2.getBoundingClientRect();
    function jMakeFly(rect) {
      const f = document.createElement('div');
      f.className = 'flying-card';
      f.innerHTML = '<div class="card-back"></div>';
      f.style.left = rect.left + 'px'; f.style.top = rect.top + 'px';
      f.style.width = rect.width + 'px'; f.style.height = rect.height + 'px';
      return f;
    }
    const fly1 = jMakeFly(r1), fly2 = jMakeFly(r2);
    el1.style.visibility = 'hidden'; el2.style.visibility = 'hidden';
    document.body.appendChild(fly1); document.body.appendChild(fly2);
    fly1.getBoundingClientRect();
    const tr = 'left 0.38s cubic-bezier(0.4,0,0.2,1), top 0.38s cubic-bezier(0.4,0,0.2,1)';
    fly1.style.transition = tr; fly2.style.transition = tr;
    fly1.style.left = r2.left + 'px'; fly1.style.top = r2.top + 'px';
    fly2.style.left = r1.left + 'px'; fly2.style.top = r1.top + 'px';
    setTimeout(() => { fly1.remove(); fly2.remove(); el1.style.visibility = ''; el2.style.visibility = ''; }, 420);
  }
}

// ── Init ─────────────────────────────────────────────────
applyTheme(localStorage.getItem('cambio-theme') || 'classic');
showSplash();
