const COLORS = ["red", "cyan", "gold", "violet"];
const ROW_LABELS = ["Top", "Middle", "Bottom"];
const STARTING_HAND_MAX = 7;
const MIN_HAND_MAX = 1;
const MAX_NUMBER = 11;
const MERGE_COUNT = 5;
const BOARD_MAX = 10;
const SCORE_GOAL = 10000;
const EMPTY_CHANCE = 0.3;

let state = {
  score: 0,
  handMax: STARTING_HAND_MAX,
  unlockedMax: 1,
  board: [],
  hand: [],
  selectedCardId: null,
  refreshIds: new Set(),
  starterId: null,
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function randomInt(max) {
  return Math.floor(Math.random() * (max + 1));
}

function randomColor() {
  return COLORS[randomInt(COLORS.length - 1)];
}

function randomSegmentValue() {
  return randomInt(state.unlockedMax - 1) + 1;
}

function createCard() {
  const segments = Array.from({ length: 3 }, () => ({
    color: randomColor(),
    number: randomSegmentValue(),
  }));
  if (Math.random() < EMPTY_CHANCE) {
    segments[randomInt(2)].number = null;
  }
  return { id: uid(), segments };
}

function numberedRowsOn(card) {
  return [0, 1, 2].filter((i) => card.segments[i].number !== null);
}

function createCardMatching(neighbor, preferredRow = null) {
  const card = createCard();
  const rows = numberedRowsOn(neighbor);
  if (rows.length === 0) {
    card.segments[randomInt(2)].number = 1;
    return card;
  }
  const row =
    preferredRow !== null && rows.includes(preferredRow)
      ? preferredRow
      : rows[randomInt(rows.length - 1)];
  card.segments[row].number = neighbor.segments[row].number;
  return card;
}

function rotateCard(card) {
  card.segments.reverse();
}

function onRotateCard(cardId, event) {
  event.stopPropagation();
  event.preventDefault();
  const card = state.hand.find((c) => c.id === cardId);
  if (!card) return;
  rotateCard(card);
  if (!checkGameOver()) {
    setMessage("Card flipped 180° — check number alignments.");
  }
  render();
}

function boardEnd() {
  return state.board[state.board.length - 1];
}

function isBoardFull() {
  return state.board.length >= BOARD_MAX;
}

function canPlaceOnBoard(card) {
  if (state.board.length === 0 || isBoardFull()) return false;
  return canPlace(card, boardEnd());
}

function hasPlayableMove() {
  return state.hand.some(canPlaceOnBoard);
}

function guaranteeFirstMove() {
  if (state.board.length !== 1 || state.hand.length === 0) return;
  state.hand[0] = createCardMatching(state.board[0], randomInt(2));
}

function canRefresh() {
  return state.hand.length > 1;
}

function checkGameOver() {
  if (isBoardFull()) {
    showModal(
      "Board Full — Game Over",
      `The board filled up with ${BOARD_MAX} cards. Final score: ${state.score}.`,
      "Play Again",
      () => initGame()
    );
    return true;
  }
  if (hasPlayableMove()) return false;
  if (canRefresh()) {
    setMessage("No valid moves. Refresh your hand to continue.", "warning");
    return false;
  }
  showModal(
    "Game Over",
    `No more moves possible. Final score: ${state.score}.`,
    "Play Again",
    () => initGame()
  );
  return true;
}

function createStarterCard() {
  const card = createCard();
  state.starterId = card.id;
  return card;
}

function matchingRows(a, b) {
  const rows = [];
  for (let i = 0; i < 3; i++) {
    const an = a.segments[i].number;
    const bn = b.segments[i].number;
    if (an !== null && bn !== null && an === bn) rows.push(i);
  }
  return rows;
}

function canPlace(card, neighbor) {
  return matchingRows(card, neighbor).length > 0;
}

function placementScore(rows) {
  return 15 + rows.length * 25;
}

function findFiveInRowMerges(board) {
  const merges = [];
  if (board.length < MERGE_COUNT) return merges;
  for (let row = 0; row < 3; row++) {
    let i = 0;
    while (i < board.length) {
      const val = board[i].segments[row].number;
      if (val === null) { i++; continue; }
      let j = i + 1;
      while (j < board.length && board[j].segments[row].number === val) j++;
      if (j - i >= MERGE_COUNT) {
        // The 5 cards: indices i..i+4
        // Survivor = rightmost (index i+4), removed = left 4 (i..i+3)
        const five = board.slice(i, i + MERGE_COUNT);
        const survivor = five[MERGE_COUNT - 1];
        const removed = five.slice(0, MERGE_COUNT - 1);
        merges.push({
          start: i,
          row,
          value: val,
          survivorId: survivor.id,
          removedIds: removed.map((c) => c.id),
          bonus: 40 + val * 25,
          nextNumber: val + 1,
        });
      }
      i = j;
    }
  }
  return merges;
}

// Apply merge to state: remove 4 left cards, move survivor to start position,
// increment all matched rows on survivor.
// Returns { cleared } — whether board became empty before we inserted survivor.
function applyMerge(merge) {
  const survivorIdx = state.board.findIndex((c) => c.id === merge.survivorId);
  if (survivorIdx === -1) return { cleared: false };

  const survivor = state.board[survivorIdx];

  // Increment every row that had the matching value
  // (could be multiple rows if the card matched on >1 row in this merge)
  // We find all rows on the survivor that equal merge.value
  for (let r = 0; r < 3; r++) {
    if (survivor.segments[r].number === merge.value) {
      survivor.segments[r].number =
        merge.nextNumber <= MAX_NUMBER ? merge.nextNumber : merge.value;
    }
  }

  // Remove the 4 left cards
  const removedSet = new Set(merge.removedIds);
  state.board = state.board.filter((c) => !removedSet.has(c.id));

  // Move survivor to position merge.start
  const newSurvivorIdx = state.board.findIndex((c) => c.id === merge.survivorId);
  state.board.splice(newSurvivorIdx, 1);
  state.board.splice(merge.start, 0, survivor);

  // If survivor was the only card left (board had exactly 5 and all removed + survivor),
  // board is now just [survivor] which is fine — no need for a new starter.
  return { cleared: false };
}

function getMergeMessage(merge) {
  const rowName = ROW_LABELS[merge.row].toLowerCase();
  return `Five ${merge.value}s on the ${merge.row === 0 ? "top" : merge.row === 1 ? "middle" : "bottom"} row — +${merge.bonus}! Rightmost becomes ${merge.nextNumber}.`;
}

function fillHand() {
  while (state.hand.length < state.handMax) {
    state.hand.push(createCard());
  }
  if (state.board.length === 1) {
    guaranteeFirstMove();
  }
}

function initGame() {
  state.score = 0;
  state.handMax = STARTING_HAND_MAX;
  state.unlockedMax = 1;
  state.board = [createStarterCard()];
  state.hand = [];
  state.selectedCardId = null;
  state.refreshIds.clear();
  // Remove any leftover ghost track so it gets rebuilt fresh
  const boardWrap = document.getElementById("board")?.parentElement;
  if (boardWrap) {
    const gt = boardWrap.querySelector(".board-ghost-track");
    if (gt) gt.remove();
  }
  fillHand();
  guaranteeFirstMove();
  render();
  setMessage(`Reach ${SCORE_GOAL} points to win. Double-click a hand card to place it.`);
}

function setMessage(text, type = "") {
  const bar = document.getElementById("messageBar");
  bar.textContent = text;
  bar.className = "message-bar" + (type ? ` ${type}` : "");
}

function showScorePop(amount, x, y) {
  const el = document.createElement("div");
  el.className = "score-pop";
  el.textContent = `+${amount}`;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

function renderCard(card, opts = {}) {
  const { inHand = false, isStarter = false, extraClass = "" } = opts;
  const el = document.createElement("div");
  el.className = "card";
  if (inHand) el.classList.add("in-hand");
  if (isStarter) el.classList.add("starter");
  if (extraClass) el.classList.add(extraClass);
  el.dataset.id = card.id;

  card.segments.forEach((seg, i) => {
    const segEl = document.createElement("div");
    segEl.className = "segment";
    segEl.dataset.color = seg.color;
    const label = seg.number === null ? "empty" : seg.number;
    segEl.title = `${ROW_LABELS[i]}: ${seg.color}, ${label}`;
    if (seg.number === null) segEl.classList.add("empty");

    const num = document.createElement("span");
    num.className = "num";
    num.textContent = seg.number === null ? "" : seg.number;

    const dot = document.createElement("span");
    dot.className = "color-dot";
    dot.style.background = `var(--color-${seg.color})`;

    segEl.append(num, dot);
    el.appendChild(segEl);
  });

  return el;
}

function renderBoard() {
  const boardEl = document.getElementById("board");
  boardEl.innerHTML = "";

  // Ghost track — always render all 10 slot outlines behind real cards
  const boardWrap = boardEl.parentElement;
  let ghostTrack = boardWrap.querySelector(".board-ghost-track");
  if (!ghostTrack) {
    ghostTrack = document.createElement("div");
    ghostTrack.className = "board-ghost-track";
    for (let i = 0; i < BOARD_MAX; i++) {
      const ghost = document.createElement("div");
      ghost.className = "board-ghost-slot";
      ghost.dataset.slot = i + 1;
      ghostTrack.appendChild(ghost);
    }
    boardWrap.appendChild(ghostTrack);
  }
  // Danger tint on last 3 slots
  ghostTrack.querySelectorAll(".board-ghost-slot").forEach((el, i) => {
    el.classList.toggle("danger", i >= BOARD_MAX - 3);
  });

  const selected = state.hand.find((c) => c.id === state.selectedCardId);
  let canPlaceRight = false;
  let hintText = "";

  if (selected && state.board.length > 0 && !isBoardFull()) {
    canPlaceRight = canPlaceOnBoard(selected);
    if (canPlaceRight) {
      const rows = matchingRows(selected, boardEnd());
      hintText = `Matches on ${rows.map((r) => ROW_LABELS[r]).join(", ")}.`;
    }
  }

  state.board.forEach((card) => {
    const wrap = document.createElement("div");
    wrap.className = "board-slot";
    const cardEl = renderCard(card, { isStarter: card.id === state.starterId });
    wrap.appendChild(cardEl);
    boardEl.appendChild(wrap);
  });

  const rightSlot = document.createElement("div");
  rightSlot.className = "board-slot";
  const rightBtn = document.createElement("button");
  rightBtn.className = "place-btn";
  rightBtn.textContent = "Place →";
  rightBtn.id = "placeRight";
  rightBtn.disabled = !canPlaceRight;
  if (canPlaceRight) rightBtn.classList.add("valid");
  rightBtn.addEventListener("click", placeCard);
  rightSlot.appendChild(rightBtn);
  boardEl.appendChild(rightSlot);

  const hints = document.getElementById("placementHints");
  if (isBoardFull()) {
    hints.textContent = `Board full (${BOARD_MAX}/${BOARD_MAX}) — Game Over!`;
  } else if (selected && canPlaceRight) {
    hints.innerHTML = `<span class="match-row">${hintText}</span>`;
  } else if (selected) {
    hints.textContent = "No valid placement — numbers must match on at least one row.";
  } else {
    hints.textContent = "";
  }
}

function renderHand() {
  const handEl = document.getElementById("hand");
  handEl.innerHTML = "";

  state.hand.forEach((card) => {
    const wrap = document.createElement("div");
    wrap.className = "hand-card-wrap";

    const el = renderCard(card, { inHand: true });
    if (card.id === state.selectedCardId) el.classList.add("selected");
    if (state.refreshIds.has(card.id)) el.classList.add("refresh-selected");

    let clickTimer = null;
    el.addEventListener("click", (e) => {
      if (clickTimer) clearTimeout(clickTimer);
      clickTimer = setTimeout(() => {
        onHandCardClick(card.id, e);
        clickTimer = null;
      }, 220);
    });
    el.addEventListener("dblclick", (e) => {
      e.preventDefault();
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
      }
      onHandCardDoubleClick(card.id, e);
    });

    const controls = document.createElement("div");
    controls.className = "hand-card-controls";

    const rotBtn = document.createElement("button");
    rotBtn.type = "button";
    rotBtn.className = "rotate-btn";
    rotBtn.textContent = "⇅";
    rotBtn.title = "Flip 180°";
    rotBtn.addEventListener("click", (e) => onRotateCard(card.id, e));

    controls.append(rotBtn);
    wrap.append(el, controls);
    handEl.appendChild(wrap);
  });
}

function renderStats() {
  document.getElementById("score").textContent = state.score;
  document.getElementById("goal").textContent = SCORE_GOAL;
  document.getElementById("boardCount").textContent = `${state.board.length}/${BOARD_MAX}`;
  document.getElementById("handMax").textContent = state.handMax;
  document.getElementById("unlockedMax").textContent = state.unlockedMax;

  const refreshBtn = document.getElementById("refreshBtn");
  const nextMax = Math.max(MIN_HAND_MAX, state.handMax - 1);
  refreshBtn.disabled = !canRefresh();
  if (!canRefresh()) {
    refreshBtn.textContent = "Refresh unavailable (1 card)";
  } else if (state.refreshIds.size > 0) {
    refreshBtn.textContent = `Refresh ${state.refreshIds.size} marked (−1 max → ${nextMax})`;
  } else if (state.selectedCardId) {
    refreshBtn.textContent = `Refresh selected card (−1 max → ${nextMax})`;
  } else {
    refreshBtn.textContent = `Refresh Hand (−1 max → ${nextMax})`;
  }
}

function getRefreshTargetIds() {
  if (state.refreshIds.size > 0) return [...state.refreshIds];
  if (state.selectedCardId) return [state.selectedCardId];
  return state.hand.map((c) => c.id);
}

function render() {
  renderBoard();
  renderHand();
  renderStats();
}

function onHandCardClick(cardId, event) {
  if (event.shiftKey) {
    if (state.refreshIds.has(cardId)) {
      state.refreshIds.delete(cardId);
    } else {
      state.refreshIds.add(cardId);
      if (state.selectedCardId === cardId) state.selectedCardId = null;
    }
    setMessage(
      state.refreshIds.size
        ? `${state.refreshIds.size} card(s) marked for refresh. Click Refresh or Shift+click to toggle.`
        : "Refresh selection cleared."
    );
  } else {
    state.refreshIds.delete(cardId);
    state.selectedCardId = state.selectedCardId === cardId ? null : cardId;
    if (state.selectedCardId) {
      setMessage("Card selected. Double-click to place, or use Place →.");
    }
  }
  render();
}

function onHandCardDoubleClick(cardId, event) {
  if (event.shiftKey) return;
  state.refreshIds.delete(cardId);
  state.selectedCardId = cardId;
  placeCard();
}

function placeCard() {
  const idx = state.hand.findIndex((c) => c.id === state.selectedCardId);
  if (idx === -1) return;

  if (isBoardFull()) {
    setMessage(`Board is full (${BOARD_MAX} pieces). Game Over!`, "warning");
    return;
  }

  const card = state.hand[idx];
  const neighbor = boardEnd();

  if (!canPlace(card, neighbor)) {
    setMessage("Invalid placement.", "warning");
    return;
  }

  const rows = matchingRows(card, neighbor);
  const gained = placementScore(rows);
  state.score += gained;
  state.hand.splice(idx, 1);
  state.board.push(card);
  state.selectedCardId = null;

  const btn = document.getElementById("placeRight");
  if (btn) {
    const rect = btn.getBoundingClientRect();
    showScorePop(gained, rect.left + rect.width / 2, rect.top);
  }

  setMessage(`Placed! +${gained} (${rows.length} row match${rows.length > 1 ? "es" : ""}).`, "success");

  processMatches().then(() => {
    fillHand();
    if (!checkGameOver()) checkWin();
    render();
  });
}

// ── Merge animation ────────────────────────────────────────────────────────
//
// For each merge:
//  1. Flash the 5 matching cards gold to signal the match
//  2. Fade+shrink the 4 left cards out (600ms)
//  3. While they fade, slide the survivor from its current DOM position
//     to the leftmost slot position (600ms, same duration)
//  4. Update state (remove 4, reposition survivor, increment number)
//  5. Flash the new number on the survivor card
//
// All movement is done on a cloned absolutely-positioned element so the
// real DOM layout stays stable during the animation.

async function animateMerge(merge) {
  const boardEl = document.getElementById("board");
  const boardRect = boardEl.getBoundingClientRect();

  // Gather DOM elements for the 5 cards involved
  const allIds = [...merge.removedIds, merge.survivorId];
  const cardEls = {};
  boardEl.querySelectorAll(".card").forEach((el) => {
    if (allIds.includes(el.dataset.id)) cardEls[el.dataset.id] = el;
  });

  const survivorEl = cardEls[merge.survivorId];
  const removedEls = merge.removedIds.map((id) => cardEls[id]);
  const leftmostEl = removedEls[0]; // the leftmost of the 5

  if (!survivorEl || !leftmostEl) return;

  // 1. Flash all 5 gold for 200ms
  allIds.forEach((id) => {
    const el = cardEls[id];
    if (el) el.classList.add("merge-flash");
  });
  await delay(200);

  // Measure positions before anything moves
  const survivorRect = survivorEl.getBoundingClientRect();
  const targetRect = leftmostEl.getBoundingClientRect();

  // 2. Create a flying clone of the survivor, positioned absolutely over the board
  const clone = survivorEl.cloneNode(true);
  clone.classList.add("merge-flying");
  clone.style.position = "fixed";
  clone.style.left = survivorRect.left + "px";
  clone.style.top = survivorRect.top + "px";
  clone.style.width = survivorRect.width + "px";
  clone.style.height = survivorRect.height + "px";
  clone.style.margin = "0";
  clone.style.zIndex = "200";
  clone.style.transition = "none";
  document.body.appendChild(clone);

  // Hide the real survivor card while the clone flies
  survivorEl.style.opacity = "0";
  survivorEl.style.pointerEvents = "none";

  // 3. Fade out the 4 left cards simultaneously
  removedEls.forEach((el) => {
    if (el) {
      el.classList.remove("merge-flash");
      el.classList.add("merge-removing");
    }
  });

  // Force reflow so transition kicks in
  clone.getBoundingClientRect();

  // Slide the clone to the leftmost position
  const dx = targetRect.left - survivorRect.left;
  const dy = targetRect.top - survivorRect.top;
  clone.style.transition = "transform 650ms cubic-bezier(0.25, 0.46, 0.45, 0.94), box-shadow 650ms";
  clone.style.transform = `translate(${dx}px, ${dy}px)`;
  clone.style.boxShadow = "0 0 32px 8px rgba(108, 140, 255, 0.6)";

  // Wait for animations to complete
  await delay(700);

  // Clean up clone
  clone.remove();

  // 4. Apply state changes (remove 4, reposition survivor, increment number)
  applyMerge(merge);

  // 5. Re-render, then flash the updated number on the survivor
  render();

  // Brief highlight on the new card at position merge.start
  await delay(30); // let DOM settle
  const newSurvivorEl = boardEl.querySelectorAll(".card")[merge.start];
  if (newSurvivorEl) {
    newSurvivorEl.classList.add("merge-upgraded");
    await delay(600);
    newSurvivorEl.classList.remove("merge-upgraded");
  }
}

async function processMatches() {
  let totalBonus = 0;
  let chain = 0;

  while (true) {
    const merges = findFiveInRowMerges(state.board);
    if (merges.length === 0) break;

    chain++;
    const merge = merges[0];
    totalBonus += merge.bonus;

    // Unlock next number if needed
    if (merge.nextNumber <= MAX_NUMBER && merge.nextNumber > state.unlockedMax) {
      state.unlockedMax = merge.nextNumber;
    }

    setMessage(getMergeMessage(merge), "bonus");
    state.score += merge.bonus;

    // Show score pop near the survivor card
    const survivorEl = document.querySelector(`.card[data-id="${merge.survivorId}"]`);
    if (survivorEl) {
      const r = survivorEl.getBoundingClientRect();
      showScorePop(merge.bonus, r.left + r.width / 2, r.top);
    }

    await animateMerge(merge);

    if (checkWin()) break;

    await delay(150);
  }

  if (totalBonus > 0 && chain > 1) {
    setMessage(`Merge chain ×${chain}! Total bonus: +${totalBonus}`, "bonus");
  }
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function refreshHand() {
  if (!canRefresh()) return;

  const targetIds = new Set(getRefreshTargetIds());
  state.hand = state.hand.map((card) =>
    targetIds.has(card.id) ? createCard() : card
  );
  state.handMax = Math.max(MIN_HAND_MAX, state.handMax - 1);
  state.refreshIds.clear();
  state.selectedCardId = null;

  if (state.hand.length > state.handMax) {
    state.hand = state.hand.slice(0, state.handMax);
  }

  if (!checkGameOver()) {
    setMessage(`Hand refreshed. Max hand size is now ${state.handMax}.`, "warning");
  }

  render();
}

function checkWin() {
  if (state.score < SCORE_GOAL) return false;
  showModal(
    "You Win!",
    `You reached ${SCORE_GOAL} points! Final score: ${state.score}.`,
    "Play Again",
    () => initGame()
  );
  return true;
}

function showModal(title, text, btnLabel, onAction) {
  const overlay = document.getElementById("overlay");
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalText").textContent = text;
  const btn = document.getElementById("modalBtn");
  btn.textContent = btnLabel;
  overlay.classList.remove("hidden");
  btn.onclick = () => {
    overlay.classList.add("hidden");
    onAction();
  };
}

document.getElementById("refreshBtn").addEventListener("click", refreshHand);

document.addEventListener("keydown", (e) => {
  if (!state.selectedCardId || e.target.matches("input, textarea, button")) return;
  if (e.key !== "r" && e.key !== "R") return;
  const card = state.hand.find((c) => c.id === state.selectedCardId);
  if (!card) return;
  e.preventDefault();
  rotateCard(card);
  if (!checkGameOver()) setMessage("Flipped 180° (R)");
  render();
});

initGame();
