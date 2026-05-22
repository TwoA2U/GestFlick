// TabWheel Radial — Background Service Worker (v3, Cleaned)

const DEV = false;
function dbg(...args) {
  if (DEV) console.debug("[TabWheel BG]", ...args);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Return all tabs in current window
  if (msg.type === "GET_TABS") {
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      const list = tabs
        .sort((a, b) => a.index - b.index)
        .map((t) => ({
          id: t.id,
          index: t.index,
          title: t.title || "Untitled",
          url: t.url || "",
          favIconUrl: t.favIconUrl || "",
          active: t.active,
        }));
      sendResponse({ tabs: list });
    });
    return true;
  }

  // Switch to a tab by id
  if (msg.type === "SWITCH_TAB") {
    chrome.tabs.update(msg.tabId, { active: true }, () => {
      if (chrome.runtime.lastError)
        dbg("SWITCH_TAB:", chrome.runtime.lastError.message);
      sendResponse({ ok: true });
    });
    return true;
  }

  // Load slot assignments from storage
  if (msg.type === "GET_SLOTS") {
    chrome.storage.sync.get({ slots: {}, slotCount: 8 }, (data) => {
      sendResponse({ slots: data.slots, slotCount: data.slotCount });
    });
    return true;
  }

  // Save a single slot assignment  { slotIndex, url, title, favIconUrl }
  if (msg.type === "SET_SLOT") {
    chrome.storage.sync.get({ slots: {} }, (data) => {
      const slots = data.slots;
      if (msg.assignment === null) {
        delete slots[String(msg.slotIndex)];
      } else {
        slots[String(msg.slotIndex)] = msg.assignment;
      }
      chrome.storage.sync.set({ slots }, () => {
        if (chrome.runtime.lastError)
          dbg("SET_SLOT:", chrome.runtime.lastError.message);
        sendResponse({ ok: true });
      });
    });
    return true;
  }
  // NOTE: SET_SLOT_COUNT removed — popup.js writes slotCount directly to storage.
});
