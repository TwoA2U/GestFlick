// TabWheel Radial v2 — Popup Script

const DEFAULTS = { trigger: "both", slotCount: 8, slots: {} };
let cfg = { ...DEFAULTS };
let saveTimer;
const savedEl = document.getElementById("saved");

// Load
chrome.storage.sync.get(DEFAULTS, s => {
  cfg = { ...DEFAULTS, ...s };
  render();
  renderSlots();
});

function render() {
  document.querySelectorAll("[data-count]").forEach(b =>
    b.classList.toggle("active", Number(b.dataset.count) === cfg.slotCount));
  document.querySelectorAll("[data-trigger]").forEach(b =>
    b.classList.toggle("active", b.dataset.trigger === cfg.trigger));
}

function renderSlots() {
  const grid = document.getElementById("slotGrid");
  grid.innerHTML = "";
  const count = cfg.slotCount || 8;
  for (let i = 0; i < count; i++) {
    const slot = cfg.slots?.[String(i)];
    const cell = document.createElement("div");
    cell.className = "slot-cell" + (slot ? " filled" : "");

    const num = document.createElement("div");
    num.className = "slot-num";
    num.textContent = i + 1;
    cell.appendChild(num);

    if (slot) {
      // Favicon
      const fav = document.createElement("img");
      fav.className = "slot-fav";
      fav.src = slot.favIconUrl || "";
      fav.onerror = () => fav.remove();
      cell.appendChild(fav);

      // Name
      let label = "";
      try { label = new URL(slot.url).hostname.replace("www.", ""); } catch { label = slot.title || ""; }
      const name = document.createElement("div");
      name.className = "slot-name";
      name.textContent = label;
      cell.appendChild(name);

      // Clear button
      const clr = document.createElement("div");
      clr.className = "slot-clear";
      clr.textContent = "✕";
      clr.title = "Clear slot";
      clr.addEventListener("click", e => {
        e.stopPropagation();
        chrome.storage.sync.get({ slots: {} }, data => {
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

function flashSaved() {
  clearTimeout(saveTimer);
  savedEl.classList.add("show");
  saveTimer = setTimeout(() => savedEl.classList.remove("show"), 1500);
}

function save(extra = {}) {
  chrome.storage.sync.set({ trigger: cfg.trigger, slotCount: cfg.slotCount, ...extra });
  flashSaved();
}

document.querySelectorAll("[data-count]").forEach(b => {
  b.addEventListener("click", () => {
    cfg.slotCount = Number(b.dataset.count);
    render(); renderSlots();
    save();
  });
});

document.querySelectorAll("[data-trigger]").forEach(b => {
  b.addEventListener("click", () => {
    cfg.trigger = b.dataset.trigger;
    render();
    save();
  });
});

// Refresh slots when storage changes (e.g. assigned from wheel)
chrome.storage.onChanged.addListener(changes => {
  if (changes.slots) {
    cfg.slots = changes.slots.newValue || {};
    renderSlots();
  }
  if (changes.slotCount) {
    cfg.slotCount = changes.slotCount.newValue;
    render(); renderSlots();
  }
});
