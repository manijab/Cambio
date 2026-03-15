// ── Card definitions ─────────────────────────────────────
const SUITS = [
  {sym:'♠',color:'black'},{sym:'♥',color:'red'},
  {sym:'♦',color:'red'},{sym:'♣',color:'black'}
];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

function cardVal(rank, suit) {
  if (rank==='Jo') return 0;
  if (rank==='A')  return 1;
  if (rank==='K')  return suit==='♥' ? -1 : 10;
  if (rank==='J'||rank==='Q') return 10;
  return parseInt(rank,10);
}
function ability(rank) {
  if (rank==='10') return 'peek_own';
  if (rank==='J') return 'blind_swap';
  if (rank==='Q') return 'peek_opp';
  if (rank==='K') return 'peek_swap';
  return null;
}
function makeDeck() {
  const d=[];let id=0;
  for (const {sym,color} of SUITS)
    for (const r of RANKS)
      d.push({id:id++,rank:r,suit:sym,color,value:cardVal(r,sym)});
  d.push({id:id++,rank:'Jo',suit:'★',color:'black',value:0});
  d.push({id:id++,rank:'Jo',suit:'★',color:'red',value:0});
  return d;
}
function shuffle(a) {
  const b=[...a];
  for(let i=b.length-1;i>0;i--){const j=0|Math.random()*(i+1);[b[i],b[j]]=[b[j],b[i]];}
  return b;
}

// ── Game state ───────────────────────────────────────────
const G = {
  deck:[],discard:[],
  pCards:[],cCards:[],
  drawn:null,
  phase:'start',
  cambioBy:null,
  msg:'',
  cKnown:{},cKnownP:{},pKnown:{},
  bsOwnIdx:null,peekOppIdx:null,
  peekingIdx:null,peekingOppIdx:null,
  turns:0,pScore:0,cScore:0,
  animating:false,
  lastMove:'',
  playerMove:'',
  difficulty:'easy',
  snapActive:false,
  snapValue:null,
  snapResolved:false,
  snapResumeFn:null,
  _snapCompTimer:null,
  _snapWindowTimer:null,
  // Multiplayer extras (host tracks joiner knowledge)
  jKnown:{},        // joiner's memory of their own cards (indexes into cCards)
  jKnownOpp:{},     // joiner's memory of host's cards   (indexes into pCards)
  jBsOwnIdx:null,   // joiner's selected card for blind-swap (J)
  jPeekOwnIdx:null, // joiner's card being peeked          (10)
  jQueenPeek:false, // true = queen peek (no swap), false = king peek
  mpAnim:null       // animation hint sent to joiner on next sync
};

// ── Difficulty ───────────────────────────────────────────
function setDifficulty(d) {
  if (G.phase !== 'start') return;
  G.difficulty = d;
  document.querySelectorAll('.diff-btn').forEach(b => {
    b.classList.remove('diff-active');
  });
  const btn = document.getElementById('sdiff-'+d);
  if (btn) btn.classList.add('diff-active', d);
}

function lockDifficulty(locked) {
  document.querySelectorAll('.diff-btn').forEach(b => { b.disabled = locked; });
}

// ── Start new game with animation ────────────────────────
function startNewGame() {
  if (G.animating) return;
  G.animating = true;
  document.getElementById('new-game-btn').disabled = true;

  // Prepare card data
  const deck = shuffle(makeDeck());
  G.pCards = deck.slice(0,4).map(c=>({card:c,faceUp:false}));
  G.cCards = deck.slice(4,8).map(c=>({card:c,faceUp:false}));
  G.deck   = deck.slice(8);
  G.discard= [G.deck.pop()];
  G.drawn=null; G.phase='dealing'; G.cambioBy=null;
  G.cKnown={}; G.cKnownP={}; G.pKnown={}; G.lastMove=''; G.playerMove='';
  G.bsOwnIdx=null; G.peekOppIdx=null; G.peekOwnKingIdx=null;
  G.peekingIdx=null; G.peekingOppIdx=null; G.turns=0;
  G.jKnown={}; G.jKnownOpp={}; G.jBsOwnIdx=null; G.jPeekOwnIdx=null; G.jPeekOwnKingIdx=null; G.jQueenPeek=false; G.mpAnim=null;
  clearTimeout(G._snapCompTimer); clearTimeout(G._snapWindowTimer);
  G.snapActive=false; G.snapValue=null; G.snapResolved=false; G.snapResumeFn=null;
  const snapBanner=document.getElementById('snap-banner'); if(snapBanner) snapBanner.remove();
  G.msg='Dealing...';
  lockDifficulty(true);

  // Render the layout with hidden card slots
  renderDealing();

  // Notify joiner that dealing has started (renderDealing skips the normal render/sync path)
  if (MP.active && MP.role === 'host' && MP.connected) mpSyncJoiner();

  // Short pause then show shuffle overlay
  setTimeout(showShuffleOverlay, 80);
}

function renderDealing() {
  const compSlots = G.cCards.map((_,i)=>
    `<div class="card" id="slot-c${i}" style="visibility:hidden"><div class="card-back"></div></div>`
  ).join('');
  const playerSlots = G.pCards.map((_,i)=>
    `<div class="card" id="slot-p${i}" style="visibility:hidden"><div class="card-back"></div></div>`
  ).join('');
  const dealOppLabel = MP.active ? (MP.opponentName ? MP.opponentName+"'s Cards" : "Opponent's Cards") : "Computer's Cards";
  const dealMyLabel  = MP.active ? (MP.name ? MP.name+"'s Cards" : "Your Cards") : "Your Cards";
  document.getElementById('ga').innerHTML = `
    <div class="section">
      <div class="section-label">${dealOppLabel}</div>
      <div class="cards-row">${compSlots}</div>
    </div>
    <div class="section" style="background:transparent;padding:8px 0;">
      <div class="middle">
        <div class="pile-wrap" id="deck-pile">
          <div class="pile-label">Deck</div>
          <div class="card"><div class="card-back"></div></div>
        </div>
        <div class="pile-wrap">
          <div class="pile-label">Discard</div>
          <div class="card-empty" id="discard-slot"></div>
        </div>
      </div>
    </div>
    <div class="message">Shuffling and dealing...</div>
    <div class="btns"></div>
    <div class="section">
      <div class="section-label">${dealMyLabel}</div>
      <div class="cards-row">${playerSlots}</div>
    </div>
  `;
}

function showShuffleOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'shuffle-overlay';
  let cardsHTML = '';
  for (let i=0; i<6; i++) {
    const delay = (i * 0.06).toFixed(2);
    const baseRot = (i-3)*3;
    cardsHTML += `<div class="shuffle-card" style="animation-delay:${delay}s;transform:rotate(${baseRot}deg)"><div class="card-back"></div></div>`;
  }
  overlay.innerHTML = `
    <div id="shuffle-deck">
      ${cardsHTML}
      <div id="shuffle-label">Shuffling…</div>
    </div>
  `;
  document.body.appendChild(overlay);

  setTimeout(() => {
    overlay.remove();
    runDealAnimation();
  }, 1400);
}

function runDealAnimation() {
  const order = ['c0','p0','c1','p1','c2','p2','c3','p3'];
  const deckEl = document.querySelector('#deck-pile .card');
  const deckRect = deckEl.getBoundingClientRect();

  let i = 0;
  function dealNext() {
    if (i >= order.length) {
      setTimeout(showDiscardCard, 250);
      return;
    }
    const slotId = 'slot-' + order[i];
    const slotEl = document.getElementById(slotId);
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

function showDiscardCard() {
  const discardSlot = document.getElementById('discard-slot');
  if (!discardSlot) { finishDealing(); return; }

  const deckEl = document.querySelector('#deck-pile .card');
  const deckRect = deckEl.getBoundingClientRect();
  const discardRect = discardSlot.getBoundingClientRect();

  const discardCard = G.discard[0];

  flyCard(deckRect, discardRect, () => {
    const inner = `<div class="card-face ${discardCard.color}">
      <div class="card-corner">${discardCard.rank}<span class="s">${discardCard.suit}</span></div>
      <div class="card-mid">${discardCard.rank==='Jo'?'🃏':discardCard.suit}</div>
      <div class="card-corner bot">${discardCard.rank}</div>
    </div>`;
    discardSlot.outerHTML = `<div class="card" id="discard-shown">${inner}</div>`;
    setTimeout(finishDealing, 350);
  });
}

function finishDealing() {
  G.animating = false;
  document.getElementById('new-game-btn').disabled = false;
  if (MP.active && Math.random() < 0.5) {
    G.phase = 'joiner_draw';
    G.msg = 'Waiting for opponent... (they go first!)';
  } else if (!MP.active && Math.random() < 0.5) {
    G.phase = 'computer_turn';
    G.msg = 'Computer goes first!';
    render();
    setTimeout(compTurn, 1800);
    return;
  } else {
    G.phase = 'player_draw';
    G.msg = 'Your turn. Draw from the deck or discard pile, or call Cambio.';
  }
  render();
}

// ── Snap helpers ─────────────────────────────────────────
function removePlayerCard(idx) {
  G.pCards.splice(idx,1);
  const kn={};
  Object.entries(G.pKnown).forEach(([k,v])=>{const ki=+k;if(ki<idx)kn[ki]=v;else if(ki>idx)kn[ki-1]=v;});
  G.pKnown=kn;
  if (MP.active) {
    const ko={};
    Object.entries(G.jKnownOpp).forEach(([k,v])=>{const ki=+k;if(ki<idx)ko[ki]=v;else if(ki>idx)ko[ki-1]=v;});
    G.jKnownOpp=ko;
  }
}
function removeComputerCard(idx) {
  G.cCards.splice(idx,1);
  const kn={},kp={};
  Object.entries(G.cKnown).forEach(([k,v])=>{const ki=+k;if(ki<idx)kn[ki]=v;else if(ki>idx)kn[ki-1]=v;});
  Object.entries(G.cKnownP).forEach(([k,v])=>{const ki=+k;if(ki<idx)kp[ki]=v;else if(ki>idx)kp[ki-1]=v;});
  G.cKnown=kn; G.cKnownP=kp;
  if (MP.active) {
    const jk={};
    Object.entries(G.jKnown).forEach(([k,v])=>{const ki=+k;if(ki<idx)jk[ki]=v;else if(ki>idx)jk[ki-1]=v;});
    G.jKnown=jk;
  }
}
function closeSnapWindow() {
  if (!G.snapActive) return;
  G.snapActive=false; G.snapValue=null;
  clearTimeout(G._snapCompTimer); clearTimeout(G._snapWindowTimer);
  hideSnapTimer();
  const el=document.getElementById('snap-banner'); if(el) el.remove();
  const fn=G.snapResumeFn; G.snapResumeFn=null;
  render();
  if(fn) fn();
}
function triggerSnapWindow(card, resumeFn) {
  if(['start','dealing','game_over','revealing'].includes(G.phase)){ resumeFn(); return; }
  G.snapActive=true; G.snapValue=card.value; G.snapResolved=false; G.snapResumeFn=resumeFn;
  render();
  showSnapTimer(2500);
  if (!MP.active) {
    const delay=G.difficulty==='easy'?3000:G.difficulty==='hard'?500:2000;
    G._snapCompTimer=setTimeout(()=>{ if(!G.snapResolved&&G.snapActive) computerTrySnap(); },delay);
  }
  G._snapWindowTimer=setTimeout(()=>{ closeSnapWindow(); },2500);
}
function playerTrySnap(idx) {
  if(!G.snapActive||G.snapResolved) return;
  const card=G.pCards[idx].card;
  if(card.value===G.snapValue) {
    G.snapResolved=true;
    clearTimeout(G._snapCompTimer); clearTimeout(G._snapWindowTimer);
    hideSnapTimer();
    showSnapBanner(`✓ SNAP! You removed card ${idx+1} (${fmt(card)})!`);
    if(MP.active) mpSend({type:'snap_banner', text:`⚡ Opponent SNAPPED! Removed their card ${idx+1}`});
    removePlayerCard(idx);
    G.msg=`You snapped and removed card ${idx+1}!`;
    render();
    setTimeout(()=>{
      const el=document.getElementById('snap-banner'); if(el) el.remove();
      G.snapActive=false; G.snapValue=null;
      const fn=G.snapResumeFn; G.snapResumeFn=null;
      render(); if(fn) fn();
    },5000);
  } else {
    for(let i=0;i<2;i++){if(!G.deck.length)reshuffleDiscard();if(G.deck.length)G.pCards.push({card:G.deck.pop(),faceUp:false});}
    showSnapBanner(`✗ Wrong snap! You got +2 penalty cards`);
    if(MP.active) mpSend({type:'snap_banner', text:`⚠ Opponent wrong snap! +2 cards added to them`});
    G.msg=`Wrong snap! +2 penalty cards added to your hand.`;
    render();
  }
}
function computerTrySnap() {
  if(!G.snapActive||G.snapResolved) return;
  const match=Object.entries(G.cKnown).find(([,v])=>v===G.snapValue);
  if(!match) return;
  const idx=+match[0];
  G.snapResolved=true;
  clearTimeout(G._snapCompTimer); clearTimeout(G._snapWindowTimer);
  hideSnapTimer();
  showSnapBanner(`⚡ Computer SNAPPED! Removes its card ${idx+1}`);
  removeComputerCard(idx);
  G.msg=`Computer snapped and removed its card ${idx+1}!`;
  render();
  setTimeout(()=>{
    const el=document.getElementById('snap-banner'); if(el) el.remove();
    G.snapActive=false; G.snapValue=null;
    const fn=G.snapResumeFn; G.snapResumeFn=null;
    render(); if(fn) fn();
  },5000);
}

// ── Player actions ───────────────────────────────────────
function drawDeck() {
  if (G.snapActive) return;
  if (G.phase!=='player_draw') return;
  if (!G.deck.length) reshuffleDiscard();
  if (!G.deck.length) { endGame(); return; }
  const srcRect = getRect('deck-card');
  G.drawn = G.deck.pop();
  G.drawnFrom = 'deck';
  G.phase = 'player_action';
  const ab = ability(G.drawn.rank);
  let hint='';
  if (ab==='peek_own')   hint=' [Special: peek own if discarded]';
  if (ab==='blind_swap') hint=' [Special: blind swap if discarded]';
  if (ab==='peek_opp')   hint=' [Special: peek opponent card if discarded]';
  if (ab==='peek_swap')  hint=' [Special: peek & swap if discarded]';
  G.msg=`You drew ${fmt(G.drawn)}. Click one of your cards to swap, or discard.${hint}`;
  if (MP.active) G.mpAnim = {type:'draw_deck'};
  render();
  animatePileToDraw(srcRect);
}
function drawDiscard() {
  if (G.snapActive) return;
  if (G.phase!=='player_draw'||!G.discard.length) return;
  const srcRect = getRect('discard-card');
  G.drawn = G.discard.pop();
  G.drawnFrom = 'discard';
  G.phase = 'player_action';
  G.msg=`You took ${fmt(G.drawn)} from the discard pile. You must swap it with one of your cards.`;
  if (MP.active) G.mpAnim = {type:'draw_discard'};
  render();
  animatePileToDraw(srcRect);
}
function doDiscard() {
  if (G.snapActive) return;
  if (G.phase!=='player_action') return;
  if (G.drawnFrom==='discard') return;
  const c=G.drawn; G.drawn=null;
  G.discard.push(c);
  const ab = G.drawnFrom==='deck' ? ability(c.rank) : null;
  if      (ab==='peek_own')   G.playerMove=`You discarded ${fmt(c)} — peeking your own card.`;
  else if (ab==='blind_swap') G.playerMove=`You discarded ${fmt(c)} — blind swap activated.`;
  else if (ab==='peek_opp')   G.playerMove=`You discarded ${fmt(c)} — peeking computer's card.`;
  else if (ab==='peek_swap')  G.playerMove=`You discarded ${fmt(c)} — peek & swap activated.`;
  else                        G.playerMove=`You discarded ${fmt(c)}.`;
  if (MP.active) G.mpAnim = {type:'discard_drawn'};
  render();
  triggerSnapWindow(c, ()=>triggerAbility(ab));
}
function triggerAbility(ab) {
  if (!ab) { endPlayerTurn(); return; }
  if (ab==='peek_own')   { G.phase='player_peek_own'; G.msg='Select one of YOUR cards to peek at.'; }
  if (ab==='blind_swap') { G.phase='player_bs_own';   G.msg='Blind swap! Select one of YOUR cards first.'; }
  if (ab==='peek_opp')   { G.phase='player_q_peek';   G.msg="Queen! Select one of the COMPUTER's cards to peek at."; }
  if (ab==='peek_swap')  { G.phase='player_pk_own_first'; G.msg="King! First select one of YOUR cards to peek at."; }
  render();
}

function clickPC(idx) {
  if (G.snapActive) { playerTrySnap(idx); return; }
  if (G.phase==='player_action') {
    const drawnRect = getRect('drawn-card');
    const slotRect  = getRect('pc-'+idx);
    const doSwap = () => {
      const old=G.pCards[idx].card;
      G.playerMove=`You swapped your card ${idx+1} with the drawn ${fmt(G.drawn)}.`;
      G.pCards[idx]={card:G.drawn,faceUp:false};
      delete G.pKnown[idx];
      G.drawn=null;
      G.discard.push(old);
      if (MP.active) G.mpAnim = {type:'swap_opp', idx};
      triggerSnapWindow(old, ()=>endPlayerTurn());
    };
    if (drawnRect && slotRect) {
      const discardRect = getRect('discard-card');
      const slotEl = document.getElementById('pc-'+idx);
      slotEl.style.visibility = 'hidden';
      // Old card flies to discard simultaneously (fire-and-forget)
      if (discardRect) flyCard(slotRect, discardRect, ()=>{}, 0.45);
      flyCard(drawnRect, slotRect, ()=>{ slotEl.style.visibility=''; doSwap(); }, 0.45);
    } else { doSwap(); }
    return;
  }
  if (G.phase==='player_peek_own') {
    G.peekingIdx=idx;
    G.pKnown[idx]=G.pCards[idx].card.value;
    G.phase='peeking_own';
    G.msg=`Your card ${idx+1}: ${fmt(G.pCards[idx].card)} — memorize it!`;
    render();
    setTimeout(()=>{G.peekingIdx=null; G.playerMove=`You peeked at your card ${idx+1}.`; endPlayerTurn();},2000);
    return;
  }
  if (G.phase==='player_bs_own') {
    G.bsOwnIdx=idx;
    delete G.pKnown[idx];
    G.phase='player_bs_opp';
    G.msg=`Card ${idx+1} selected. Now pick one of the COMPUTER's cards.`;
    render(); return;
  }
  if (G.phase==='player_pk_own_first') {
    G.peekOwnKingIdx=idx;
    G.pKnown[idx]=G.pCards[idx].card.value;
    const c=G.pCards[idx].card;
    G.phase='player_pk_opp';
    G.msg=`Your card ${idx+1}: ${fmt(c)} — now select one of the COMPUTER'S cards to peek at.`;
    render(); return;
  }
}

function clickCC(idx) {
  if (G.snapActive) return;
  if (G.phase==='player_bs_opp') {
    const oi=G.bsOwnIdx;
    G.bsOwnIdx=null;
    G.msg=`Swapping your card ${oi+1} with computer's card ${idx+1}…`;
    G.phase='animating';
    render();
    animateSwap('pc-'+oi, 'cc-'+idx, ()=>{
      const tmp=G.pCards[oi].card;
      G.pCards[oi]={card:G.cCards[idx].card,faceUp:false};
      G.cCards[idx]={card:tmp,faceUp:false};
      delete G.cKnown[idx];
      G.playerMove=`You blind swapped your card ${oi+1} with computer's card ${idx+1}.`;
      G.lastMove=G.playerMove;
      if (MP.active) G.mpAnim = {type:'bs', jpcIdx:idx, jccIdx:oi};
      endPlayerTurn();
    });
    return;
  }
  if (G.phase==='player_q_peek') {
    G.peekingOppIdx=idx;
    const c=G.cCards[idx].card;
    G.msg=`Computer's card ${idx+1}: ${fmt(c)} (${c.value} pts) — memorize it!`;
    render();
    setTimeout(()=>{
      G.peekingOppIdx=null;
      G.playerMove=`You peeked at computer's card ${idx+1}.`;
      G.lastMove=G.playerMove;
      endPlayerTurn();
    }, 2000);
    return;
  }
  if (G.phase==='player_pk_opp') {
    G.peekOppIdx=idx; G.peekingOppIdx=idx;
    G.phase='player_peeking_opp';
    const c=G.cCards[idx].card;
    const own=G.pCards[G.peekOwnKingIdx].card;
    G.msg=`Your card ${G.peekOwnKingIdx+1}: ${fmt(own)} vs Computer's card ${idx+1}: ${fmt(c)}. Swap them?`;
    render(); return;
  }
}

function confirmKingSwap() {
  const oi=G.peekOwnKingIdx, ci=G.peekOppIdx;
  const myOld=G.pCards[oi].card;
  G.playerMove=`You swapped your card ${oi+1} with computer's card ${ci+1}.`;
  G.pCards[oi]={card:G.cCards[ci].card,faceUp:false};
  G.cCards[ci]={card:myOld,faceUp:false};
  delete G.pKnown[oi]; delete G.cKnown[ci];
  if (MP.active) G.mpAnim={type:'bs', jpcIdx:ci, jccIdx:oi};
  G.peekOwnKingIdx=null; G.peekOppIdx=null; G.peekingOppIdx=null;
  endPlayerTurn();
}
function skipKingSwap() {
  G.playerMove=`You peeked at your card ${G.peekOwnKingIdx+1} and computer's card ${G.peekOppIdx+1}, kept them.`;
  G.peekOwnKingIdx=null; G.peekOppIdx=null; G.peekingOppIdx=null;
  endPlayerTurn();
}
function callCambio() {
  if (G.snapActive) return;
  if (G.phase!=='player_draw'||G.cambioBy) return;
  if (MP.active) {
    G.cambioBy='host';
    G.msg='You called CAMBIO! Opponent gets one final turn...';
    G.phase='joiner_draw';
    showCambioExplosion();
    render();
  } else {
    G.cambioBy='player';
    G.msg='You called CAMBIO! Computer gets one final turn...';
    G.phase='computer_turn';
    showCambioExplosion();
    render();
    setTimeout(compTurn,1300);
  }
}
function endPlayerTurn() {
  G.turns++;
  G.peekingIdx=null; G.peekingOppIdx=null;
  if (MP.active) {
    if (G.cambioBy==='joiner') {
      G.msg='Revealing cards...';
      revealAll(); setTimeout(endGame,1400);
    } else {
      joinerTurn();
    }
  } else {
    G.phase='computer_turn';
    G.msg='Computer is thinking...';
    render();
    setTimeout(compTurn,2400);
  }
}

function joinerTurn() {
  G.phase='joiner_draw';
  G.msg='Waiting for opponent...';
  render();
}

function endJoinerTurn() {
  G.turns++;
  G.jPeekOwnIdx=null; G.jQueenPeek=false;
  if (G.cambioBy==='host') {
    G.msg='Revealing cards...';
    revealAll(); setTimeout(endGame,1400);
  } else {
    G.lastMove=G.msg;
    G.phase='player_draw';
    G.msg='Your turn. Draw from the deck or discard pile, or call Cambio.';
    render();
  }
}

// ── Helpers ──────────────────────────────────────────────
function reshuffleDiscard() {
  if (G.discard.length<=1) return;
  const top=G.discard.pop();
  G.deck=shuffle(G.discard);
  G.discard=[top];
}
function fmt(c) { return c.rank+c.suit; }

// ── Computer AI ──────────────────────────────────────────
function compTurn() {
  if (MP.active) return;
  if (G.cambioBy==='computer') {
    G.msg='Revealing cards...';
    revealAll(); setTimeout(endGame,1400); return;
  }
  const afterPlayerCambio = G.cambioBy==='player';

  if (!G.cambioBy) {
    const kn=Object.values(G.cKnown);
    const d=G.difficulty;
    const unkEst = d==='easy' ? 6 : d==='hard' ? 3.5 : 4.5;
    const estScore=kn.reduce((a,b)=>a+b,0)+(G.cCards.length-kn.length)*unkEst;
    const threshold = d==='easy' ? 15 : d==='medium' ? 6 : 2;
    const shouldCall = estScore < threshold;
    if (shouldCall) {
      G.cambioBy='computer';
      G.msg='Computer calls CAMBIO! You get one final turn.';
      G.phase='player_draw'; showCambioExplosion(); render(); return;
    }
  }

  const topDiscard=G.discard.length?G.discard[G.discard.length-1]:null;
  let drawn, compDrewFromDeck=false;
  const discThresh = G.difficulty==='easy' ? 1 : G.difficulty==='hard' ? 4 : 2;
  let srcRect=null;
  if (topDiscard&&topDiscard.value<=discThresh) {
    srcRect = getRect('discard-card');
    drawn=G.discard.pop();
    G.msg=`Computer takes ${fmt(drawn)} from the discard pile.`;
  } else {
    if (!G.deck.length) reshuffleDiscard();
    if (!G.deck.length) { endGame(); return; }
    srcRect = getRect('deck-card');
    drawn=G.deck.pop();
    compDrewFromDeck=true;
    G.msg='Computer draws from the deck.';
  }
  render();

  setTimeout(()=>{
    const skipAbility = G.difficulty==='easy' && Math.random()<0.55;
    const ab = (compDrewFromDeck && !skipAbility) ? ability(drawn.rank) : null;
    let worstIdx=-1,worstVal=drawn.value;
    for(let i=0;i<G.cCards.length;i++) {
      if(G.cKnown[i]!==undefined&&G.cKnown[i]>worstVal){worstVal=G.cKnown[i];worstIdx=i;}
    }
    if (worstIdx!==-1 && compDrewFromDeck && G.difficulty==='easy' && Math.random()<0.4) worstIdx=-1;
    if (!compDrewFromDeck && worstIdx===-1) worstIdx=0|Math.random()*G.cCards.length;

    const randomThresh = G.difficulty==='hard' ? 0.05 : G.difficulty==='medium' ? 0.10 : 0.20;
    if (Math.random() < randomThresh) {
      if (Math.random() < 0.5) {
        const randIdx = 0|Math.random()*G.cCards.length;
        const slotEl = document.getElementById('cc-'+randIdx);
        const slotRect = slotEl ? slotEl.getBoundingClientRect() : null;
        const doRandSwap = () => {
          const old=G.cCards[randIdx].card;
          G.cCards[randIdx]={card:drawn,faceUp:false};
          G.cKnown[randIdx]=drawn.value;
          G.discard.push(old);
          G.msg=`Computer swaps card ${randIdx+1} (discards ${fmt(old)}).`;
          render();
          triggerSnapWindow(old, ()=>compEndTurn(afterPlayerCambio));
        };
        if (srcRect && slotRect && slotEl) {
          slotEl.style.visibility='hidden';
          flyCard(srcRect, slotRect, ()=>{ slotEl.style.visibility=''; doRandSwap(); }, 0.55);
        } else { doRandSwap(); }
      } else if (compDrewFromDeck) {
        G.discard.push(drawn);
        G.msg=`Computer discards ${fmt(drawn)}.`;
        render();
        triggerSnapWindow(drawn, ()=>compEndTurn(afterPlayerCambio));
        return;
      }
      return;
    }

    if (worstIdx!==-1) {
      const slotEl = document.getElementById('cc-'+worstIdx);
      const slotRect = slotEl ? slotEl.getBoundingClientRect() : null;
      const doCompSwap = () => {
        const old=G.cCards[worstIdx].card;
        G.cCards[worstIdx]={card:drawn,faceUp:false};
        G.cKnown[worstIdx]=drawn.value;
        G.discard.push(old);
        G.msg=`Computer swaps card ${worstIdx+1} (discards ${fmt(old)}).`;
        render();
        triggerSnapWindow(old, ()=>compEndTurn(afterPlayerCambio));
      };
      if (srcRect && slotRect && slotEl) {
        slotEl.style.visibility='hidden';
        flyCard(srcRect, slotRect, ()=>{ slotEl.style.visibility=''; doCompSwap(); }, 0.55);
      } else { doCompSwap(); }
    } else {
      G.discard.push(drawn);
      render();
      triggerSnapWindow(drawn, ()=>{
        if (ab==='peek_own') {
          const unk=Array.from({length:G.cCards.length},(_,i)=>i).filter(i=>G.cKnown[i]===undefined);
          if (unk.length){const pi=unk[0|Math.random()*unk.length];G.cKnown[pi]=G.cCards[pi].card.value;}
          G.msg=`Computer discards ${fmt(drawn)} and peeks at one of its own cards.`;
          compEndTurn(afterPlayerCambio);
        } else if (ab==='blind_swap') {
          let swapOwn=0|Math.random()*G.cCards.length,bestBad=-Infinity;
          for(let i=0;i<G.cCards.length;i++){if(G.cKnown[i]!==undefined&&G.cKnown[i]>bestBad){bestBad=G.cKnown[i];swapOwn=i;}}
          const swapOpp=0|Math.random()*G.pCards.length;
          G.msg=`Computer discards ${fmt(drawn)} — swapping its card ${swapOwn+1} with your card ${swapOpp+1}!`;
          render();
          animateSwap('cc-'+swapOwn, 'pc-'+swapOpp, ()=>{
            const tmp=G.cCards[swapOwn].card;
            G.cCards[swapOwn]={card:G.pCards[swapOpp].card,faceUp:false};
            G.pCards[swapOpp]={card:tmp,faceUp:false};
            delete G.cKnown[swapOwn]; delete G.pKnown[swapOpp];
            compEndTurn(afterPlayerCambio);
          });
        } else if (ab==='peek_opp') {
          const pi=0|Math.random()*G.pCards.length;
          G.cKnownP[pi]=G.pCards[pi].card.value;
          G.msg=`Computer discards ${fmt(drawn)} and peeks at your card ${pi+1}.`;
          compEndTurn(afterPlayerCambio);
        } else if (ab==='peek_swap') {
          // Step 1: peek own card — pick worst known own card, else random
          let ownIdx=-1, ownWorst=-Infinity;
          for(let i=0;i<G.cCards.length;i++){if(G.cKnown[i]!==undefined&&G.cKnown[i]>ownWorst){ownWorst=G.cKnown[i];ownIdx=i;}}
          if(ownIdx===-1) ownIdx=0|Math.random()*G.cCards.length;
          const ownVal=G.cCards[ownIdx].card.value;
          G.cKnown[ownIdx]=ownVal;
          // Step 2: peek opponent card — pick best known player card, else random
          let oppIdx=-1, oppBest=Infinity;
          for(let i=0;i<G.pCards.length;i++){if(G.cKnownP[i]!==undefined&&G.cKnownP[i]<oppBest){oppBest=G.cKnownP[i];oppIdx=i;}}
          if(oppIdx===-1) oppIdx=0|Math.random()*G.pCards.length;
          const oppVal=G.pCards[oppIdx].card.value;
          G.cKnownP[oppIdx]=oppVal;
          // Step 3: swap if own card is worse (higher) than opponent's card
          if(ownVal>oppVal){
            const tmp2=G.cCards[ownIdx].card;
            G.cCards[ownIdx]={card:G.pCards[oppIdx].card,faceUp:false};
            G.pCards[oppIdx]={card:tmp2,faceUp:false};
            G.cKnown[ownIdx]=oppVal; G.cKnownP[oppIdx]=ownVal; delete G.pKnown[oppIdx];
            G.msg=`Computer discards ${fmt(drawn)}, peeks at both cards, and swaps!`;
          } else {
            G.msg=`Computer discards ${fmt(drawn)} and peeks at both cards.`;
          }
          compEndTurn(afterPlayerCambio);
        } else {
          G.msg=`Computer discards ${fmt(drawn)}.`;
          compEndTurn(afterPlayerCambio);
        }
      });
    }
  },700);
}

function compEndTurn(afterPlayerCambio) {
  G.turns++;
  if (afterPlayerCambio) {
    G.msg='Revealing cards...';
    revealAll(); setTimeout(endGame,1400);
  } else {
    G.lastMove = G.msg;
    G.phase='player_draw';
    G.msg='Your turn. Draw from the deck or discard pile, or call Cambio.';
    render();
  }
}
function revealAll() {
  G.pCards.forEach(s=>s.faceUp=true);
  G.cCards.forEach(s=>s.faceUp=true);
  G.phase='revealing'; render();
}
function endGame() {
  G.pScore=G.pCards.reduce((s,c)=>s+c.card.value,0);
  G.cScore=G.cCards.reduce((s,c)=>s+c.card.value,0);
  G.phase='game_over';
  if (G.pScore<G.cScore)      G.msg=`You win! Your score: ${G.pScore} vs Computer: ${G.cScore}`;
  else if (G.cScore<G.pScore) G.msg=`Computer wins! Computer: ${G.cScore} vs You: ${G.pScore}`;
  else                         G.msg=`Tie game! Both scored ${G.pScore} points.`;
  render();
}
