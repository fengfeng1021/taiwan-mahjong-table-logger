const HONORS = ["東", "南", "西", "北", "中", "發", "白"];
const PLAYERS = ["我", "下家", "對家", "上家"];
const STORAGE_KEY = "tw-mahjong-coach-v2";
const TILE_GROUPS = [
  { suit: "wan", label: "萬" },
  { suit: "tong", label: "筒" },
  { suit: "tiao", label: "條" },
  { suit: "honor", label: "字" },
];

const numberLabels = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
const suitedTiles = ["wan", "tong", "tiao"].flatMap((suit) =>
  Array.from({ length: 9 }, (_, index) => ({
    id: `${suit}-${index + 1}`,
    suit,
    rank: index + 1,
    label: `${numberLabels[index + 1]}${suitName(suit)}`,
    copy: `${index + 1}${suitCode(suit)}`,
  })),
);
const honorTiles = HONORS.map((honor, index) => ({
  id: `honor-${index}`,
  suit: "honor",
  rank: index + 1,
  label: honor,
  copy: honor,
}));
const TILES = [...suitedTiles, ...honorTiles];
const TILE_BY_ID = Object.fromEntries(TILES.map((tile) => [tile.id, tile]));
const ALL_TILE_IDS = TILES.map((tile) => tile.id);

let state = loadState();
let history = [];
let analysis = analyzeState(state);
let toastTimer = 0;

const els = {
  stateChip: document.querySelector("#stateChip"),
  mainAdvice: document.querySelector("#mainAdvice"),
  winRateText: document.querySelector("#winRateText"),
  needText: document.querySelector("#needText"),
  outsText: document.querySelector("#outsText"),
  riskText: document.querySelector("#riskText"),
  adviceReason: document.querySelector("#adviceReason"),
  callAdvice: document.querySelector("#callAdvice"),
  drawOrderGroup: document.querySelector("#drawOrderGroup"),
  startButton: document.querySelector("#startButton"),
  finishHandButton: document.querySelector("#finishHandButton"),
  finishHandDockButton: document.querySelector("#finishHandDockButton"),
  resetAllButton: document.querySelector("#resetAllButton"),
  phaseText: document.querySelector("#phaseText"),
  lastDiscardText: document.querySelector("#lastDiscardText"),
  myHandList: document.querySelector("#myHandList"),
  clearHandButton: document.querySelector("#clearHandButton"),
  readsGrid: document.querySelector("#readsGrid"),
  playersGrid: document.querySelector("#playersGrid"),
  meldList: document.querySelector("#meldList"),
  meldHint: document.querySelector("#meldHint"),
  passButton: document.querySelector("#passButton"),
  autoCallButton: document.querySelector("#autoCallButton"),
  undoButton: document.querySelector("#undoButton"),
  copyButton: document.querySelector("#copyButton"),
  tilePadCaption: document.querySelector("#tilePadCaption"),
  tileGrid: document.querySelector("#tileGrid"),
  toast: document.querySelector("#toast"),
};

init();

function init() {
  renderDrawOrderControls();
  bindEvents();
  render();
}

function bindEvents() {
  els.startButton.addEventListener("click", startRound);
  els.finishHandButton.addEventListener("click", finishOpeningHand);
  els.finishHandDockButton.addEventListener("click", finishOpeningHand);
  els.resetAllButton.addEventListener("click", resetEverything);
  els.clearHandButton.addEventListener("click", clearHand);
  els.passButton.addEventListener("click", passCall);
  els.autoCallButton.addEventListener("click", acceptRecommendedCall);
  els.undoButton.addEventListener("click", undo);
  els.copyButton.addEventListener("click", copySnapshot);
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undo();
    }
  });
}

function defaultState() {
  return {
    started: false,
    phase: "setup",
    myDrawOrder: 1,
    currentPlayer: "我",
    players: createPlayers(),
    myHand: [],
    melds: [],
    pendingDraw: null,
    pendingCall: null,
    sequence: 0,
  };
}

function createPlayers() {
  return PLAYERS.map((name) => ({
    name,
    discards: [],
    melds: [],
  }));
}

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!stored || !Array.isArray(stored.players)) return defaultState();
    const base = defaultState();
    return {
      ...base,
      ...stored,
      myDrawOrder: clamp(Number(stored.myDrawOrder) || 1, 1, 4),
      players: PLAYERS.map((name) => {
        const old = stored.players.find((player) => player.name === name);
        return { name, discards: old?.discards || [], melds: old?.melds || [] };
      }),
      myHand: stored.myHand || [],
      melds: stored.melds || [],
    };
  } catch {
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function pushHistory() {
  history.push(JSON.stringify(state));
  if (history.length > 80) history.shift();
}

function renderDrawOrderControls() {
  els.drawOrderGroup.innerHTML = "";
  PLAYERS.forEach((_, index) => {
    const order = index + 1;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `第${order}摸`;
    button.addEventListener("click", () => {
      pushHistory();
      state.myDrawOrder = order;
      state.currentPlayer = playerForTurn(0);
      render();
    });
    els.drawOrderGroup.append(button);
  });
}

function render() {
  analysis = analyzeState(state);
  renderSetup();
  renderCoach();
  renderHand();
  renderReads();
  renderPlayers();
  renderMelds();
  renderTileGrid();
  saveState();
}

function renderSetup() {
  [...els.drawOrderGroup.children].forEach((button, index) => {
    button.classList.toggle("active", index + 1 === state.myDrawOrder);
  });
  els.stateChip.textContent = state.started ? `第${state.myDrawOrder}摸 · ${phaseLabel()}` : "未開局";
  els.phaseText.textContent = phaseLabel();
  const last = getLastDiscard();
  els.lastDiscardText.textContent = last ? `${tileLabel(last.tileId)} · ${last.by}` : "無";
  els.finishHandButton.disabled = !state.started || state.myHand.length < 13 || state.phase === "playing";
  els.finishHandDockButton.disabled = !state.started || state.myHand.length < 13 || state.phase === "playing";
  els.passButton.disabled = !state.pendingCall;
  els.autoCallButton.disabled = !state.pendingCall || !analysis.recommendedCall;

  if (state.phase === "opening") {
    els.tilePadCaption.textContent = `起手錄牌：已錄 ${state.myHand.length} 張`;
  } else if (state.phase === "my-draw") {
    els.tilePadCaption.textContent = "輪到你：先點剛摸到的牌";
  } else if (state.phase === "my-discard") {
    els.tilePadCaption.textContent = "點手牌打出，或照上方建議";
  } else if (state.pendingCall) {
    els.tilePadCaption.textContent = "先決定吃碰槓或過";
  } else {
    els.tilePadCaption.textContent = `${state.currentPlayer} 打牌：點他打出的牌`;
  }
}

function renderCoach() {
  const best = analysis.bestDiscard;
  const call = analysis.recommendedCall;
  if (state.phase === "opening") {
    els.mainAdvice.textContent = `錄起手牌 ${state.myHand.length}/16`;
    els.adviceReason.textContent = "台麻通常起手 16 張。先快速點完手牌，再按開始實戰；若你只想先估，也可以 13 張後開始。";
  } else if (state.pendingCall) {
    els.mainAdvice.textContent = call?.action === "pass"
      ? `建議過 ${tileLabel(state.pendingCall.tileId)}`
      : `建議${call.action} ${tileLabel(state.pendingCall.tileId)}`;
    els.adviceReason.textContent = call?.reason || "目前叫牌後效率提升有限，先保留手牌彈性。";
  } else if (state.phase === "my-draw") {
    els.mainAdvice.textContent = "先點摸到的牌";
    els.adviceReason.textContent = "點完摸牌後，APP 會把它加入手牌並立即高亮推薦棄牌。";
  } else if (state.phase === "my-discard" && best) {
    els.mainAdvice.textContent = `打 ${tileLabel(best.tileId)}`;
    els.adviceReason.textContent = best.reason;
  } else {
    els.mainAdvice.textContent = `${state.currentPlayer} 打牌`;
    els.adviceReason.textContent = "其他人打出牌後，APP 會立刻判斷你能不能吃碰槓，以及要不要叫。";
  }

  els.winRateText.textContent = `${analysis.winRate}%`;
  els.needText.textContent = analysis.needText;
  els.outsText.textContent = analysis.outsText;
  els.riskText.textContent = analysis.riskText;

  renderCallAdvice();
}

function renderCallAdvice() {
  els.callAdvice.innerHTML = "";
  if (!state.pendingCall) {
    els.callAdvice.hidden = true;
    return;
  }

  const call = analysis.recommendedCall;
  const banner = document.createElement("div");
  banner.className = "call-banner";
  banner.innerHTML = `<strong>${call?.action === "pass" ? "建議過" : `建議${call?.action}`}</strong><span>${call?.reason || "目前沒有明顯叫牌價值。"}</span>`;
  const buttons = document.createElement("div");
  buttons.className = "call-buttons";

  const pass = document.createElement("button");
  pass.type = "button";
  pass.className = call?.action === "pass" ? "call-button primary" : "call-button ghost";
  pass.textContent = "過";
  pass.addEventListener("click", passCall);
  buttons.append(pass);

  state.pendingCall.options.forEach((option) => {
    const optionButton = document.createElement("button");
    optionButton.type = "button";
    optionButton.className = call?.action === option.action ? "call-button primary" : "call-button secondary";
    optionButton.textContent = call?.action === option.action ? `建議${option.action}` : option.action;
    optionButton.addEventListener("click", () => {
      pushHistory();
      applyCall(option);
      render();
    });
    buttons.append(optionButton);
  });

  els.callAdvice.append(banner, buttons);
  els.callAdvice.hidden = false;
}

function renderHand() {
  els.myHandList.innerHTML = "";
  if (!state.myHand.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "起手或摸牌時點下方牌加入";
    els.myHandList.append(empty);
    return;
  }

  sortHand(state.myHand).forEach((entry) => {
    const chip = makeTileChip(entry.tileId, "small");
    if (entry.drawn) chip.classList.add("drawn");
    if (analysis.bestDiscard?.entryId === entry.id) chip.classList.add("recommended");
    chip.tabIndex = 0;
    chip.role = "button";
    chip.title = state.phase === "my-discard" ? "打出這張" : "移除這張";
    chip.addEventListener("click", () => handleHandTileClick(entry.id));
    chip.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleHandTileClick(entry.id);
      }
    });
    els.myHandList.append(chip);
  });
}

function renderReads() {
  els.readsGrid.innerHTML = "";
  analysis.playerReads.forEach((read) => {
    const card = document.createElement("div");
    card.className = `read-card ${read.level}`;
    card.innerHTML = `<span>${read.name}</span><strong>${read.tenpai}%</strong><span>${read.note}</span>`;
    els.readsGrid.append(card);
  });
}

function renderPlayers() {
  els.playersGrid.innerHTML = "";
  state.players.forEach((player) => {
    const row = document.createElement("article");
    row.className = "player-row";
    if (state.phase === "opponent-discard" && player.name === state.currentPlayer) row.classList.add("active");

    const label = document.createElement("div");
    label.className = "player-label";
    label.innerHTML = `<strong>${player.name}</strong><span>${player.discards.length} 張棄牌</span>`;

    const river = document.createElement("div");
    river.className = "river-list";
    if (!player.discards.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "尚無棄牌";
      river.append(empty);
    } else {
      player.discards.forEach((discard) => {
        const chip = makeTileChip(discard.tileId, "small");
        if (discard.calledBy) {
          chip.classList.add("called");
          chip.dataset.call = discard.callType;
          chip.title = `${discard.callType}：${discard.calledBy}`;
        }
        river.append(chip);
      });
    }

    row.append(label, river);
    els.playersGrid.append(row);
  });
}

function renderMelds() {
  els.meldList.innerHTML = "";
  els.meldHint.textContent = state.melds.length ? `${state.melds.length} 組副露` : "吃碰槓會自動扣手牌";
  if (!state.melds.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "尚未副露";
    els.meldList.append(empty);
    return;
  }

  state.melds.slice().reverse().forEach((meld) => {
    const item = document.createElement("div");
    item.className = "meld-item";
    const text = document.createElement("div");
    text.innerHTML = `<strong>${meld.type} ${tileLabel(meld.taken)}</strong><br><span>取自 ${meld.from}</span>`;
    const tiles = document.createElement("div");
    tiles.className = "meld-tiles";
    meld.tiles.forEach((tileId) => tiles.append(makeTileChip(tileId, "small")));
    item.append(text, tiles);
    els.meldList.append(item);
  });
}

function renderTileGrid() {
  els.tileGrid.innerHTML = "";
  TILE_GROUPS.forEach((group) => {
    const row = document.createElement("div");
    row.className = `tile-suit-row tile-suit-row-${group.suit}`;
    row.setAttribute("aria-label", `${group.label}牌`);
    TILES.filter((tile) => tile.suit === group.suit).forEach((tile) => {
      const button = document.createElement("button");
      button.className = "tile-button";
      button.type = "button";
      button.title = tile.label;
      button.append(makeTileChip(tile.id));
      button.addEventListener("click", () => handleTilePadClick(tile.id));
      row.append(button);
    });
    els.tileGrid.append(row);
  });
}

function startRound() {
  pushHistory();
  state = {
    ...defaultState(),
    started: true,
    phase: "opening",
    myDrawOrder: state.myDrawOrder,
  };
  state.currentPlayer = playerForTurn(0);
  render();
  showToast("開始錄起手牌");
}

function finishOpeningHand() {
  if (!state.started) return showToast("先開局");
  if (state.myHand.length < 13) return showToast("手牌太少，先錄到至少 13 張");
  pushHistory();
  state.phase = state.currentPlayer === "我" ? "my-draw" : "opponent-discard";
  clearDrawnFlags();
  render();
  showToast(state.phase === "my-draw" ? "輪到你，先點摸到的牌" : `${state.currentPlayer} 打牌`);
}

function resetEverything() {
  pushHistory();
  state = defaultState();
  render();
  showToast("已清空");
}

function clearHand() {
  if (!state.myHand.length) return showToast("手牌已經是空的");
  pushHistory();
  state.myHand = [];
  state.pendingDraw = null;
  render();
  showToast("已清手牌");
}

function handleTilePadClick(tileId) {
  if (state.phase === "opening") {
    pushHistory();
    addHandEntry(tileId, false);
    render();
    return;
  }

  if (!state.started) {
    showToast("先選摸牌順位並開局");
    return;
  }

  if (state.pendingCall) {
    showToast("先決定吃碰槓或過");
    return;
  }

  if (state.phase === "my-draw") {
    pushHistory();
    clearDrawnFlags();
    const entry = addHandEntry(tileId, true);
    state.pendingDraw = entry.id;
    state.phase = "my-discard";
    render();
    showToast(`摸 ${tileLabel(tileId)}，看上方建議打牌`);
    return;
  }

  if (state.phase === "my-discard") {
    showToast("現在請點手牌裡要打出的牌");
    return;
  }

  if (state.phase === "opponent-discard") {
    pushHistory();
    addDiscard(state.currentPlayer, tileId);
    createPendingCall(tileId, state.currentPlayer);
    render();
  }
}

function handleHandTileClick(entryId) {
  const entry = state.myHand.find((item) => item.id === entryId);
  if (!entry) return;

  if (state.phase === "my-discard") {
    pushHistory();
    discardMyEntry(entryId);
    advanceTurnFrom("我");
    clearDrawnFlags();
    render();
    return;
  }

  if (state.phase === "opening") {
    pushHistory();
    state.myHand = state.myHand.filter((item) => item.id !== entryId);
    render();
    return;
  }

  showToast("只有輪到你出牌時，點手牌才會打出");
}

function addHandEntry(tileId, drawn) {
  const entry = {
    id: `h${Date.now()}-${state.sequence++}`,
    tileId,
    drawn,
  };
  state.myHand.push(entry);
  return entry;
}

function discardMyEntry(entryId) {
  const entry = state.myHand.find((item) => item.id === entryId);
  if (!entry) return;
  state.myHand = state.myHand.filter((item) => item.id !== entryId);
  addDiscard("我", entry.tileId);
  state.pendingDraw = null;
}

function addDiscard(playerName, tileId) {
  const player = getPlayer(playerName);
  const discard = {
    id: `d${Date.now()}-${state.sequence++}`,
    tileId,
    by: playerName,
    order: state.sequence,
    calledBy: null,
    callType: null,
  };
  player.discards.push(discard);
  return discard;
}

function createPendingCall(tileId, from) {
  const options = getCallOptions(tileId, from);
  if (!options.length) {
    advanceTurnFrom(from);
    return;
  }
  state.pendingCall = {
    tileId,
    from,
    options,
  };
}

function getCallOptions(tileId, from) {
  if (from === "我") return [];
  const options = [];
  const sameCount = countTile(state.myHand, tileId);
  if (sameCount >= 2) {
    options.push({ action: "碰", tiles: repeatTile(tileId, 3), consume: repeatTile(tileId, 2) });
  }
  if (sameCount >= 3) {
    options.push({ action: "槓", tiles: repeatTile(tileId, 4), consume: repeatTile(tileId, 3) });
  }
  if (from === "上家") {
    const tile = TILE_BY_ID[tileId];
    if (tile?.suit !== "honor") {
      chiOptions(tile).forEach((option) => {
        if (option.companions.every((id) => countTile(state.myHand, id) >= option.companions.filter((x) => x === id).length)) {
          options.push({ action: "吃", tiles: option.sequence, consume: option.companions });
        }
      });
    }
  }
  return options;
}

function passCall() {
  if (!state.pendingCall) return;
  pushHistory();
  const from = state.pendingCall.from;
  state.pendingCall = null;
  advanceTurnFrom(from);
  render();
}

function acceptRecommendedCall() {
  const call = analysis.recommendedCall;
  if (!state.pendingCall || !call) return;
  if (call.action === "pass") {
    passCall();
    return;
  }
  pushHistory();
  applyCall(call);
  render();
}

function applyCall(call) {
  const pending = state.pendingCall;
  const last = getLastDiscard();
  if (last && last.tileId === pending.tileId && last.by === pending.from) {
    last.calledBy = "我";
    last.callType = call.action;
  }
  removeTilesFromHand(call.consume);
  state.melds.push({
    id: `m${Date.now()}-${state.sequence++}`,
    type: call.action,
    from: pending.from,
    taken: pending.tileId,
    tiles: call.tiles,
  });
  getPlayer("我").melds.push(call.action);
  state.pendingCall = null;
  state.phase = "my-discard";
  clearDrawnFlags();
  showToast(`${call.action} ${tileLabel(pending.tileId)}，請打出一張`);
}

function advanceTurnFrom(playerName) {
  const next = nextPlayer(playerName);
  state.currentPlayer = next;
  state.phase = next === "我" ? "my-draw" : "opponent-discard";
}

function undo() {
  const previous = history.pop();
  if (!previous) return showToast("沒有可撤回的操作");
  state = JSON.parse(previous);
  render();
  showToast("已撤回一步");
}

async function copySnapshot() {
  const text = buildSnapshotText();
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.append(textArea);
    textArea.select();
    document.execCommand("copy");
    textArea.remove();
  }
  showToast("已複製");
}

function buildSnapshotText() {
  const last = getLastDiscard();
  const lines = [
    "規則：台麻",
    `我這局第幾個摸牌：第${state.myDrawOrder}摸`,
    `目前節奏：${phaseLabel()}`,
    `上一張：${last ? `${tileCopy(last.tileId)}（${last.by}）` : "無"}`,
    `即時建議：${els.mainAdvice.textContent}`,
    `估算勝率：${analysis.winRate}%`,
    `我的手牌：${state.myHand.length ? sortHand(state.myHand).map((entry) => tileCopy(entry.tileId)).join(" ") : "未記錄"}`,
    "牌河：",
    ...state.players.map((player) => {
      const discards = player.discards.length
        ? player.discards.map((discard) => {
          const called = discard.calledBy ? `[被${discard.calledBy}${discard.callType}]` : "";
          return `${tileCopy(discard.tileId)}${called}`;
        }).join(" ")
        : "無";
      return `${player.name}：${discards}`;
    }),
    "我的副露：",
    ...(state.melds.length
      ? state.melds.map((meld) => `${meld.type}${tileCopy(meld.taken)}，取自${meld.from}，牌組：${meld.tiles.map(tileCopy).join(" ")}`)
      : ["無"]),
    "他家聽牌預測：",
    ...analysis.playerReads.map((read) => `${read.name}：${read.tenpai}% ${read.note}`),
  ];
  return lines.join("\n");
}

function analyzeState(currentState) {
  const visible = visibleCounts(currentState);
  const remaining = remainingCounts(visible);
  const handIds = currentState.myHand.map((entry) => entry.tileId);
  const baseEval = evaluateHand(handIds, remaining);
  const discardOptions = bestDiscardOptions(currentState, remaining);
  const bestDiscard = discardOptions[0] || null;
  const playerReads = estimatePlayerReads(currentState);
  const recommendedCall = recommendCall(currentState, remaining);

  const outs = bestDiscard?.outs ?? baseEval.outs;
  const need = bestDiscard?.afterNeed ?? baseEval.need;
  const pressure = Math.max(...playerReads.map((read) => read.tenpai), 0);
  const winRate = estimateWinRate(need, outs, currentState.myHand.length, pressure);
  const risk = bestDiscard ? discardRisk(bestDiscard.tileId, currentState, playerReads) : 0;

  return {
    baseEval,
    bestDiscard,
    discardOptions,
    playerReads,
    recommendedCall,
    winRate,
    needText: need <= 0 ? "聽牌/和牌" : `${need} 向`,
    outsText: outs ? `${outs} 張` : "--",
    riskText: riskLabel(risk),
  };
}

function bestDiscardOptions(currentState, remaining) {
  const hand = currentState.myHand;
  if (!hand.length) return [];
  const uniqueEntries = hand.map((entry) => entry.id);
  const options = uniqueEntries.map((entryId) => {
    const entry = hand.find((item) => item.id === entryId);
    const after = hand.filter((item) => item.id !== entryId).map((item) => item.tileId);
    const evalResult = evaluateHand(after, remaining);
    const risk = discardRisk(entry.tileId, currentState, estimatePlayerReads(currentState));
    const score = evalResult.score - risk * 1.6 + (entry.drawn ? 1.2 : 0);
    return {
      entryId,
      tileId: entry.tileId,
      afterNeed: evalResult.need,
      outs: evalResult.outs,
      score,
      risk,
      reason: `保留後約 ${evalResult.outs} 張進張，${evalResult.need <= 0 ? "已接近聽牌" : `約 ${evalResult.need} 向`}；危險度${riskLabel(risk)}。`,
    };
  });
  return options.sort((a, b) => b.score - a.score);
}

function evaluateHand(tileIds, remaining) {
  const counts = countsFromTileIds(tileIds);
  const meldsNeeded = Math.max(0, 5 - state.melds.length);
  const blocks = [];
  let pairs = 0;

  ALL_TILE_IDS.forEach((tileId) => {
    const count = counts[tileId] || 0;
    if (count >= 3) blocks.push({ type: "meld", tileId });
    if (count >= 2) {
      pairs += 1;
      blocks.push({ type: "pair", tileId });
    }
  });

  ["wan", "tong", "tiao"].forEach((suit) => {
    for (let rank = 1; rank <= 7; rank += 1) {
      const ids = [`${suit}-${rank}`, `${suit}-${rank + 1}`, `${suit}-${rank + 2}`];
      if (ids.every((id) => (counts[id] || 0) > 0)) blocks.push({ type: "meld", tileId: ids.join(",") });
    }
    for (let rank = 1; rank <= 8; rank += 1) {
      const a = `${suit}-${rank}`;
      const b = `${suit}-${rank + 1}`;
      if ((counts[a] || 0) > 0 && (counts[b] || 0) > 0) blocks.push({ type: "taatsu", tileId: `${a},${b}` });
    }
    for (let rank = 1; rank <= 7; rank += 1) {
      const a = `${suit}-${rank}`;
      const b = `${suit}-${rank + 2}`;
      if ((counts[a] || 0) > 0 && (counts[b] || 0) > 0) blocks.push({ type: "taatsu", tileId: `${a},${b}` });
    }
  });

  const meldCount = blocks.filter((block) => block.type === "meld").length;
  const taatsuCount = blocks.filter((block) => block.type === "taatsu").length + Math.max(0, pairs - 1);
  const cappedMelds = Math.min(meldsNeeded, meldCount);
  const cappedTaatsu = Math.min(Math.max(0, meldsNeeded - cappedMelds), taatsuCount);
  const hasPair = pairs > 0;
  const need = Math.max(0, meldsNeeded * 2 + 1 - cappedMelds * 2 - cappedTaatsu - (hasPair ? 1 : 0));
  const waits = usefulDraws(tileIds, remaining, need);
  const shapeBonus = cappedMelds * 8 + cappedTaatsu * 3 + (hasPair ? 3 : 0);
  return {
    need,
    outs: waits.outs,
    useful: waits.tiles,
    score: shapeBonus + waits.outs * 0.55 - need * 8,
  };
}

function usefulDraws(tileIds, remaining, currentNeed) {
  const tiles = [];
  let outs = 0;
  ALL_TILE_IDS.forEach((tileId) => {
    const left = remaining[tileId] || 0;
    if (left <= 0) return;
    const after = rawEvaluateNeed([...tileIds, tileId]);
    if (after <= currentNeed) {
      tiles.push(tileId);
      outs += left;
    }
  });
  return { tiles, outs };
}

function rawEvaluateNeed(tileIds) {
  const counts = countsFromTileIds(tileIds);
  let melds = 0;
  let pairs = 0;
  let taatsu = 0;
  ALL_TILE_IDS.forEach((tileId) => {
    const count = counts[tileId] || 0;
    if (count >= 3) melds += 1;
    if (count >= 2) pairs += 1;
  });
  ["wan", "tong", "tiao"].forEach((suit) => {
    for (let rank = 1; rank <= 7; rank += 1) {
      if ([rank, rank + 1, rank + 2].every((r) => (counts[`${suit}-${r}`] || 0) > 0)) melds += 1;
    }
    for (let rank = 1; rank <= 8; rank += 1) {
      if ((counts[`${suit}-${rank}`] || 0) > 0 && (counts[`${suit}-${rank + 1}`] || 0) > 0) taatsu += 1;
    }
    for (let rank = 1; rank <= 7; rank += 1) {
      if ((counts[`${suit}-${rank}`] || 0) > 0 && (counts[`${suit}-${rank + 2}`] || 0) > 0) taatsu += 1;
    }
  });
  const cappedMelds = Math.min(5, melds + state.melds.length);
  const cappedTaatsu = Math.min(Math.max(0, 5 - cappedMelds), taatsu + Math.max(0, pairs - 1));
  return Math.max(0, 11 - cappedMelds * 2 - cappedTaatsu - (pairs ? 1 : 0));
}

function recommendCall(currentState, remaining) {
  const pending = currentState.pendingCall;
  if (!pending) return null;
  const before = evaluateHand(currentState.myHand.map((entry) => entry.tileId), remaining);
  const candidates = pending.options.map((option) => {
    const afterHand = removeTileIds(currentState.myHand.map((entry) => entry.tileId), option.consume);
    const afterEval = evaluateHand(afterHand, remaining);
    const delta = afterEval.score - before.score;
    const actionBonus = option.action === "槓" ? -2 : option.action === "碰" ? 0.5 : 0;
    const score = delta + actionBonus;
    return {
      ...option,
      score,
      afterEval,
      reason: `${option.action}後約 ${afterEval.outs} 張進張；${score > 0 ? "速度有提升" : "會降低手牌彈性"}。`,
    };
  }).sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best || best.score < 1.2) {
    return { action: "pass", reason: "叫牌後效率提升不夠，先過比較穩。" };
  }
  return best;
}

function estimatePlayerReads(currentState) {
  return currentState.players.filter((player) => player.name !== "我").map((player) => {
    const discards = player.discards.length;
    const melds = player.melds.length;
    const recentHonors = player.discards.slice(-4).filter((discard) => TILE_BY_ID[discard.tileId]?.suit === "honor").length;
    const terminals = player.discards.filter((discard) => isTerminalOrHonor(discard.tileId)).length;
    let tenpai = 8 + discards * 4 + melds * 12;
    if (discards >= 10) tenpai += 10;
    if (recentHonors >= 2 && discards >= 7) tenpai += 8;
    if (terminals >= 5 && discards >= 8) tenpai += 6;
    tenpai = clamp(Math.round(tenpai), 5, 92);
    const level = tenpai >= 65 ? "high" : tenpai >= 38 ? "mid" : "low";
    const note = tenpai >= 65 ? "高度警戒" : tenpai >= 38 ? "可能成形" : "壓力低";
    return { name: player.name, tenpai, level, note };
  });
}

function discardRisk(tileId, currentState, reads) {
  const tile = TILE_BY_ID[tileId];
  const visible = visibleCounts(currentState)[tileId] || 0;
  let risk = Math.max(...reads.map((read) => read.tenpai), 0) / 16;
  if (visible >= 3) risk -= 2.2;
  if (visible === 2) risk -= 1;
  if (tile.suit === "honor") risk += visible === 0 ? 2.2 : -0.8;
  if (isTerminalOrHonor(tileId)) risk -= 0.5;
  if (tile.suit !== "honor" && tile.rank >= 4 && tile.rank <= 6) risk += 1.3;
  if (tile.suit !== "honor" && tile.rank >= 2 && tile.rank <= 8) risk += 0.5;
  return clamp(Number(risk.toFixed(1)), 0, 10);
}

function estimateWinRate(need, outs, handSize, pressure) {
  let rate = 8;
  rate += Math.max(0, 5 - need) * 9;
  rate += Math.min(outs, 40) * 0.8;
  if (handSize >= 16) rate += 3;
  rate -= pressure * 0.12;
  return clamp(Math.round(rate), 3, 88);
}

function visibleCounts(currentState) {
  const counts = Object.fromEntries(ALL_TILE_IDS.map((id) => [id, 0]));
  currentState.myHand.forEach((entry) => { counts[entry.tileId] += 1; });
  currentState.players.forEach((player) => {
    player.discards.forEach((discard) => { counts[discard.tileId] += 1; });
  });
  currentState.melds.forEach((meld) => {
    meld.tiles.forEach((tileId, index) => {
      if (tileId === meld.taken && index === meld.tiles.indexOf(meld.taken)) return;
      counts[tileId] += 1;
    });
  });
  return counts;
}

function remainingCounts(visible) {
  const counts = {};
  ALL_TILE_IDS.forEach((tileId) => {
    counts[tileId] = Math.max(0, 4 - (visible[tileId] || 0));
  });
  return counts;
}

function countsFromTileIds(tileIds) {
  const counts = Object.fromEntries(ALL_TILE_IDS.map((id) => [id, 0]));
  tileIds.forEach((tileId) => { counts[tileId] += 1; });
  return counts;
}

function chiOptions(tile) {
  const options = [];
  [tile.rank - 2, tile.rank - 1, tile.rank].forEach((start) => {
    const ranks = [start, start + 1, start + 2];
    if (ranks.every((rank) => rank >= 1 && rank <= 9) && ranks.includes(tile.rank)) {
      const sequence = ranks.map((rank) => `${tile.suit}-${rank}`);
      const companions = sequence.filter((tileId) => tileId !== tile.id);
      options.push({ sequence, companions });
    }
  });
  return options;
}

function makeTileChip(tileId, size = "") {
  const tile = TILE_BY_ID[tileId];
  const chip = document.createElement("span");
  chip.className = `tile-chip ${tileClass(tile)} ${size}`.trim();
  chip.setAttribute("aria-label", tile?.label || tileId);
  const text = document.createElement("span");
  text.className = "tile-text";
  const rank = document.createElement("span");
  rank.className = "tile-rank";
  rank.textContent = tile?.suit === "honor" ? tile.label : numberLabels[tile.rank];
  text.append(rank);
  if (tile?.suit !== "honor") {
    const suit = document.createElement("span");
    suit.className = "tile-suit";
    suit.textContent = suitName(tile.suit);
    text.append(suit);
  }
  chip.append(text);
  return chip;
}

function tileClass(tile) {
  if (!tile) return "";
  if (tile.suit === "wan") return "tile-wan";
  if (tile.suit === "tong") return "tile-tong";
  if (tile.suit === "tiao") return "tile-tiao";
  if (tile.label === "中") return "tile-dragon-red";
  if (tile.label === "發") return "tile-dragon-green";
  return "tile-honor";
}

function getPlayer(name) {
  return state.players.find((player) => player.name === name);
}

function getLastDiscard() {
  const discards = state.players.flatMap((player) => player.discards);
  return discards.sort((a, b) => b.order - a.order)[0] || null;
}

function nextPlayer(playerName) {
  return PLAYERS[(PLAYERS.indexOf(playerName) + 1) % PLAYERS.length];
}

function playerForTurn(turnIndex) {
  return PLAYERS[(turnIndex - (state.myDrawOrder - 1) + 4) % 4];
}

function clearDrawnFlags() {
  state.myHand.forEach((entry) => { entry.drawn = false; });
}

function countTile(handEntries, tileId) {
  return handEntries.filter((entry) => entry.tileId === tileId).length;
}

function removeTilesFromHand(tileIds) {
  tileIds.forEach((tileId) => {
    const index = state.myHand.findIndex((entry) => entry.tileId === tileId);
    if (index !== -1) state.myHand.splice(index, 1);
  });
}

function removeTileIds(tileIds, removeIds) {
  const next = [...tileIds];
  removeIds.forEach((tileId) => {
    const index = next.indexOf(tileId);
    if (index !== -1) next.splice(index, 1);
  });
  return next;
}

function repeatTile(tileId, count) {
  return Array.from({ length: count }, () => tileId);
}

function sortHand(hand) {
  return [...hand].sort((a, b) => tileSortValue(a.tileId) - tileSortValue(b.tileId) || a.id.localeCompare(b.id));
}

function tileSortValue(tileId) {
  const tile = TILE_BY_ID[tileId];
  const suitBase = { wan: 0, tong: 20, tiao: 40, honor: 60 }[tile?.suit] ?? 90;
  return suitBase + (tile?.rank || 0);
}

function isTerminalOrHonor(tileId) {
  const tile = TILE_BY_ID[tileId];
  return tile?.suit === "honor" || tile?.rank === 1 || tile?.rank === 9;
}

function tileLabel(tileId) {
  return TILE_BY_ID[tileId]?.label || tileId;
}

function tileCopy(tileId) {
  return TILE_BY_ID[tileId]?.copy || tileId;
}

function suitName(suit) {
  return { wan: "萬", tong: "筒", tiao: "條", honor: "字" }[suit] || suit;
}

function suitCode(suit) {
  return { wan: "萬", tong: "筒", tiao: "條" }[suit] || "";
}

function phaseLabel() {
  if (!state.started) return "先開局";
  if (state.phase === "opening") return "錄起手牌";
  if (state.phase === "my-draw") return "我摸牌";
  if (state.phase === "my-discard") return "我打牌";
  if (state.pendingCall) return "可吃碰槓";
  return `${state.currentPlayer}打牌`;
}

function riskLabel(value) {
  if (value >= 7) return "高";
  if (value >= 4) return "中";
  return "低";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("show");
  toastTimer = window.setTimeout(() => {
    els.toast.classList.remove("show");
  }, 1500);
}
