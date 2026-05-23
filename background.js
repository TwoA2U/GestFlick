// TabWheel Radial — Background Service Worker (v4)
// Changes: #11 SLOT_COUNT_DEFAULT constant (keep in sync with content.js)

const DEV = false;
function dbg(...args) {
  if (DEV) console.debug("[TabWheel BG]", ...args);
}

const SLOT_COUNT_DEFAULT = 8; // #11 — keep in sync with content.js

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
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

  if (msg.type === "SWITCH_TAB") {
    chrome.tabs.update(msg.tabId, { active: true }, () => {
      if (chrome.runtime.lastError)
        dbg("SWITCH_TAB:", chrome.runtime.lastError.message);
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === "GET_SLOTS") {
    chrome.storage.sync.get(
      { slots: {}, slotCount: SLOT_COUNT_DEFAULT },
      (data) => {
        sendResponse({ slots: data.slots, slotCount: data.slotCount });
      },
    );
    return true;
  }

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
});
