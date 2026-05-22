// TabWheel — Popup Script v5 (Fixed Ghost Data)
const DEFAULTS = { slotCount: 8, slots: {}, customKey: "q" };
const MIN_SLOTS = 2;
const MAX_SLOTS = 9;
let cfg = { ...DEFAULTS };
let saveTimer;

const savedEl = document.getElementById("saved");
const stepVal = document.getElementById("stepVal");
const stepDown = document.getElementById("stepDown");
const stepUp = document.getElementById("stepUp");
const keyInput = document.getElementById("keyInput");
const hintCombo = document.getElementById("hintCombo");

// ── Load ──────────────────────────────────────────────────────────────────
chrome.storage.sync.get(DEFAULTS, (s) => {
  cfg = { ...DEFAULTS, ...s };
  renderAll();
});

function renderAll() {
  renderSlots();
  renderStepper();
  renderKey();
}

// ── Slot grid ─────────────────────────────────────────────────────────────
function renderSlots() {
  const grid = document.getElementById("slotGrid");
  if (!grid) return;
  grid.innerHTML = "";
  const count = cfg.slotCount || 8;
  const cols = count <= 4 ? count : Math.ceil(count / 2);
  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

  for (let i = 0; i < count; i++) {
    const slot = cfg.slots?.[String(i)];
    const cell = document.createElement("div");
    cell.className = "slot-cell" + (slot ? " filled" : "");

    const num = document.createElement("div");
    num.className = "slot-num";
    num.textContent = i + 1;
    cell.appendChild(num);

    if (slot) {
      const fav = document.createElement("img");
      fav.className = "slot-fav";
      fav.src = slot.favIconUrl || "";
      fav.onerror = () => fav.remove();
      cell.appendChild(fav);

      let label = "";
      try {
        label = new URL(slot.url).hostname.replace("www.", "");
      } catch {
        label = slot.title || "";
      }

      const name = document.createElement("div");
      name.className = "slot-name";
      name.textContent = label;
      cell.appendChild(name);

      const clr = document.createElement("div");
      clr.className = "slot-x";
      clr.textContent = "✕";
      clr.title = "Clear slot";
      clr.addEventListener("click", (e) => {
        e.stopPropagation();
        chrome.storage.sync.get({ slots: {} }, (data) => {
          const slots = data.slots;
          delete slots[String(i)];
          chrome.storage.sync.set({ slots }, () => {
            cfg.slots = slots;
            renderSlots();
            flashSaved();
          });
        });
      });
      cell.appendChild(clr);
    } else {
      const icon = document.createElement("div");
      icon.className = "slot-empty-icon";
      icon.textContent = "○";
      cell.appendChild(icon);
    }
    grid.appendChild(cell);
  }
}

// ── Stepper ───────────────────────────────────────────────────────────────
function renderStepper() {
  const n = cfg.slotCount;
  stepVal.textContent = n;
  stepDown.disabled = n <= MIN_SLOTS;
  stepUp.disabled = n >= MAX_SLOTS;
}

stepDown.addEventListener("click", () => {
  if (cfg.slotCount <= MIN_SLOTS) return;
  cfg.slotCount--;

  // Fix: Prune deleted slots from storage
  const keysToDelete = Object.keys(cfg.slots).filter(
    (k) => Number(k) >= cfg.slotCount,
  );
  keysToDelete.forEach((k) => delete cfg.slots[k]);

  renderStepper();
  renderSlots();
  save({ slots: cfg.slots });
});

stepUp.addEventListener("click", () => {
  if (cfg.slotCount >= MAX_SLOTS) return;
  cfg.slotCount++;
  renderStepper();
  renderSlots();
  save();
});

// ── Shortcut key ──────────────────────────────────────────────────────────
function renderKey() {
  const k = (cfg.customKey || "q").toUpperCase();
  keyInput.value = k;
  if (hintCombo) hintCombo.textContent = `Alt+${k}`;
}

keyInput.addEventListener("click", () => {
  keyInput.classList.add("recording");
  keyInput.value = "…";
  keyInput.focus();
});

keyInput.addEventListener("keydown", (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (["Alt", "Shift", "Control", "Meta", "Escape", "Tab"].includes(e.key)) {
    if (e.key === "Escape") {
      keyInput.classList.remove("recording");
      renderKey();
    }
    return;
  }
  const k = e.key.toLowerCase();
  if (!/^[a-z]$/.test(k)) return;
  cfg.customKey = k;
  keyInput.classList.remove("recording");
  renderKey();
  save();
});

keyInput.addEventListener("blur", () => {
  keyInput.classList.remove("recording");
  renderKey();
});

// ── Save / flash ──────────────────────────────────────────────────────────
function flashSaved() {
  clearTimeout(saveTimer);
  if (savedEl) {
    savedEl.classList.add("show");
    saveTimer = setTimeout(() => savedEl.classList.remove("show"), 1500);
  }
}

function save(extra = {}) {
  chrome.storage.sync.set({
    slotCount: cfg.slotCount,
    customKey: cfg.customKey,
    ...extra,
  });
  flashSaved();
}

// ── Live storage updates (from wheel assigning slots) ─────────────────────
chrome.storage.onChanged.addListener((changes) => {
  if (changes.slots) {
    cfg.slots = changes.slots.newValue || {};
    renderSlots();
  }
  if (changes.slotCount) {
    cfg.slotCount = changes.slotCount.newValue;
    renderStepper();
    renderSlots();
  }
  if (changes.customKey) {
    cfg.customKey = changes.customKey.newValue || "q";
    renderKey();
  }
});
