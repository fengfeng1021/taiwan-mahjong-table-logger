const HONORS = ["東", "南", "西", "北", "中", "發", "白"];
const WINDS = ["東", "南", "西", "北"];
const WIND_ORDER = ["東", "南", "西", "北"];
const STORAGE_KEY = "tw-mahjong-table-logger-v1";
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

const honorTiles = HONORS.map((honor) => ({
  id: `honor-${honor}`,
  suit: "honor",
  rank: honor,
  label: honor,
  copy: honor,
}));

const TILES = [...suitedTiles, ...honorTiles];
const TILE_BY_ID = Object.fromEntries(TILES.map((tile) => [tile.id, tile]));

let state = loadState();
let history = [];
let toastTimer = 0;

const els = {
  stateChip: document.querySelector("#stateChip"),
  roundMarkerGroup: document.querySelector("#roundMarkerGroup"),
  seatGroup: document.querySelector("#seatGroup"),
  startButton: document.querySelector("#startButton"),
  nextRoundButton: document.querySelector("#nextRoundButton"),
  resetAllButton: document.querySelector("#resetAllButton"),
  currentTurnText: document.querySelector("#currentTurnText"),
  lastDiscardText: document.querySelector("#lastDiscardText"),
  myHandList: document.querySelector("#myHandList"),
  clearHandButton: document.querySelector("#clearHandButton"),
  playersGrid: document.querySelector("#playersGrid"),
  meldList: document.querySelector("#meldList"),
  meldHint: document.querySelector("#meldHint"),
  modeRiverButton: document.querySelector("#modeRiverButton"),
  modeHandButton: document.querySelector("#modeHandButton"),
  chiButton: document.querySelector("#chiButton"),
  pongButton: document.querySelector("#pongButton"),
  kongButton: document.querySelector("#kongButton"),
  undoButton: document.querySelector("#undoButton"),
  copyButton: document.querySelector("#copyButton"),
  tileGrid: document.querySelector("#tileGrid"),
  modalBackdrop: document.querySelector("#modalBackdrop"),
  modalTitle: document.querySelector("#modalTitle"),
  modalBody: document.querySelector("#modalBody"),
  modalCloseButton: document.querySelector("#modalCloseButton"),
  toast: document.querySelector("#toast"),
};

init();

function init() {
  renderSetupControls();
  bindEvents();
  render();
}

function bindEvents() {
  els.startButton.addEventListener("click", startCurrentRound);
  els.nextRoundButton.addEventListener("click", nextRound);
  els.resetAllButton.addEventListener("click", resetEverything);
  els.clearHandButton.addEventListener("click", clearHand);
  els.modeRiverButton.addEventListener("click", () => setMode("river"));
  els.modeHandButton.addEventListener("click", () => setMode("hand"));
  els.chiButton.addEventListener("click", openChiModal);
  els.pongButton.addEventListener("click", () => openCallModal("碰"));
  els.kongButton.addEventListener("click", () => openCallModal("槓"));
  els.undoButton.addEventListener("click", undo);
  els.copyButton.addEventListener("click", copySnapshot);
  els.modalCloseButton.addEventListener("click", closeModal);
  els.modalBackdrop.addEventListener("click", (event) => {
    if (event.target === els.modalBackdrop) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undo();
    }
    if (event.key === "Escape") closeModal();
  });
}

function defaultState() {
  return {
    started: false,
    mode: "river",
    roundMarker: "東",
    mySeat: "南",
    currentSeat: "東",
    players: createPlayers("南"),
    myHand: [],
    melds: [],
    actionLog: [],
    sequence: 0,
  };
}

function createPlayers(mySeat) {
  return WIND_ORDER.map((seat) => ({
    seat,
    relative: relativeName(seat, mySeat),
    discards: [],
  }));
}

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!stored || !Array.isArray(stored.players)) return defaultState();
    return {
      ...defaultState(),
      ...stored,
      players: WIND_ORDER.map((seat) => {
        const found = stored.players.find((player) => player.seat === seat);
        return {
          seat,
          relative: relativeName(seat, stored.mySeat || "南"),
          discards: found?.discards || [],
        };
      }),
      myHand: stored.myHand || [],
      melds: stored.melds || [],
      actionLog: stored.actionLog || [],
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

function renderSetupControls() {
  els.roundMarkerGroup.innerHTML = "";
  HONORS.forEach((honor) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = honor;
    button.addEventListener("click", () => {
      pushHistory();
      state.roundMarker = honor;
      saveState();
      render();
    });
    els.roundMarkerGroup.append(button);
  });

  els.seatGroup.innerHTML = "";
  WINDS.forEach((wind) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = wind;
    button.addEventListener("click", () => {
      pushHistory();
      state.mySeat = wind;
      state.players = createPlayers(wind).map((player) => ({
        ...player,
        discards: state.players.find((oldPlayer) => oldPlayer.seat === player.seat)?.discards || [],
      }));
      saveState();
      render();
    });
    els.seatGroup.append(button);
  });
}

function render() {
  updateSetupButtons();
  updateStatus();
  renderHand();
  renderPlayers();
  renderMelds();
  renderMode();
  renderTileGrid();
  saveState();
}

function updateSetupButtons() {
  [...els.roundMarkerGroup.children].forEach((button) => {
    button.classList.toggle("active", button.textContent === state.roundMarker);
  });
  [...els.seatGroup.children].forEach((button) => {
    button.classList.toggle("active", button.textContent === state.mySeat);
  });
}

function updateStatus() {
  els.stateChip.textContent = state.started
    ? `${state.roundMarker}局牌 · 我${state.mySeat}`
    : "未開始";

  const current = getCurrentPlayer();
  els.currentTurnText.textContent = state.started
    ? `${playerTitle(current)} 出牌`
    : "先設定開局";

  const last = getLastDiscard();
  els.lastDiscardText.textContent = last
    ? `${tileLabel(last.tileId)} · ${playerTitle(getPlayer(last.seat))}`
    : "無";

  els.meldHint.textContent = last
    ? `可對 ${tileLabel(last.tileId)} 記錄吃碰槓`
    : "上一張棄牌後可記錄";
}

function renderHand() {
  els.myHandList.innerHTML = "";
  if (!state.myHand.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "切到「手牌」後點牌加入；點手牌可移除";
    els.myHandList.append(empty);
    return;
  }

  sortHand(state.myHand).forEach((tileId, index) => {
    const chip = makeTileChip(tileId, "small");
    chip.tabIndex = 0;
    chip.role = "button";
    chip.title = "移除這張手牌";
    chip.addEventListener("click", () => removeHandTile(tileId));
    chip.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        removeHandTile(tileId);
      }
    });
    chip.dataset.index = String(index);
    els.myHandList.append(chip);
  });
}

function renderPlayers() {
  els.playersGrid.innerHTML = "";
  state.players.forEach((player) => {
    const row = document.createElement("article");
    row.className = "player-row";
    if (state.started && player.seat === state.currentSeat) row.classList.add("active");

    const label = document.createElement("div");
    label.className = "player-label";
    label.innerHTML = `<strong>${playerTitle(player)}</strong><span>${player.seat}家 · ${player.discards.length}張</span>`;

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
          chip.title = `${discard.callType}：${playerTitle(getPlayer(discard.calledBy))}`;
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
  if (!state.melds.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "尚未記錄吃碰槓";
    els.meldList.append(empty);
    return;
  }

  state.melds.slice().reverse().forEach((meld) => {
    const item = document.createElement("div");
    item.className = "meld-item";
    const text = document.createElement("div");
    text.innerHTML = `<strong>${playerTitle(getPlayer(meld.by))} ${meld.type}</strong><br><span>取自 ${playerTitle(getPlayer(meld.from))}</span>`;

    const tiles = document.createElement("div");
    tiles.className = "meld-tiles";
    meld.tiles.forEach((tileId) => tiles.append(makeTileChip(tileId, "small")));

    item.append(text, tiles);
    els.meldList.append(item);
  });
}

function renderMode() {
  els.modeRiverButton.classList.toggle("active", state.mode === "river");
  els.modeHandButton.classList.toggle("active", state.mode === "hand");
}

function renderTileGrid() {
  els.tileGrid.innerHTML = "";
  TILE_GROUPS.forEach((group) => {
    const row = document.createElement("div");
    row.className = `tile-suit-row tile-suit-row-${group.suit}`;
    row.setAttribute("aria-label", `${group.label}牌`);

    const tiles = TILES.filter((tile) => tile.suit === group.suit);
    tiles.forEach((tile) => {
      const button = document.createElement("button");
      button.className = "tile-button";
      button.type = "button";
      button.title = tile.label;
      button.append(makeTileChip(tile.id));
      button.addEventListener("click", () => handleTileClick(tile.id));
      row.append(button);
    });

    els.tileGrid.append(row);
  });
}

function setMode(mode) {
  state.mode = mode;
  render();
  showToast(mode === "hand" ? "手牌模式：點牌加入手牌" : "牌河模式：點牌記錄棄牌");
}

function startCurrentRound() {
  pushHistory();
  state.started = true;
  state.currentSeat = "東";
  state.players = createPlayers(state.mySeat);
  state.melds = [];
  state.actionLog = [];
  state.sequence = 0;
  render();
  showToast("已開啟當前對局，從東家開始記錄");
}

function nextRound() {
  pushHistory();
  const index = HONORS.indexOf(state.roundMarker);
  state.roundMarker = HONORS[(index + 1) % HONORS.length];
  state.started = true;
  state.currentSeat = "東";
  state.players = createPlayers(state.mySeat);
  state.myHand = [];
  state.melds = [];
  state.actionLog = [];
  state.sequence = 0;
  render();
  showToast(`下一局：${state.roundMarker}局牌`);
}

function resetEverything() {
  pushHistory();
  state = defaultState();
  render();
  showToast("已清空所有記錄");
}

function clearHand() {
  if (!state.myHand.length) return showToast("手牌已經是空的");
  pushHistory();
  state.myHand = [];
  render();
  showToast("已清空我的手牌");
}

function handleTileClick(tileId) {
  if (state.mode === "hand") {
    addHandTile(tileId);
    return;
  }
  addDiscard(tileId);
}

function addHandTile(tileId) {
  pushHistory();
  state.myHand.push(tileId);
  render();
}

function removeHandTile(tileId) {
  const index = state.myHand.indexOf(tileId);
  if (index === -1) return;
  pushHistory();
  state.myHand.splice(index, 1);
  render();
}

function addDiscard(tileId) {
  if (!state.started) {
    showToast("先按「開啟當前對局」");
    return;
  }

  pushHistory();
  const player = getCurrentPlayer();
  const discard = {
    id: `d${Date.now()}-${state.sequence}`,
    tileId,
    seat: player.seat,
    order: state.sequence++,
    calledBy: null,
    callType: null,
  };
  player.discards.push(discard);
  if (player.seat === state.mySeat) removeOneFromHandWithoutHistory(tileId);
  state.actionLog.push({
    type: "discard",
    tileId,
    by: player.seat,
    order: discard.order,
  });
  state.currentSeat = nextSeat(player.seat);
  render();
}

function openChiModal() {
  const last = getCallableLastDiscard();
  if (!last) return showToast("沒有可吃的上一張棄牌");

  const tile = TILE_BY_ID[last.tileId];
  if (!tile || tile.suit === "honor") return showToast("字牌不能吃");

  const eater = nextSeat(last.seat);
  const options = chiOptions(tile);
  if (!options.length) return showToast("這張牌沒有合法吃法");

  openModal("選擇吃牌搭子", options.map((option) => ({
    title: `${playerTitle(getPlayer(eater))} 吃 ${tile.label}`,
    subtitle: `亮出 ${option.companions.map(tileLabel).join("、")}`,
    tiles: option.sequence,
    action: () => applyChi(last, eater, option),
  })));
}

function openCallModal(type) {
  const last = getCallableLastDiscard();
  if (!last) return showToast(`沒有可${type}的上一張棄牌`);

  const candidates = state.players.filter((player) => player.seat !== last.seat);
  openModal(`選擇${type}家`, candidates.map((player) => ({
    title: `${playerTitle(player)} ${type} ${tileLabel(last.tileId)}`,
    subtitle: `取自 ${playerTitle(getPlayer(last.seat))}`,
    tiles: repeatTile(last.tileId, type === "槓" ? 4 : 3),
    action: () => applyCall(type, last, player.seat),
  })));
}

function applyChi(last, eater, option) {
  pushHistory();
  markLastDiscardCalled(last, eater, "吃");
  const meld = {
    id: `m${Date.now()}-${state.sequence}`,
    type: "吃",
    by: eater,
    from: last.seat,
    taken: last.tileId,
    tiles: option.sequence,
    companions: option.companions,
    order: state.sequence++,
  };
  state.melds.push(meld);
  if (eater === state.mySeat) removeTilesFromHand(option.companions);
  state.currentSeat = eater;
  state.actionLog.push({ type: "吃", by: eater, from: last.seat, tileId: last.tileId });
  closeModal();
  render();
  showToast(`${playerTitle(getPlayer(eater))} 吃 ${tileLabel(last.tileId)}`);
}

function applyCall(type, last, caller) {
  pushHistory();
  markLastDiscardCalled(last, caller, type);
  const tiles = repeatTile(last.tileId, type === "槓" ? 4 : 3);
  state.melds.push({
    id: `m${Date.now()}-${state.sequence}`,
    type,
    by: caller,
    from: last.seat,
    taken: last.tileId,
    tiles,
    order: state.sequence++,
  });
  if (caller === state.mySeat) {
    removeTilesFromHand(repeatTile(last.tileId, type === "槓" ? 3 : 2));
  }
  state.currentSeat = caller;
  state.actionLog.push({ type, by: caller, from: last.seat, tileId: last.tileId });
  closeModal();
  render();
  showToast(`${playerTitle(getPlayer(caller))} ${type} ${tileLabel(last.tileId)}`);
}

function markLastDiscardCalled(last, caller, type) {
  const player = getPlayer(last.seat);
  const discard = player.discards.find((item) => item.id === last.id);
  if (!discard) return;
  discard.calledBy = caller;
  discard.callType = type;
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
    showToast("已複製，可以直接貼給我");
  } catch {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.append(textArea);
    textArea.select();
    document.execCommand("copy");
    textArea.remove();
    showToast("已複製，可以直接貼給我");
  }
}

function buildSnapshotText() {
  const current = getCurrentPlayer();
  const last = getLastDiscard();
  const lines = [
    "規則：台麻",
    `局牌：${state.roundMarker}`,
    `我坐：${state.mySeat}家`,
    `目前輪到：${state.started ? playerTitle(current) : "未開始"}`,
    `上一張：${last ? `${tileLabel(last.tileId)}（${playerTitle(getPlayer(last.seat))}）` : "無"}`,
    `我的手牌：${state.myHand.length ? sortHand(state.myHand).map(tileCopy).join(" ") : "未記錄"}`,
    "牌河：",
    ...state.players.map((player) => {
      const discards = player.discards.length
        ? player.discards.map((discard) => {
          const called = discard.calledBy
            ? `[被${playerTitle(getPlayer(discard.calledBy))}${discard.callType}]`
            : "";
          return `${tileCopy(discard.tileId)}${called}`;
        }).join(" ")
        : "無";
      return `${playerTitle(player)}：${discards}`;
    }),
    "副露：",
    ...(state.melds.length
      ? state.melds.map((meld) => {
        const tiles = meld.tiles.map(tileCopy).join(" ");
        return `${playerTitle(getPlayer(meld.by))}${meld.type}${tileCopy(meld.taken)}，取自${playerTitle(getPlayer(meld.from))}，牌組：${tiles}`;
      })
      : ["無"]),
    "請根據我的手牌、牌河與副露，輪到我時告訴我該打什麼。",
  ];
  return lines.join("\n");
}

function openModal(title, options) {
  els.modalTitle.textContent = title;
  els.modalBody.innerHTML = "";
  const list = document.createElement("div");
  list.className = "modal-options";
  options.forEach((option) => {
    const button = document.createElement("button");
    button.className = "option-button";
    button.type = "button";
    const text = document.createElement("div");
    text.innerHTML = `<strong>${option.title}</strong><br><span>${option.subtitle}</span>`;
    const tiles = document.createElement("div");
    tiles.className = "meld-tiles";
    option.tiles.forEach((tileId) => tiles.append(makeTileChip(tileId, "small")));
    button.append(text, tiles);
    button.addEventListener("click", option.action);
    list.append(button);
  });
  els.modalBody.append(list);
  els.modalBackdrop.hidden = false;
}

function closeModal() {
  els.modalBackdrop.hidden = true;
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
  rank.textContent = tile?.suit === "honor" ? tile.rank : numberLabels[tile.rank];
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
  if (tile.rank === "中") return "tile-dragon-red";
  if (tile.rank === "發") return "tile-dragon-green";
  return "tile-honor";
}

function chiOptions(tile) {
  const options = [];
  const starts = [tile.rank - 2, tile.rank - 1, tile.rank];
  starts.forEach((start) => {
    const ranks = [start, start + 1, start + 2];
    if (ranks.every((rank) => rank >= 1 && rank <= 9) && ranks.includes(tile.rank)) {
      const sequence = ranks.map((rank) => `${tile.suit}-${rank}`);
      const companions = sequence.filter((tileId) => tileId !== tile.id);
      options.push({ sequence, companions });
    }
  });
  return options;
}

function getLastDiscard() {
  const discards = state.players.flatMap((player) => player.discards);
  return discards.sort((a, b) => b.order - a.order)[0] || null;
}

function getCallableLastDiscard() {
  const last = getLastDiscard();
  if (!last) return null;
  if (last.calledBy) return null;
  return last;
}

function getCurrentPlayer() {
  return getPlayer(state.currentSeat) || state.players[0];
}

function getPlayer(seat) {
  return state.players.find((player) => player.seat === seat);
}

function nextSeat(seat) {
  return WIND_ORDER[(WIND_ORDER.indexOf(seat) + 1) % WIND_ORDER.length];
}

function relativeName(seat, mySeat) {
  const diff = (WIND_ORDER.indexOf(seat) - WIND_ORDER.indexOf(mySeat) + 4) % 4;
  if (diff === 0) return "我";
  if (diff === 1) return "下家";
  if (diff === 2) return "對家";
  return "上家";
}

function playerTitle(player) {
  if (!player) return "未知";
  return `${player.relative}(${player.seat})`;
}

function repeatTile(tileId, count) {
  return Array.from({ length: count }, () => tileId);
}

function removeOneFromHandWithoutHistory(tileId) {
  const index = state.myHand.indexOf(tileId);
  if (index !== -1) state.myHand.splice(index, 1);
}

function removeTilesFromHand(tileIds) {
  tileIds.forEach(removeOneFromHandWithoutHistory);
}

function sortHand(hand) {
  return [...hand].sort((a, b) => tileSortValue(a) - tileSortValue(b));
}

function tileSortValue(tileId) {
  const tile = TILE_BY_ID[tileId];
  const suitBase = { wan: 0, tong: 20, tiao: 40, honor: 60 }[tile?.suit] ?? 90;
  const rank = tile?.suit === "honor" ? HONORS.indexOf(tile.rank) + 1 : tile?.rank || 0;
  return suitBase + rank;
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

function showToast(message) {
  window.clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("show");
  toastTimer = window.setTimeout(() => {
    els.toast.classList.remove("show");
  }, 1600);
}
