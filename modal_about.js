
(() => {
  const STORAGE_KEY = "rhythm_state_v1";

  const RADIUS = 32;
  const SCROLL_PADDING = 60;
  const STROKE = 5;
  const INSET = 6;
  const TRAIL = 20;
  const THUMB = 70;
  const FINISH = 5;
  const ALPHA = 0.9;
  const TRACK_ALPHA = 0;
  const OFFSET_CORNER = -50;
  const OFFSET_END = 30;

  let overlay = null;
  let modal = null;
  let scroller = null;
  let list = null;
  let bar = null;
  let track = null;
  let thumb = null;
  let styles = null;

  let frames = [];
  let tl = null;
  let ro = null;
  let colorTimer = null;

  function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

  function parseHHMM(hhmm) {
    const m = /^(\d{2}):(\d{2})$/.exec(hhmm || "");
    if (!m) return null;
    const hh = Math.max(0, Math.min(23, parseInt(m[1], 10)));
    const mm = Math.max(0, Math.min(59, parseInt(m[2], 10)));
    return hh * 60 + mm;
  }

  function getPrefsDayNight() {
    const raw = localStorage.getItem(STORAGE_KEY);
    const st = raw ? safeParse(raw) : null;
    const dn = st?.prefs?.dayNight;
    if (Array.isArray(dn) && dn.length === 2 && parseHHMM(dn[0]) != null && parseHHMM(dn[1]) != null) return dn;
    return ["07:00", "17:00"];
  }

  function isDayNow(d) {
    const dn = getPrefsDayNight();
    const a = parseHHMM(dn[0]); const b = parseHHMM(dn[1]);
    if (a == null || b == null) return true;
    const cur = d.getHours() * 60 + d.getMinutes();
    return cur >= a && cur < b;
  }

  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function getNowColor() {
    const day = isDayNow(new Date());
    const orange = cssVar("--orange", "#ff8a00");
    const navy = cssVar("--navy", "#0b3d91");
    return day ? orange : navy;
  }

  function ensureDom() {
    if (overlay) return;

    overlay = document.createElement("div");
    overlay.id = "aboutOverlay";

    modal = document.createElement("div");
    modal.id = "aboutModal";

    const closeDot = document.createElement("div");
    closeDot.className = "card__toggle is-red";
    closeDot.title = "Close";

    // Keep the exact structure used by your reference code
    styles = document.createElement("style");
    styles.id = "scroller-frames";

    scroller = document.createElement("div");
    scroller.className = "scroller";

    bar = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    bar.setAttribute("class", "scroller__bar bar");
    bar.setAttribute("viewBox", "0 0 56 56");

    track = document.createElementNS("http://www.w3.org/2000/svg", "path");
    track.setAttribute("class", "bar__track");
    track.setAttribute("fill", "none");
    track.setAttribute("stroke-linecap", "round");

    thumb = document.createElementNS("http://www.w3.org/2000/svg", "path");
    thumb.setAttribute("class", "bar__thumb");
    thumb.setAttribute("fill", "none");
    thumb.setAttribute("stroke-linecap", "round");

    bar.appendChild(thumb);
    bar.appendChild(track);

    const scrollWrap = document.createElement("div");

    const snapStart = document.createElement("div");
    snapStart.className = "snap-start";
    snapStart.setAttribute("aria-hidden", "true");

    const main = document.createElement("main");

    const spacer = document.createElement("p");
    spacer.textContent = " ";
    main.appendChild(spacer);

    const snapEnd = document.createElement("div");
    snapEnd.className = "snap-end";
    snapEnd.setAttribute("aria-hidden", "true");

    scrollWrap.appendChild(snapStart);
    scrollWrap.appendChild(main);
    scrollWrap.appendChild(snapEnd);

    scroller.appendChild(bar);
    scroller.appendChild(scrollWrap);

    modal.appendChild(closeDot);
    modal.appendChild(styles);
    modal.appendChild(scroller);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Click shield behavior
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    closeDot.addEventListener("click", close);
    window.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

    // Link DOM refs
    list = scroller.querySelector("div"); // first inner div is the scroll container

  }

async function open() {
  ensureDom();
  overlay.classList.add("is-open");
  document.body.style.overflow = "hidden";

  // 现在弹窗可见了，初始化才有意义
  initScroller();
  refreshColorLoop();

  // 渲染内容会改变 scrollHeight，渲染后必须再算一次
  await loadAndRenderJson();
  relayoutScroller();
}


  function close() {
    if (!overlay) return;
    overlay.classList.remove("is-open");
    document.body.style.overflow = "";
    if (colorTimer) { clearInterval(colorTimer); colorTimer = null; }
  }

  async function loadAndRenderJson() {
    const main = scroller.querySelector("main");
    if (!main) return;

    let data = null;
    try {
      const res = await fetch("./modal_about.json", { cache: "no-store" });
      data = res.ok ? await res.json() : null;
    } catch {
      data = null;
    }
    if (!data || typeof data !== "object") return;

    const langRaw = (document.documentElement.lang || navigator.language || "en").toLowerCase();
    const candidates = [];
    candidates.push(langRaw);
    candidates.push(langRaw.split("-")[0]);
    if (langRaw.startsWith("zh")) candidates.push("zh-cn");
    candidates.push("en");

    let picked = "en";
    for (const k of candidates) { if (k && data[k] && typeof data[k] === "object") { picked = k; break; } }

    const obj = data[picked] || data["en"] || {};
    main.innerHTML = "";

    for (const [title, text] of Object.entries(obj)) {
      const h2 = document.createElement("h2");
      h2.textContent = String(title);
      const p = document.createElement("p");
      p.textContent = String(text);
      main.appendChild(h2);
      main.appendChild(p);
    }
    relayoutScroller();
  }

  function refreshColorLoop() {
    setScrollerColor();
    if (colorTimer) clearInterval(colorTimer);
    colorTimer = setInterval(setScrollerColor, 10000);
  }

  function setScrollerColor() {
    if (!scroller) return;
    const c = getNowColor();
    scroller.style.setProperty("--color", c);
  }

  // ===== Reference code logic (minimally adapted: imports removed, color uses vars) =====
  function syncBar(entry) {
    const target = entry.target;
    const mid = RADIUS;
    const innerRad = Math.max(0, RADIUS - (INSET + STROKE * 0.5));
    const padTop = INSET + STROKE * 0.5;
    const padLeft = RADIUS * 2 - padTop;

    bar.setAttribute("viewBox", `0 0 ${RADIUS * 2} ${target.offsetHeight}`);

    let d = `
  M${mid - TRAIL},${padTop}
    ${innerRad === 0 ? "" : `L${mid},${padTop}`}
    ${innerRad === 0 ? `L${padLeft},${padTop}` : `a${innerRad},${innerRad} 0 0 1 ${innerRad} ${innerRad}`}`;
    thumb.setAttribute("d", d);
    const cornerLength = Math.ceil(thumb.getTotalLength());

    d = `
    M${mid - TRAIL},${padTop}
    ${innerRad === 0 ? "" : `L${mid},${padTop}`}
    ${innerRad === 0 ? `L${padLeft},${padTop}` : `a${innerRad},${innerRad} 0 0 1 ${innerRad} ${innerRad}`}
    L${padLeft},${target.offsetHeight - (INSET + STROKE * 0.5 + innerRad)}
    ${innerRad === 0 ? `L${padLeft},${target.offsetHeight - (INSET + STROKE * 0.5)}` : `a${innerRad},${innerRad} 0 0 1 ${-innerRad} ${innerRad}`}
    L${mid - TRAIL},${target.offsetHeight - (INSET + STROKE * 0.5)}
  `;
    thumb.setAttribute("d", d);
    track.setAttribute("d", d);

    const trackLen = Math.ceil(track.getTotalLength());
    scroller.style.setProperty("--track-length", trackLen);

    const denom = (list.scrollHeight - scroller.offsetHeight) || 1;
    const padPct = Math.floor((SCROLL_PADDING / denom) * 100);

    frames = [
      [0, THUMB - FINISH - OFFSET_END],
      [padPct, (cornerLength + OFFSET_CORNER) * -1],
      [100 - padPct, (Math.floor(trackLen) - cornerLength - THUMB - OFFSET_CORNER) * -1],
      [100, (Math.floor(trackLen) - FINISH - OFFSET_END) * -1],
    ];

    styles.innerHTML = `
    @keyframes scroll {
      ${frames[0][0]}% { stroke-dashoffset: ${frames[0][1]};}
      ${frames[1][0]}% { stroke-dashoffset: ${frames[1][1]};}
      ${frames[2][0]}% { stroke-dashoffset: ${frames[2][1]};}
      ${frames[3][0]}% { stroke-dashoffset: ${frames[3][1]};}
    }
  `;
  }

  function initScroller() {
    scroller.style.setProperty("--radius", RADIUS);
    scroller.style.setProperty("--padding", SCROLL_PADDING);
    scroller.style.setProperty("--stroke-width", STROKE);
    scroller.style.setProperty("--thumb-size", THUMB);
    scroller.style.setProperty("--bar-alpha", ALPHA);
    scroller.style.setProperty("--track-alpha", TRACK_ALPHA);
    scroller.style.setProperty("--color", getNowColor());

    if (!ro) {
      ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          syncBar(entry);
          if (tl && !CSS.supports("(animation-timeline: scroll())")) {
            tl.kill();
            tl = null;
            configureFallback();
          }
        }
      });
      ro.observe(scroller);
    }

    syncBar({ target: list });
    configureFallback();
  }

  function relayoutScroller() {
  if (!scroller || !list) return;
  // 强制在可见布局完成后再测量（两帧更稳）
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      syncBar({ target: scroller });
      configureFallback();
    });
  });
}


  
  function ensureGsap(cb) {
    if (window.gsap && window.ScrollTrigger) { cb(); return; }
    const a = document.createElement("script");
    a.src = "https://cdn.jsdelivr.net/npm/gsap@3.12.0/dist/gsap.min.js";
    a.onload = () => {
      const b = document.createElement("script");
      b.src = "https://cdn.jsdelivr.net/npm/gsap@3.12.0/dist/ScrollTrigger.min.js";
      b.onload = () => cb();
      document.body.appendChild(b);
    };
    document.body.appendChild(a);
  }

  function configureFallback() {
    if (CSS.supports("(animation-timeline: scroll())")) return;
    ensureGsap(() => {
      window.gsap.registerPlugin(window.ScrollTrigger);
      tl = window.gsap.to(".bar__thumb", {
        scrollTrigger: { scroller: list, scrub: true },
        ease: "none",
        keyframes: {
          [`${frames[0][0]}`]: { strokeDashoffset: frames[0][1] },
          [`${frames[1][0]}`]: { strokeDashoffset: frames[1][1] },
          [`${frames[2][0]}`]: { strokeDashoffset: frames[2][1] },
          [`${frames[3][0]}`]: { strokeDashoffset: frames[3][1] },
        },
      });
    });
  }

  window.RhythmAboutModal = { open, close };
})();
