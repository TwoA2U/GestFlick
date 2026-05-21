// TabWheel Radial — Content Script v12 (Click to Add, Right-Click to Delete)
(function () {
  if (window.__tabWheelLoaded) return;
  window.__tabWheelLoaded = true;

  // ── Constants ────────────────────────────────────────────────────────────
  const OUTER_R = 140;
  const INNER_R = 44;
  const FLICK_R = 20;
  const LABEL_R = OUTER_R + 32;

  // ── State ────────────────────────────────────────────────────────────────
  let isOpen = false;
  let isLoading = false;
  let cancelRequested = false;
  let originX = 0,
    originY = 0;
  let slices = [];
  let hovered = -1;
  let goTo = null;
  let openTabs = [];
  let slots = {};
  let slotCount = 8;
  let releaseQueued = false;

  let instantKey = "q";
  let cursorX = 0,
    cursorY = 0;
  let comboActive = false;

  // ── DOM refs ─────────────────────────────────────────────────────────────
  let ROOT, BACK, SVG, HUB, LBL, HINT;

  const NS = "http://www.w3.org/2000/svg";
  function el(tag, a) {
    const e = document.createElementNS(NS, tag);
    if (a) for (const k in a) e.setAttribute(k, a[k]);
    return e;
  }
  function mk(tag, id) {
    const e = document.createElement(tag);
    if (id) e.id = id;
    return e;
  }

  function xy(r, deg) {
    const a = ((deg - 90) * Math.PI) / 180;
    return [r * Math.cos(a), r * Math.sin(a)];
  }
  function wedge(r1, r2, a0, a1) {
    const [ax, ay] = xy(r1, a0),
      [bx, by] = xy(r2, a0);
    const [cx, cy] = xy(r2, a1),
      [dx, dy] = xy(r1, a1);
    const f = a1 - a0 > 180 ? 1 : 0;
    return `M${ax} ${ay}L${bx} ${by}A${r2} ${r2} 0 ${f} 1 ${cx} ${cy}L${dx} ${dy}A${r1} ${r1} 0 ${f} 0 ${ax} ${ay}Z`;
  }

  function injectStyles() {
    if (document.getElementById("tw-style")) return;
    const s = document.createElement("style");
    s.id = "tw-style";
    s.textContent = `
      #tw-root{all:initial;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important;font-family:system-ui,sans-serif!important;display:none!important;}
      #tw-root.open, #tw-root.dismissing{display:block!important;}
      #tw-root.open{pointer-events:all!important;}

      #tw-back{position:fixed;inset:0;background:rgba(0,0,0,.42);backdrop-filter:blur(2px);opacity:0;transition:opacity .15s;}
      #tw-root.open #tw-back{opacity:1;}

      #tw-svg{position:fixed;overflow:visible;pointer-events:none;width:1px;height:1px;transform:translate(-50%,-50%);}
      #tw-hub{position:fixed;transform:translate(-50%,-50%);width:50px;height:50px;border-radius:50%;background:rgba(14,14,24,.97);border:2px solid rgba(255,255,255,.15);box-shadow:0 4px 24px rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;cursor:pointer;pointer-events:all;overflow:visible;}

      #tw-lbl{position:fixed;transform:translate(-50%,-50%);background:rgba(10,10,20,.95);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:5px 13px;font-size:12px;font-weight:500;color:#e8e8f5;white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis;pointer-events:none;opacity:0;transition:opacity .1s;box-shadow:0 4px 16px rgba(0,0,0,.6);}
      #tw-lbl.on{opacity:1;}

      #tw-hint{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);font-size:11px;color:rgba(255,255,255,.25);letter-spacing:.04em;pointer-events:none;white-space:nowrap;}

      .tw-bg{pointer-events:none;transition:opacity .12s,filter .12s;opacity:.78;}
      .tw-bg.empty{opacity:.3;}
      .tw-bg.offline{opacity:.42;filter:saturate(.3);}
      .tw-bg.hot{opacity:1!important;filter:brightness(1.35) drop-shadow(0 0 12px rgba(140,190,255,.55));}
      .tw-bg.cur{opacity:.95;}

      #tw-root.dismissing #tw-svg{animation:tw-pop-out .12s cubic-bezier(.4,0,1,1) forwards!important;}
      #tw-root.dismissing #tw-hub{animation:tw-hub-out .12s cubic-bezier(.4,0,1,1) forwards!important;}
      #tw-root.dismissing #tw-back{opacity:0!important;transition:opacity .12s!important;}

      @keyframes tw-pop-out{from{transform:translate(-50%,-50%) scale(1);opacity:1;}to{transform:translate(-50%,-50%) scale(.6);opacity:0;}}
      @keyframes tw-hub-out{from{transform:translate(-50%,-50%) scale(1);opacity:1;}to{transform:translate(-50%,-50%) scale(.6);opacity:0;}}
      @keyframes tw-pop{from{transform:translate(-50%,-50%) scale(.5);opacity:0;}to{transform:translate(-50%,-50%) scale(1);opacity:1;}}
      #tw-svg.pop{animation:tw-pop .2s cubic-bezier(.34,1.56,.64,1) forwards;}
    `;
    (document.head || document.documentElement).appendChild(s);
  }

  function buildDOM() {
    injectStyles();
    document.getElementById("tw-root")?.remove();
    ROOT = mk("div", "tw-root");
    BACK = mk("div", "tw-back");
    SVG = el("svg");
    SVG.id = "tw-svg";
    HUB = mk("div", "tw-hub");
    LBL = mk("div", "tw-lbl");
    HINT = mk("div", "tw-hint");
    updateHint();

    HUB.innerHTML = `
      <svg viewBox="0 0 22 22" width="20" height="20" fill="none" stroke="white" stroke-width="1.6" stroke-linecap="round" style="pointer-events:none">
        <circle cx="11" cy="11" r="7.5"/>
        <circle cx="11" cy="11" r="2.2" fill="white" stroke="none"/>
        <line x1="11" y1="3.5" x2="11" y2="6"/>
        <line x1="11" y1="16" x2="11" y2="18.5"/>
        <line x1="3.5" y1="11" x2="6" y2="11"/>
        <line x1="16" y1="11" x2="18.5" y2="11"/>
      </svg>`;

    ROOT.append(BACK, SVG, HUB, LBL, HINT);
    (document.body || document.documentElement).appendChild(ROOT);
  }

  function updateHint() {
    if (HINT)
      HINT.textContent = `Hold Alt+${instantKey.toUpperCase()} · Click empty to add · Click filled to switch · Right-click to delete`;
  }

  function place() {
    SVG.style.left = HUB.style.left = LBL.style.left = originX + "px";
    SVG.style.top = HUB.style.top = LBL.style.top = originY + "px";
  }

  function buildWheel() {
    SVG.innerHTML = "";
    slices = [];
    const n = slotCount,
      gap = 3,
      per = 360 / n;
    const defs = el("defs");
    SVG.appendChild(defs);
    for (let i = 0; i < n; i++) {
      const a0 = i * per + gap / 2;
      const a1 = (i + 1) * per - gap / 2;
      const mid = (a0 + a1) / 2;
      const hue = Math.round((200 + i * (360 / n)) % 360);

      const asgn = slots[String(i)] || null;
      const empty = !asgn;
      let live = null;
      if (asgn) {
        live =
          openTabs.find((t) => {
            try {
              return new URL(t.url).hostname === new URL(asgn.url).hostname;
            } catch {
              return false;
            }
          }) || null;
      }
      const online = !!live;
      const current = live?.active === true;

      const gid = `tg${i}`;
      const [gx1, gy1] = xy(INNER_R, mid),
        [gx2, gy2] = xy(OUTER_R, mid);
      const gr = el("linearGradient", {
        id: gid,
        gradientUnits: "userSpaceOnUse",
        x1: gx1,
        y1: gy1,
        x2: gx2,
        y2: gy2,
      });
      gr.appendChild(
        el("stop", {
          offset: "0%",
          "stop-color": empty ? `hsl(${hue},18%,13%)` : `hsl(${hue},52%,22%)`,
        }),
      );
      gr.appendChild(
        el("stop", {
          offset: "100%",
          "stop-color": empty ? `hsl(${hue},15%,20%)` : `hsl(${hue},65%,38%)`,
        }),
      );
      defs.appendChild(gr);

      const cid = `tc${i}`;
      const clip = el("clipPath", { id: cid });
      const [fx, fy] = xy((INNER_R + OUTER_R) / 2, mid);
      clip.appendChild(el("circle", { cx: fx, cy: fy, r: 10 }));
      defs.appendChild(clip);

      const g = el("g");
      const bg = el("path", {
        d: wedge(INNER_R + 2, OUTER_R - 2, a0, a1),
        fill: `url(#${gid})`,
        stroke: "rgba(255,255,255,.06)",
        "stroke-width": "1",
      });
      bg.classList.add("tw-bg");
      if (empty) bg.classList.add("empty");
      if (!online && !empty) bg.classList.add("offline");
      if (current) bg.classList.add("cur");
      g.appendChild(bg);

      if (current) {
        g.appendChild(
          el("path", {
            d: wedge(OUTER_R - 5, OUTER_R - 2, a0, a1),
            fill: "rgba(255,255,255,.28)",
            stroke: "none",
          }),
        );
      }

      const [nx, ny] = xy(OUTER_R - 11, mid);
      g.appendChild(
        el("circle", { cx: nx, cy: ny, r: 8.5, fill: "rgba(0,0,0,.45)" }),
      );
      const nt = el("text", {
        x: nx,
        y: ny + 4.5,
        "text-anchor": "middle",
        "font-size": "9",
        "font-weight": "700",
        fill: "rgba(255,255,255,.42)",
        "font-family": "system-ui,sans-serif",
      });
      nt.textContent = String(i + 1);
      g.appendChild(nt);

      const furl = live?.favIconUrl || asgn?.favIconUrl || "";
      if (furl.startsWith("http")) {
        g.appendChild(
          el("image", {
            href: furl,
            x: fx - 10,
            y: fy - 10,
            width: 20,
            height: 20,
            "clip-path": `url(#${cid})`,
            opacity: online ? "1" : "0.3",
          }),
        );
      } else if (!empty) {
        let ch = "?";
        try {
          ch = new URL(asgn.url).hostname.replace("www.", "")[0].toUpperCase();
        } catch {}
        const lt = el("text", {
          x: fx,
          y: fy + 5.5,
          "text-anchor": "middle",
          "font-size": "14",
          "font-weight": "700",
          fill: online ? "rgba(255,255,255,.9)" : "rgba(255,255,255,.28)",
          "font-family": "system-ui,sans-serif",
        });
        lt.textContent = ch;
        g.appendChild(lt);
      } else {
        const pt = el("text", {
          x: fx,
          y: fy + 8,
          "text-anchor": "middle",
          "font-size": "22",
          "font-weight": "200",
          fill: "rgba(255,200,80,.55)",
          "font-family": "system-ui,sans-serif",
        });
        pt.textContent = "+";
        g.appendChild(pt);
      }

      const hit = el("path", {
        d: wedge(INNER_R, OUTER_R, a0, a1),
        fill: "transparent",
        stroke: "none",
      });
      hit.style.pointerEvents = "all";
      hit.style.cursor = "pointer";

      // ✅ Right-click to delete slot (keeps wheel open for immediate reassignment)
      hit.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (asgn) {
          chrome.runtime.sendMessage(
            { type: "SET_SLOT", slotIndex: i, assignment: null },
            () => reload(),
          );
        }
      });

      g.appendChild(hit);
      SVG.appendChild(g);
      slices.push({ bg, mid, online, live, asgn, empty });
    }
  }

  function reload() {
    chrome.runtime.sendMessage({ type: "GET_SLOTS" }, (r) => {
      if (chrome.runtime.lastError) return;
      slots = r?.slots || {};
      slotCount = r?.slotCount || 8;
      buildWheel();
      // Preserve hover state visually after reload
      if (hovered >= 0 && hovered < slices.length) {
        const temp = hovered;
        hovered = -1;
        setHover(temp);
      }
    });
  }

  function show(x, y) {
    if (isOpen || isLoading) return;
    isLoading = true;
    cancelRequested = false;
    originX = x;
    originY = y;
    hovered = -1;
    goTo = null;
    releaseQueued = false;

    chrome.runtime.sendMessage({ type: "GET_TABS" }, (res) => {
      if (cancelRequested || chrome.runtime.lastError || !res) {
        isLoading = false;
        return;
      }
      openTabs = res.tabs || [];

      chrome.runtime.sendMessage({ type: "GET_SLOTS" }, (sr) => {
        if (cancelRequested || chrome.runtime.lastError) {
          isLoading = false;
          return;
        }
        slots = sr?.slots || {};
        slotCount = sr?.slotCount || 8;
        isLoading = false;
        isOpen = true;
        place();
        buildWheel();
        ROOT.classList.add("open");
        SVG.classList.add("pop");
        SVG.addEventListener(
          "animationend",
          () => SVG.classList.remove("pop"),
          { once: true },
        );

        if (releaseQueued) {
          releaseQueued = false;
          executeAndDismiss();
        }
      });
    });
  }

  function dismiss() {
    if (!isOpen && !isLoading) return;
    isOpen = false;
    isLoading = false;
    cancelRequested = true;

    const targetTab = goTo;
    goTo = null;
    slices = [];

    if (targetTab)
      chrome.runtime.sendMessage({ type: "SWITCH_TAB", tabId: targetTab.id });

    LBL.classList.remove("on");
    hovered = -1;

    ROOT.classList.add("dismissing");
    ROOT.classList.remove("open");

    const cleanup = () => {
      ROOT.classList.remove("dismissing");
      HUB.style.animation = "";
      SVG.style.animation = "";
    };
    SVG.addEventListener("animationend", cleanup, { once: true });
    setTimeout(cleanup, 180);
  }

  // ✅ Triggered ONLY on Alt+Q release (Switches tab, NEVER assigns)
  function executeAndDismiss() {
    if (!isOpen) return;

    const s = hovered >= 0 ? slices[hovered] : null;

    if (s) {
      // Only switch if occupied. If empty, do nothing and just close.
      if (s.online && s.live) {
        goTo = s.live;
      }
    }
    dismiss();
  }

  function setHover(i) {
    if (i === hovered) return;
    hovered = i;

    slices.forEach((s, j) => s.bg.classList.toggle("hot", j === i && s.online));
    const s = i >= 0 ? slices[i] : null;

    if (s) {
      LBL.textContent = (s.live?.title || s.asgn?.title || "").slice(0, 42);
      LBL.classList.add("on");
      const rad = ((s.mid - 90) * Math.PI) / 180;
      LBL.style.left = originX + Math.cos(rad) * LABEL_R + "px";
      LBL.style.top = originY + Math.sin(rad) * LABEL_R + "px";
    } else {
      LBL.classList.remove("on");
    }
  }

  // ── Global Events ────────────────────────────────────────────────────────
  window.addEventListener(
    "mousemove",
    (e) => {
      cursorX = e.clientX;
      cursorY = e.clientY;

      if (!isOpen || slices.length === 0) return;
      const dx = e.clientX - originX,
        dy = e.clientY - originY;
      if (Math.hypot(dx, dy) < FLICK_R) {
        setHover(-1);
        return;
      }
      const deg = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
      const per = 360 / slotCount;
      setHover(Math.floor(deg / per) % slotCount);
    },
    { capture: true, passive: true },
  );

  // ✅ Left-Click to Assign (Empty) or Switch (Occupied)
  window.addEventListener(
    "mousedown",
    (e) => {
      if (e.button === 0 && isOpen) {
        const s = hovered >= 0 ? slices[hovered] : null;
        if (s) {
          if (s.empty) {
            // Assign current tab to empty slice
            const activeTab = openTabs.find((t) => t.active);
            if (activeTab) {
              chrome.runtime.sendMessage({
                type: "SET_SLOT",
                slotIndex: hovered,
                assignment: {
                  url: activeTab.url,
                  title: activeTab.title,
                  favIconUrl: activeTab.favIconUrl || "",
                },
              });
            }
            goTo = null; // Don't switch tabs, just close
          } else if (s.online && s.live) {
            // Switch to occupied slice
            goTo = s.live;
          }
        }
        e.preventDefault();
        e.stopPropagation();
        dismiss();
        return;
      }
    },
    true,
  );

  document.addEventListener(
    "keydown",
    (e) => {
      if (
        e.altKey &&
        e.key.toLowerCase() === instantKey.toLowerCase() &&
        !e.repeat
      ) {
        e.preventDefault();
        if (!comboActive) {
          comboActive = true;
          if (!isOpen && !isLoading) {
            show(
              cursorX || window.innerWidth / 2,
              cursorY || window.innerHeight / 2,
            );
          }
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        comboActive = false;
        cancelRequested = true;
        if (isOpen || isLoading) {
          goTo = null;
          dismiss();
        }
      }
    },
    true,
  );

  document.addEventListener(
    "keyup",
    (e) => {
      if (
        comboActive &&
        (e.key === "Alt" || e.key.toLowerCase() === instantKey.toLowerCase())
      ) {
        comboActive = false;
        if (isLoading) {
          releaseQueued = true;
          return;
        }
        if (isOpen) {
          e.preventDefault();
          executeAndDismiss();
        }
      }
    },
    true,
  );

  window.addEventListener(
    "blur",
    () => {
      comboActive = false;
      cancelRequested = true;
      if (isOpen || isLoading) dismiss();
    },
    true,
  );

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      comboActive = false;
      cancelRequested = true;
      if (isOpen || isLoading) dismiss();
    }
  });

  // ── Init ─────────────────────────────────────────────────────────────────
  buildDOM();
  chrome.storage.sync.get({ customKey: "q" }, (data) => {
    instantKey = data.customKey || "q";
    updateHint();
  });
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.customKey) {
      instantKey = changes.customKey.newValue || "q";
      updateHint();
    }
  });
  console.log("[TabWheel] ready v12 (Click to Add, Right-Click to Delete)");
})();
