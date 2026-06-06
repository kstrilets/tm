const COLORS = ["red", "cyan", "gold", "violet"];
const ROW_LABELS = ["Top", "Middle", "Bottom"];

const STARTING_HAND_MAX = 7;
const MIN_HAND_MAX = 1;
const MAX_NUMBER = 11;
const MERGE_COUNT = 5;
const BOARD_MAX = 10;
const SCORE_GOAL = 10000;
const EMPTY_CHANCE = 0.3;
const MERGE_MODE_KEY = "triad-merge-mode";
const MERGE_MODES = {
  REMOVE_ALL: "removeAll",
  PARTIAL: "partial",
  UPGRADE_REST: "upgradeRest",
};

let state = {
  score: 0,
  handMax: STARTING_HAND_MAX,
  unlockedMax: 1,
  mergeMode: MERGE_MODES.REMOVE_ALL,
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
  if (hasPlayableMove()) return false;

  if (canRefresh()) {
    const msg = isBoardFull()
      ? "Board full and no valid placement. Refresh your hand to continue."
      : "No valid moves. Refresh your hand to continue.";
    setMessage(msg, "warning");
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
      if (val === null) {
        i++;
        continue;
      }
      let j = i + 1;
      while (j < board.length && board[j].segments[row].number === val) j++;
      if (j - i >= MERGE_COUNT) {
        const ids = board.slice(i, i + MERGE_COUNT).map((c) => c.id);
        merges.push({
          start: i,
          row,
          value: val,
          ids,
          bonus: 40 + val * 25,
          nextNumber: val + 1,
        });
      }
      i = j;
    }
  }
  return merges;
}

function removeCardsByIds(board, ids) {
  const idSet = new Set(ids);
  return board.filter((c) => !idSet.has(c.id));
}

function setSegmentEmpty(card, row) {
  const otherEmpty = card.segments.findIndex((s, i) => i !== row && s.number === null);
  if (otherEmpty !== -1) {
    card.segments[otherEmpty].number = randomSegmentValue();
  }
  card.segments[row].number = null;
}

function applyRemoveAllMerge(merge) {
  state.board = removeCardsByIds(state.board, merge.ids);
  const cleared = state.board.length === 0;
  if (cleared) {
    state.board.push(createStarterCard());
  }
  return cleared;
}

function applyPartialMerge(merge) {
  const { row, ids, nextNumber } = merge;
  const [leftId, ...rest] = ids;
  const middleIds = rest.slice(0, 3);
  const rightId = rest[3];

  if (state.starterId === leftId) {
    state.starterId = state.board.find((c) => c.id !== leftId)?.id ?? null;
  }

  state.board = state.board.filter((c) => c.id !== leftId);

  for (const id of middleIds) {
    const card = state.board.find((c) => c.id === id);
    if (card) setSegmentEmpty(card, row);
  }

  const rightCard = state.board.find((c) => c.id === rightId);
  if (rightCard) {
    rightCard.segments[row].number = nextNumber;
  }

  if (state.board.length === 0) {
    state.board.push(createStarterCard());
  } else if (!state.starterId) {
    state.starterId = state.board[0].id;
  }
}

function applyUpgradeRestMerge(merge) {
  const { row, ids, nextNumber } = merge;
  const [leftId, ...restIds] = ids;

  if (state.starterId === leftId) {
    state.starterId = state.board.find((c) => c.id !== leftId)?.id ?? null;
  }

  state.board = state.board.filter((c) => c.id !== leftId);

  for (const id of restIds) {
    const card = state.board.find((c) => c.id === id);
    if (card) card.segments[row].number = nextNumber;
  }

  if (state.board.length === 0) {
    state.board.push(createStarterCard());
  } else if (!state.starterId) {
    state.starterId = state.board[0].id;
  }
}

function mergeRemovesLeftOnly() {
  return state.mergeMode === MERGE_MODES.PARTIAL || state.mergeMode === MERGE_MODES.UPGRADE_REST;
}

function getMergeMessage(merge) {
  const rowName = ROW_LABELS[merge.row].toLowerCase();
  if (state.mergeMode === MERGE_MODES.PARTIAL) {
    return `Five ${merge.value}s on the ${rowName} row — left removed, three emptied, right becomes ${merge.nextNumber}! +${merge.bonus}`;
  }
  if (state.mergeMode === MERGE_MODES.UPGRADE_REST) {
    return `Five ${merge.value}s on the ${rowName} row — left removed, rest become ${merge.nextNumber}! +${merge.bonus}`;
  }
  return `Five ${merge.value}s on the ${rowName} row merge — +${merge.bonus}!`;
}

function applyMerge(merge) {
  if (state.mergeMode === MERGE_MODES.PARTIAL) {
    applyPartialMerge(merge);
    return false;
  }
  if (state.mergeMode === MERGE_MODES.UPGRADE_REST) {
    applyUpgradeRestMerge(merge);
    return false;
  }
  return applyRemoveAllMerge(merge);
}

function getMergeModeDescription() {
  if (state.mergeMode === MERGE_MODES.PARTIAL) {
    return "Shift merge: left removed, middle emptied, right upgraded.";
  }
  if (state.mergeMode === MERGE_MODES.UPGRADE_REST) {
    return "Upgrade rest: left removed, other four become the new number.";
  }
  return "Remove all: five matching pieces leave the board.";
}

function loadMergeMode() {
  const saved = localStorage.getItem(MERGE_MODE_KEY);
  if (Object.values(MERGE_MODES).includes(saved)) {
    state.mergeMode = saved;
  }
}

function saveMergeMode(mode) {
  state.mergeMode = mode;
  localStorage.setItem(MERGE_MODE_KEY, mode);
}

function syncMergeModeUI() {
  const removeAll = document.getElementById("mergeModeRemoveAll");
  const partial = document.getElementById("mergeModePartial");
  const upgradeRest = document.getElementById("mergeModeUpgradeRest");
  if (removeAll) removeAll.checked = state.mergeMode === MERGE_MODES.REMOVE_ALL;
  if (partial) partial.checked = state.mergeMode === MERGE_MODES.PARTIAL;
  if (upgradeRest) upgradeRest.checked = state.mergeMode === MERGE_MODES.UPGRADE_REST;
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
  if (isBoardFull() && !canPlaceRight) {
    hints.textContent = `Board full (${BOARD_MAX}/${BOARD_MAX}). Merge five in a row to clear space.`;
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
  if (state.refreshIds.size > 0) {
    return [...state.refreshIds];
  }
  if (state.selectedCardId) {
    return [state.selectedCardId];
  }
  return state.hand.map((c) => c.id);
}

function render() {
  renderBoard();
  renderHand();
  renderStats();
  syncMergeModeUI();
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
    setMessage(`Board is full (${BOARD_MAX} pieces). Merge to clear space.`, "warning");
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
    if (!checkGameOver()) {
      checkWin();
    }
    render();
  });
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

    let msg = getMergeMessage(merge);

    if (merge.nextNumber <= MAX_NUMBER && merge.nextNumber > state.unlockedMax) {
      state.unlockedMax = merge.nextNumber;
      msg += ` Number ${merge.nextNumber} unlocked on pieces.`;
    }

    setMessage(msg, "bonus");

    const animateIds = mergeRemovesLeftOnly() ? [merge.ids[0]] : merge.ids;
    document.querySelectorAll(".card").forEach((el) => {
      if (animateIds.includes(el.dataset.id)) el.classList.add("removing");
    });

    await delay(420);

    if (applyMerge(merge)) {
      setMessage("Board cleared! New starter card dealt.", "bonus");
    }

    state.score += merge.bonus;

    render();
    await delay(200);

    if (checkWin()) break;
  }

  if (totalBonus > 0 && chain > 1) {
    setMessage(`Merge chain x${chain}! Total bonus: +${totalBonus}`, "bonus");
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

document.querySelectorAll('input[name="mergeMode"]').forEach((input) => {
  input.addEventListener("change", (e) => {
    if (e.target.checked) {
      saveMergeMode(e.target.value);
      setMessage(getMergeModeDescription());
    }
  });
});

loadMergeMode();

document.addEventListener("keydown", (e) => {
  if (!state.selectedCardId || e.target.matches("input, textarea, button")) return;
  if (e.key !== "r" && e.key !== "R") return;
  const card = state.hand.find((c) => c.id === state.selectedCardId);
  if (!card) return;
  e.preventDefault();
  rotateCard(card);
  if (!checkGameOver()) {
    setMessage("Flipped 180° (R)");
  }
  render();
});

initGame();
