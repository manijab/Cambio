# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Single-file web-based Cambio card game — everything lives in `index.html` (HTML + CSS + JS, ~1350 lines). Open it directly in a browser; no build step, no dependencies.

To check for JS syntax errors:
```bash
node -e "const fs=require('fs'),code=fs.readFileSync('index.html','utf8'),m=code.match(/<script>([\s\S]*?)<\/script>/);try{new Function(m[1]);console.log('OK');}catch(e){console.log(e.message);}"
```

## Architecture

All game logic is in a single `<script>` block. The pattern is: mutate global state object `G`, then call `render()` which does a full `innerHTML` replacement of `#ga`.

### State (`G`)
```js
G = {
  deck, discard,          // card arrays
  pCards, cCards,         // [{card, faceUp}] — variable length (snap can remove cards)
  drawn, drawnFrom,       // drawn card + 'deck'|'discard'
  phase,                  // drives all interaction logic (see phases below)
  cambioBy,               // 'player'|'computer'|null
  cKnown, cKnownP, pKnown, // computer's memory of own/player cards; player's memory of own cards
  snapActive, snapValue, snapResolved, snapResumeFn, // snap window state
  difficulty              // 'easy'|'medium'|'hard'
}
```

### Phase flow
```
start → dealing → player_draw ⇄ computer_turn
player_draw → player_action → (endPlayerTurn | triggerAbility)
triggerAbility → player_peek_own | player_bs_own→player_bs_opp | player_q_peek | player_pk_opp→player_peeking_opp
any discard → triggerSnapWindow(card, resumeFn) → [snap resolves] → resumeFn()
cambio called → revealing → game_over
```

### Snap window
`triggerSnapWindow(card, resumeFn)` is called at every discard point. It opens a silent 4-second window where the player can click their own cards (`playerTrySnap(idx)`) and the computer auto-snaps after a difficulty delay (Easy=3s, Medium=2s, Hard=0.5s). `resumeFn` is called after the window closes. **No visual indicator is shown** — players must remember their cards.

### Animations
All animations use fixed-position flying `div` elements created imperatively. Key pattern: capture `getBoundingClientRect()` **before** calling `render()` (render replaces innerHTML and moves elements). Functions: `flyCard(fromRect, toRect, onDone, duration)`, `animateSwap(id1, id2, callback)`, `animatePileToDraw(srcRect)`.

### Computer AI (`compTurn`)
Difficulty params: Cambio call threshold (Easy <15, Medium <6, Hard <2 estimated score). Unknown card estimate (Easy=6, Medium=4.5, Hard=3.5). Random move chance (Easy=20%, Medium=10%, Hard=5%). Easy has 40% chance to ignore optimal swap and 55% chance to ignore special abilities.

### Special card abilities
Only trigger when a card is drawn from the **deck** and then intentionally discarded (not when swapping from hand, not when drawn from discard pile). `ability(rank)` returns: `10`→`peek_own`, `J`→`blind_swap`, `Q`→`peek_opp`, `K`→`peek_swap`.

### Card values
A=1, 2–9=face, 10/J/Q/K=10, K♥=−1, Joker=0. Lowest total wins.
