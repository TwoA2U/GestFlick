# TabWheel — Radial Tab Switcher

A radial/pie-menu gesture interface for switching browser tabs. Works in **Chrome** and **Firefox**.

---

## How it works

1. **Middle-click** (or **Alt+Click**) anywhere on any webpage
2. A circular wheel pops up — each slice is one of your open tabs, with its favicon
3. **Flick your mouse** toward the tab you want (no need to click the slice)
4. **Release** the mouse button → you're instantly on that tab
5. Press **Esc** or click the backdrop to dismiss without switching

---

## Install

### Chrome / Chromium / Edge (Manifest V3)
1. Go to `chrome://extensions`
2. Enable **Developer Mode** (top-right)
3. Click **Load unpacked** → select the `tabwheel-radial/` folder

### Firefox (Manifest V2)
1. Replace `manifest.json` with the contents of `manifest_firefox.json`
2. Go to `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on…** → pick any file in the folder

---

## Files

```
tabwheel-radial/
├── manifest.json           ← Chrome/Edge
├── manifest_firefox.json   ← Firefox
├── background.js           ← Tabs API bridge
├── content.js              ← Radial wheel logic (injected into pages)
├── wheel.css               ← Wheel styles (injected)
├── popup.html / popup.js   ← Settings popup
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## Settings

Click the toolbar icon to configure:
- **Trigger**: Middle Click or Alt+Click
