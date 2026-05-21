// TabWheel Radial — Content Script v6

(function () {
  if (window.__tabWheelLoaded) return;
  window.__tabWheelLoaded = true;

  // ── Constants ────────────────────────────────────────────────────────────
  const OUTER_R     = 130;
  const INNER_R     = 50;
  const FLICK_R     = 30;
  const LABEL_R     = OUTER_R + 32;
  const HUB_HOLD_MS = 600;

  // ── State ────────────────────────────────────────────────────────────────
  let isOpen    = false;
  let isLoading = false;          // async fetch in flight
  let editMode  = false;
  let originX   = 0, originY = 0;
  let slices    = [];             // built slice records
  let hovered   = -1;
  let goTo      = null;           // tab to switch on close
  let openTabs  = [];
  let slots     = {};
  let slotCount = 8;
  let trigger   = "both";
  let hubTimer  = null;
  let releaseQueued = false;      // mouseup arrived before wheel was shown

  // ── DOM refs ──────────────────────────────────────────────────────────────
  let ROOT, BACK, SVG, HUB, RING, MTAG, LBL, PANEL, HINT;

  // ── SVG helper ────────────────────────────────────────────────────────────
  const NS = "http://www.w3.org/2000/svg";
  function el(tag, a) {
    const e = document.createElementNS(NS, tag);
    if (a) for (const k in a) e.setAttribute(k, a[k]);
    return e;
  }

  // ── Geometry ──────────────────────────────────────────────────────────────
  function xy(r, deg) {
    const a = (deg - 90) * Math.PI / 180;
    return [r * Math.cos(a), r * Math.sin(a)];
  }

  function wedge(r1, r2, a0, a1) {
    const [ax,ay]=xy(r1,a0), [bx,by]=xy(r2,a0);
    const [cx,cy]=xy(r2,a1), [dx,dy]=xy(r1,a1);
    const f = (a1-a0) > 180 ? 1 : 0;
    return `M${ax} ${ay}L${bx} ${by}A${r2} ${r2} 0 ${f} 1 ${cx} ${cy}L${dx} ${dy}A${r1} ${r1} 0 ${f} 0 ${ax} ${ay}Z`;
  }

  // ── Inline styles ─────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById("tw-style")) return;
    const s = document.createElement("style");
    s.id = "tw-style";
    s.textContent = `
      #tw-root{all:initial;position:fixed!important;inset:0!important;
        z-index:2147483647!important;pointer-events:none!important;
        font-family:system-ui,sans-serif!important;}
      #tw-root.open{pointer-events:all!important;}
      #tw-back{position:fixed;inset:0;background:rgba(0,0,0,.42);
        backdrop-filter:blur(2px);opacity:0;transition:opacity .15s;}
      #tw-root.open #tw-back{opacity:1;}
      #tw-svg{position:fixed;overflow:visible;pointer-events:none;
        width:1px;height:1px;transform:translate(-50%,-50%);}
      #tw-hub{position:fixed;transform:translate(-50%,-50%);
        width:50px;height:50px;border-radius:50%;
        background:rgba(14,14,24,.97);border:2px solid rgba(255,255,255,.15);
        box-shadow:0 4px 24px rgba(0,0,0,.7);
        display:flex;align-items:center;justify-content:center;
        cursor:pointer;pointer-events:all;overflow:visible;transition:border-color .2s;}
      #tw-hub.edit{border-color:rgba(255,200,80,.8);
        box-shadow:0 0 18px rgba(255,200,80,.3),0 4px 24px rgba(0,0,0,.7);}
      #tw-ring{position:absolute;inset:-4px;border-radius:50%;
        background:conic-gradient(rgba(255,200,80,.9) 0%,transparent 0%);
        opacity:0;pointer-events:none;z-index:-1;}
      #tw-ring.go{opacity:1;animation:tw-charge .6s linear forwards;}
      @keyframes tw-charge{
        from{background:conic-gradient(rgba(255,200,80,.9) 0%,rgba(20,20,40,.6) 0%);}
        to  {background:conic-gradient(rgba(255,200,80,.9) 100%,rgba(20,20,40,.6) 100%);}}
      #tw-mtag{position:absolute;bottom:-22px;left:50%;transform:translateX(-50%);
        font-size:9px;font-weight:700;letter-spacing:1px;
        color:rgba(255,200,80,.9);background:rgba(14,14,24,.95);
        border:1px solid rgba(255,200,80,.3);border-radius:4px;
        padding:2px 6px;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .15s;}
      #tw-lbl{position:fixed;transform:translate(-50%,-50%);
        background:rgba(10,10,20,.95);border:1px solid rgba(255,255,255,.1);
        border-radius:10px;padding:5px 13px;font-size:12px;font-weight:500;
        color:#e8e8f5;white-space:nowrap;max-width:220px;overflow:hidden;
        text-overflow:ellipsis;pointer-events:none;opacity:0;transition:opacity .1s;
        box-shadow:0 4px 16px rgba(0,0,0,.6);}
      #tw-lbl.on{opacity:1;}
      #tw-panel{position:fixed;transform:translate(-50%,-50%);
        background:rgba(12,12,22,.98);border:1px solid rgba(255,200,80,.28);
        border-radius:12px;min-width:195px;max-width:240px;max-height:280px;
        overflow-y:auto;overflow-x:hidden;pointer-events:all;
        opacity:0;scale:.88;
        transition:opacity .15s,scale .15s cubic-bezier(.34,1.56,.64,1);
        box-shadow:0 8px 32px rgba(0,0,0,.8);z-index:10;}
      #tw-panel.on{opacity:1;scale:1;}
      #tw-panel::-webkit-scrollbar{width:4px;}
      #tw-panel::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:4px;}
      .ap-h{font-size:10px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;
        color:rgba(255,200,80,.85);padding:9px 12px 6px;
        border-bottom:1px solid rgba(255,255,255,.07);
        position:sticky;top:0;background:rgba(12,12,22,.98);}
      .ap-r{display:flex;align-items:center;gap:8px;padding:7px 12px;
        cursor:pointer;border-bottom:1px solid rgba(255,255,255,.04);transition:background .1s;}
      .ap-r:hover{background:rgba(255,255,255,.07);}
      .ap-r:last-child{border-bottom:none;}
      .ap-f{width:15px;height:15px;border-radius:3px;object-fit:contain;flex-shrink:0;}
      .ap-t{font-size:12px;color:rgba(215,215,235,.88);overflow:hidden;
        text-overflow:ellipsis;white-space:nowrap;flex:1;}
      .ap-x{justify-content:center;color:rgba(255,100,100,.8)!important;
        font-size:12px;font-weight:500;border-top:1px solid rgba(255,255,255,.07)!important;}
      .ap-x:hover{background:rgba(255,70,70,.09)!important;color:rgba(255,140,140,1)!important;}
      #tw-hint{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
        font-size:11px;color:rgba(255,255,255,.25);letter-spacing:.04em;
        pointer-events:none;white-space:nowrap;}
      .tw-bg{pointer-events:none;transition:opacity .12s,filter .12s;opacity:.78;}
      .tw-bg.empty{opacity:.3;}
      .tw-bg.offline{opacity:.42;filter:saturate(.3);}
      .tw-bg.hot{opacity:1!important;filter:brightness(1.35) drop-shadow(0 0 12px rgba(140,190,255,.55));}
      .tw-bg.cur{opacity:.95;}
      @keyframes tw-pop{
        from{transform:translate(-50%,-50%) scale(.5);opacity:0;}
        to  {transform:translate(-50%,-50%) scale(1); opacity:1;}}
      #tw-svg.pop{animation:tw-pop .2s cubic-bezier(.34,1.56,.64,1) forwards;}
    `;
    (document.head || document.documentElement).appendChild(s);
  }

  // ── Build DOM ─────────────────────────────────────────────────────────────
  function buildDOM() {
    injectStyles();
    document.getElementById("tw-root")?.remove();

    ROOT  = mk("div","tw-root");
    BACK  = mk("div","tw-back");
    SVG   = el("svg"); SVG.id = "tw-svg";
    HUB   = mk("div","tw-hub");
    LBL   = mk("div","tw-lbl");
    PANEL = mk("div","tw-panel");
    HINT  = mk("div","tw-hint");
    HINT.textContent = "Hold center to edit  ·  Flick to switch";

    HUB.innerHTML = `
      <div id="tw-ring"></div>
      <svg viewBox="0 0 22 22" width="20" height="20" fill="none" stroke="white"
           stroke-width="1.6" stroke-linecap="round"
           style="pointer-events:none;position:relative;z-index:1">
        <circle cx="11" cy="11" r="7.5"/>
        <circle cx="11" cy="11" r="2.2" fill="white" stroke="none"/>
        <line x1="11" y1="3.5" x2="11" y2="6"/>
        <line x1="11" y1="16"  x2="11" y2="18.5"/>
        <line x1="3.5" y1="11" x2="6"  y2="11"/>
        <line x1="16"  y1="11" x2="18.5" y2="11"/>
      </svg>
      <div id="tw-mtag">EDIT</div>`;

    ROOT.append(BACK, SVG, HUB, LBL, PANEL, HINT);
    (document.body || document.documentElement).appendChild(ROOT);

    RING = document.getElementById("tw-ring");
    MTAG = document.getElementById("tw-mtag");

    // Hub — only mousedown needed; release is caught globally
    HUB.addEventListener("mousedown", e => {
      if (e.button !== 0) return;
      // Don't stopPropagation — let global mouseup still fire
      e.preventDefault();
      RING.style.animation = "none";
      void RING.offsetHeight;
      RING.style.animation = "";
      RING.classList.add("go");
      hubTimer = setTimeout(toggleEdit, HUB_HOLD_MS);
    });

    // Backdrop mousedown closes (only if no panel open)
    BACK.addEventListener("mousedown", e => {
      if (e.button !== 0 && e.button !== 1) return;
      if (PANEL.classList.contains("on")) { closePanel(); return; }
      // Don't call closeWheel here — let mouseup handle it
      // Just mark that backdrop was the target so mouseup knows to close
    });
  }

  function mk(tag, id) {
    const e = document.createElement(tag);
    if (id) e.id = id;
    return e;
  }

  // ── Place elements at cursor ──────────────────────────────────────────────
  function place() {
    SVG.style.left = HUB.style.left = LBL.style.left = originX + "px";
    SVG.style.top  = HUB.style.top  = LBL.style.top  = originY + "px";
  }

  // ── Build SVG wheel ───────────────────────────────────────────────────────
  function buildWheel() {
    SVG.innerHTML = "";
    slices = [];
    const n = slotCount, gap = 3, per = 360 / n;
    const defs = el("defs");
    SVG.appendChild(defs);

    for (let i = 0; i < n; i++) {
      const a0  = i * per + gap / 2;
      const a1  = (i+1) * per - gap / 2;
      const mid = (a0 + a1) / 2;
      const hue = Math.round((200 + i * (360/n)) % 360);

      const asgn  = slots[String(i)] || null;
      const empty = !asgn;
      let live = null;
      if (asgn) {
        live = openTabs.find(t => {
          try { return new URL(t.url).hostname === new URL(asgn.url).hostname; }
          catch { return false; }
        }) || null;
      }
      const online  = !!live;
      const current = live?.active === true;

      // gradient
      const gid = `tg${i}`;
      const [gx1,gy1] = xy(INNER_R,mid), [gx2,gy2] = xy(OUTER_R,mid);
      const gr = el("linearGradient",{id:gid,gradientUnits:"userSpaceOnUse",
        x1:gx1,y1:gy1,x2:gx2,y2:gy2});
      gr.appendChild(el("stop",{offset:"0%",  "stop-color":empty?`hsl(${hue},18%,13%)`:`hsl(${hue},52%,22%)`}));
      gr.appendChild(el("stop",{offset:"100%","stop-color":empty?`hsl(${hue},15%,20%)`:`hsl(${hue},65%,38%)`}));
      defs.appendChild(gr);

      // favicon clip
      const cid = `tc${i}`;
      const clip = el("clipPath",{id:cid});
      const [fx,fy] = xy((INNER_R+OUTER_R)/2, mid);
      clip.appendChild(el("circle",{cx:fx,cy:fy,r:10}));
      defs.appendChild(clip);

      const g = el("g");

      // slice bg
      const bg = el("path",{
        d: wedge(INNER_R+2, OUTER_R-2, a0, a1),
        fill:`url(#${gid})`,
        stroke: editMode ? "rgba(255,200,80,.18)" : "rgba(255,255,255,.06)",
        "stroke-width":"1"
      });
      bg.classList.add("tw-bg");
      if (empty)              bg.classList.add("empty");
      if (!online && !empty)  bg.classList.add("offline");
      if (current)            bg.classList.add("cur");
      g.appendChild(bg);

      // current rim
      if (current) {
        g.appendChild(el("path",{
          d:wedge(OUTER_R-5,OUTER_R-2,a0,a1),
          fill:"rgba(255,255,255,.28)",stroke:"none"}));
      }

      // slot number badge
      const [nx,ny] = xy(OUTER_R-11, mid);
      g.appendChild(el("circle",{cx:nx,cy:ny,r:8.5,fill:"rgba(0,0,0,.45)"}));
      const nt = el("text",{x:nx,y:ny+4.5,"text-anchor":"middle",
        "font-size":"9","font-weight":"700",fill:"rgba(255,255,255,.42)",
        "font-family":"system-ui,sans-serif"});
      nt.textContent = String(i+1);
      g.appendChild(nt);

      // favicon / letter / placeholder
      const furl = live?.favIconUrl || asgn?.favIconUrl || "";
      if (furl.startsWith("http")) {
        g.appendChild(el("image",{href:furl,x:fx-10,y:fy-10,width:20,height:20,
          "clip-path":`url(#${cid})`,opacity:online?"1":"0.3"}));
      } else if (!empty) {
        let ch = "?";
        try { ch = new URL(asgn.url).hostname.replace("www.","")[0].toUpperCase(); } catch {}
        const lt = el("text",{x:fx,y:fy+5.5,"text-anchor":"middle",
          "font-size":"14","font-weight":"700",fill:online?"rgba(255,255,255,.9)":"rgba(255,255,255,.28)",
          "font-family":"system-ui,sans-serif"});
        lt.textContent = ch;
        g.appendChild(lt);
      } else if (editMode) {
        const pt = el("text",{x:fx,y:fy+8,"text-anchor":"middle",
          "font-size":"22","font-weight":"200",fill:"rgba(255,200,80,.55)",
          "font-family":"system-ui,sans-serif"});
        pt.textContent = "+";
        g.appendChild(pt);
      } else {
        const dt = el("text",{x:fx,y:fy+5,"text-anchor":"middle",
          "font-size":"18","font-weight":"200",fill:"rgba(255,255,255,.09)",
          "font-family":"system-ui,sans-serif"});
        dt.textContent = "·";
        g.appendChild(dt);
      }

      // hit area — pointer-events only, NO stopPropagation so global mouseup still fires
      const hit = el("path",{d:wedge(INNER_R,OUTER_R,a0,a1),fill:"transparent",stroke:"none"});
      hit.style.pointerEvents = "all";
      hit.style.cursor = editMode ? "pointer" : (online ? "pointer" : "default");

      // In edit mode: open panel on mousedown (don't stop propagation for mouseup)
      hit.addEventListener("mousedown", e => {
        if (e.button !== 0 || !editMode) return;
        e.preventDefault(); // prevent text selection etc.
        // Do NOT stopPropagation — global mouseup must still fire to clear hub ring etc.
        openPanel(i, mid);
      });

      // Right-click: unassign
      hit.addEventListener("contextmenu", e => {
        e.preventDefault();
        if (asgn) {
          chrome.runtime.sendMessage({type:"SET_SLOT",slotIndex:i,assignment:null},
            () => reload());
        }
      });

      g.appendChild(hit);
      SVG.appendChild(g);
      slices.push({bg, mid, online, live, asgn, empty});
    }
  }

  // ── Assign panel ──────────────────────────────────────────────────────────
  function openPanel(slotIdx, mid) {
    const [px,py] = xy(OUTER_R+65, mid);
    PANEL.style.left = (originX+px)+"px";
    PANEL.style.top  = (originY+py)+"px";
    PANEL.innerHTML = "";

    const h = mk("div"); h.className="ap-h";
    h.textContent = `Slot ${slotIdx+1}`;
    PANEL.appendChild(h);

    openTabs.forEach(t => {
      const row = mk("div"); row.className = "ap-r";
      const fav = document.createElement("img");
      fav.className = "ap-f"; fav.src = t.favIconUrl||"";
      fav.onerror = () => fav.remove();
      const lbl = mk("span"); lbl.className="ap-t";
      lbl.textContent = t.title.length>30 ? t.title.slice(0,28)+"…" : t.title;
      row.append(fav, lbl);
      // Use mousedown so it works even if mouseup closes the wheel
      row.addEventListener("mousedown", e => {
        e.preventDefault();
        // stopPropagation here is OK — we WANT to block the wheel from closing
        // on this mousedown. The wheel stays open in edit mode anyway.
        e.stopPropagation();
        chrome.runtime.sendMessage({
          type:"SET_SLOT", slotIndex:slotIdx,
          assignment:{url:t.url,title:t.title,favIconUrl:t.favIconUrl||""}
        }, () => { closePanel(); reload(); });
      });
      PANEL.appendChild(row);
    });

    if (slots[String(slotIdx)]) {
      const clr = mk("div"); clr.className="ap-r ap-x";
      clr.textContent = "✕  Clear slot";
      clr.addEventListener("mousedown", e => {
        e.preventDefault(); e.stopPropagation();
        chrome.runtime.sendMessage({type:"SET_SLOT",slotIndex:slotIdx,assignment:null},
          () => { closePanel(); reload(); });
      });
      PANEL.appendChild(clr);
    }

    PANEL.classList.add("on");
  }

  function closePanel() { PANEL.classList.remove("on"); }

  function reload() {
    chrome.runtime.sendMessage({type:"GET_SLOTS"}, r => {
      if (chrome.runtime.lastError) return;
      slots     = r?.slots     || {};
      slotCount = r?.slotCount || 8;
      buildWheel();
    });
  }

  // ── Edit mode ─────────────────────────────────────────────────────────────
  function toggleEdit() {
    editMode = !editMode;
    HUB.classList.toggle("edit", editMode);
    MTAG.style.opacity = editMode ? "1" : "0";
    HINT.textContent   = editMode
      ? "Click slice to assign  ·  Right-click to clear  ·  Hold center to exit"
      : "Hold center to edit  ·  Flick to switch";
    closePanel();
    buildWheel();
  }

  // ── Open / close ──────────────────────────────────────────────────────────
  function show(x, y) {
    if (isOpen || isLoading) return;
    isLoading = true;
    editMode  = false;
    originX   = x; originY = y;
    hovered   = -1; goTo = null; releaseQueued = false;

    chrome.runtime.sendMessage({type:"GET_TABS"}, res => {
      if (chrome.runtime.lastError || !res) { isLoading=false; return; }
      openTabs = res.tabs || [];

      chrome.runtime.sendMessage({type:"GET_SLOTS"}, sr => {
        if (chrome.runtime.lastError) { isLoading=false; return; }
        slots     = sr?.slots     || {};
        slotCount = sr?.slotCount || 8;
        isLoading = false;
        isOpen    = true;
        place();
        buildWheel();
        ROOT.classList.add("open");
        SVG.classList.add("pop");
        SVG.addEventListener("animationend", ()=>SVG.classList.remove("pop"),{once:true});

        // User already released before we finished loading
        if (releaseQueued) { releaseQueued=false; dismiss(); }
      });
    });
  }

  function triggerMatches(e) {
    const mid = e.button === 1;
    const alt = e.button === 0 && e.altKey;
    if (trigger === "middle") return mid;
    if (trigger === "alt") return alt;
    return mid || alt;
  }

  function dismiss() {
    if (!isOpen) return;
    isOpen   = false;
    editMode = false;
    clearTimeout(hubTimer); hubTimer = null;
    RING.classList.remove("go");
    HUB.classList.remove("edit");
    MTAG.style.opacity = "0";
    HINT.textContent   = "Hold center to edit  ·  Flick to switch";
    ROOT.classList.remove("open");
    LBL.classList.remove("on");
    closePanel();
    hovered = -1;
    const t = goTo; goTo = null; slices = [];
    if (t) chrome.runtime.sendMessage({type:"SWITCH_TAB",tabId:t.id});
  }

  // ── Hover ─────────────────────────────────────────────────────────────────
  function setHover(i) {
    if (i === hovered) return;
    hovered = i;
    slices.forEach((s,j) => s.bg.classList.toggle("hot", j===i && s.online));
    const s = i>=0 ? slices[i] : null;
    if (s?.online) {
      LBL.textContent = (s.live?.title || s.asgn?.title || "").slice(0,42);
      LBL.classList.add("on");
      const rad = (s.mid-90)*Math.PI/180;
      LBL.style.left = (originX + Math.cos(rad)*LABEL_R)+"px";
      LBL.style.top  = (originY + Math.sin(rad)*LABEL_R)+"px";
    } else {
      LBL.classList.remove("on");
    }
  }

  // ── Global pointer events ─────────────────────────────────────────────────
  // Using document-level capture listeners.
  // IMPORTANT: we only stopPropagation on mousedown (to prevent page side-effects),
  // NEVER on mouseup — so the release is always caught here.

  document.addEventListener("mousedown", e => {
    if (!triggerMatches(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!isOpen && !isLoading) show(e.clientX, e.clientY);
  }, true);

  document.addEventListener("mousemove", e => {
    if (!isOpen || editMode || slices.length===0) return;
    const dx=e.clientX-originX, dy=e.clientY-originY;
    if (Math.hypot(dx,dy) < FLICK_R) { setHover(-1); return; }
    const deg = ((Math.atan2(dx,-dy)*180/Math.PI)+360)%360;
    const per = 360/slotCount;
    setHover(Math.floor(((deg+per/2)%360)/per) % slotCount);
  }, {capture:true, passive:true});

  document.addEventListener("mouseup", e => {
    // Always cancel hub timer on any mouseup
    if (hubTimer) { clearTimeout(hubTimer); hubTimer=null; RING.classList.remove("go"); }

    // Only act on left or middle button
    if (e.button !== 0 && e.button !== 1) return;

    // If still loading, queue the dismissal
    if (isLoading) { releaseQueued = true; return; }

    // In edit mode — don't dismiss on background mouseup,
    // only dismiss if backdrop was clicked (no panel open)
    if (isOpen && editMode) {
      // If panel is open, close it on mouseup outside the panel
      if (PANEL.classList.contains("on")) {
        const inPanel = e.target && PANEL.contains(e.target);
        if (!inPanel) closePanel();
      }
      return;
    }

    if (!isOpen) return;

    // Normal mode: pick hovered tab and dismiss
    const s = hovered>=0 ? slices[hovered] : null;
    if (s?.online && s.live) goTo = s.live;
    dismiss();
  }, true);

  document.addEventListener("auxclick", e => {
    if (triggerMatches(e)) e.preventDefault();
  }, true);

  document.addEventListener("keydown", e => {
    if (e.key!=="Escape") return;
    if (PANEL.classList.contains("on")) closePanel();
    else if (isOpen) dismiss();
  }, true);

  // ── Init ──────────────────────────────────────────────────────────────────
  buildDOM();
  chrome.storage.sync.get({ trigger: "both" }, data => { trigger = data.trigger || "both"; });
  chrome.storage.onChanged.addListener(changes => {
    if (changes.trigger) trigger = changes.trigger.newValue || "both";
  });
  console.log("[TabWheel] ready");
})();
