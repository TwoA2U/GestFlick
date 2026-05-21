// TabWheel Radial — Background Service Worker (v2, Manual Slots)

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // Return all tabs in current window
  if (msg.type === "GET_TABS") {
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      const list = tabs
        .sort((a, b) => a.index - b.index)
        .map(t => ({
          id:         t.id,
          index:      t.index,
          title:      t.title      || "Untitled",
          url:        t.url        || "",
          favIconUrl: t.favIconUrl || "",
          active:     t.active,
        }));
      sendResponse({ tabs: list });
    });
    return true;
  }

  // Switch to a tab by id
  if (msg.type === "SWITCH_TAB") {
    chrome.tabs.update(msg.tabId, { active: true });
    sendResponse({ ok: true });
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
      chrome.storage.sync.set({ slots }, () => sendResponse({ ok: true }));
    });
    return true;
  }

  // Save slot count (4 or 8)
  if (msg.type === "SET_SLOT_COUNT") {
    chrome.storage.sync.set({ slotCount: msg.count }, () => sendResponse({ ok: true }));
    return true;
  }
});
