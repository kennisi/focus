import gsap from 'https://cdn.skypack.dev/gsap@3.12.0';
import { ScrollTrigger } from 'https://cdn.skypack.dev/gsap@3.12.0/ScrollTrigger';

const STORAGE_KEY = "rhythm_state_v1";
const JSON_URL = "./modal_about.json";

let inited = false;

let scroller = null;
let list = null;
let bar = null;
let track = null;
let thumb = null;
let styles = null;

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

let frames = [];
let tl = null;

function safeParse(json) { try { return JSON.parse(json); } catch { return null; } }

function parseHHMM(hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm || "");
  if (!m) return null;
  const hh = Math.max(0, Math.min(23, parseInt(m[1], 10)));
  const mm = Math.max(0, Math.min(59, parseInt(m[2], 10)));
  return hh * 60 + mm;
}

function isDayNow(d, dayNight) {
  const dn = Array.isArray(dayNight) ? dayNight : ["07:00", "17:00"];
  const a = parseHHMM(dn[0]); const b = parseHHMM(dn[1]);
  if (a == null || b == null) return true;
  const cur = d.getHours() * 60 + d.getMinutes();
  return cur >= a && cur < b;
}

function getPrefs() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const s = raw ? safeParse(raw) : null;
  const prefs = (s && s.prefs) ? s.prefs : { dayNight: ["07:00","17:00"] };
  if (!Array.isArray(prefs.dayNight) || prefs.dayNight.length !== 2) prefs.dayNight = ["07:00","17:00"];
  return prefs;
}

function getAccentColor() {
  const prefs = getPrefs();
  const day = isDayNow(new Date(), prefs.dayNight);
  const root = getComputedStyle(document.documentElement);
  const orange = (root.getPropertyValue("--orange") || "").trim();
  const navy = (root.getPropertyValue("--navy") || "").trim();
  return day ? (orange || "#ff8a00") : (navy || "#0b3d91");
}

function pickLangKey(data) {
  const docLang = (document.documentElement.lang || "").toLowerCase();
  const navLang = (navigator.language || "en").toLowerCase();
  const lang = (docLang || navLang || "en").toLowerCase();

  if (data[lang]) return lang;

  if (lang.startsWith("zh") && data["zh-cn"]) return "zh-cn";
  if (lang.startsWith("en") && data["en"]) return "en";

  return data["en"] ? "en" : Object.keys(data)[0];
}

function ensureModalDom() {
  if (document.getElementById("aboutMask")) return;

  const mask = document.createElement("div");
  mask.id = "aboutMask";

  const modal = document.createElement("div");
  modal.id = "aboutModal";
  modal.className = "card";

  const closeDot = document.createElement("div");
  closeDot.className = "card__toggle is-red";
  closeDot.addEventListener("click", () => close());

  const framesStyle = document.createElement("style");
  framesStyle.id = "scroller-frames";

  const sc = document.createElement("div");
  sc.className = "scroller";

  sc.innerHTML = `
    <svg class="scroller__bar bar" viewBox="0 0 56 56" xmlns="http://www.w3.org/2000/svg">
      <path class="bar__thumb" fill="none" stroke-linecap="round"></path>
      <path class="bar__track" fill="none" stroke-linecap="round"></path>
    </svg>
    <div>
      <div class="snap-start" aria-hidden="true"></div>
      <main id="aboutContent"></main>
      <div class="snap-end" aria-hidden="true"></div>
    </div>
  `;

  modal.appendChild(closeDot);
  modal.appendChild(framesStyle);
  modal.appendChild(sc);
  mask.appendChild(modal);
  document.body.appendChild(mask);
}

function syncBar(entry) {
  const target = entry.target;
  const mid = RADIUS;
  const innerRad = Math.max(0, RADIUS - (INSET + STROKE * 0.5));
  const padTop = INSET + STROKE * 0.5;
  const padLeft = RADIUS * 2 - padTop;

  bar.setAttribute('viewBox', `0 0 ${RADIUS * 2} ${target.offsetHeight}`);

  let d = `
  M${mid - TRAIL},${padTop}
    ${innerRad === 0 ? '' : `L${mid},${padTop}`}
    ${innerRad === 0 ? `L${padLeft},${padTop}` : `a${innerRad},${innerRad} 0 0 1 ${innerRad} ${innerRad}`}`;
  thumb.setAttribute('d', d);
  const cornerLength = Math.ceil(thumb.getTotalLength());

  d = `
    M${mid - TRAIL},${padTop}
    ${innerRad === 0 ? '' : `L${mid},${padTop}`}
    ${innerRad === 0 ? `L${padLeft},${padTop}` : `a${innerRad},${innerRad} 0 0 1 ${innerRad} ${innerRad}`}
    L${padLeft},${target.offsetHeight - (INSET + STROKE * 0.5 + innerRad)}
    ${innerRad === 0 ? `L${padLeft},${target.offsetHeight - (INSET + STROKE * 0.5)}` : `a${innerRad},${innerRad} 0 0 1 ${-innerRad} ${innerRad}`}
    L${mid - TRAIL},${target.offsetHeight - (INSET + STROKE * 0.5)}
  `;
  thumb.setAttribute('d', d);
  track.setAttribute('d', d);

  const trackLen = Math.ceil(track.getTotalLength());
  scroller.style.setProperty('--track-length', trackLen);

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

function configureFallback() {
  if (CSS.supports('(animation-timeline: scroll())')) return;
  gsap.registerPlugin(ScrollTrigger);
  tl = gsap.to('.bar__thumb', {
    scrollTrigger: { scroller: list, scrub: true },
    ease: 'none',
    keyframes: {
      [`${frames[0][0]}`]: { strokeDashoffset: frames[0][1] },
      [`${frames[1][0]}`]: { strokeDashoffset: frames[1][1] },
      [`${frames[2][0]}`]: { strokeDashoffset: frames[2][1] },
      [`${frames[3][0]}`]: { strokeDashoffset: frames[3][1] },
    },
  });
}

function initScrollerOnce() {
  if (inited) return;
  inited = true;

  document.documentElement.dataset.roundedScroll = 'true';

  scroller = document.querySelector('#aboutModal .scroller');
  list = scroller.querySelector('div');
  bar = scroller.querySelector('.scroller__bar');
  track = scroller.querySelector('.bar__track');
  thumb = bar.querySelector('.bar__thumb');
  styles = document.getElementById('scroller-frames');

  scroller.style.setProperty('--radius', RADIUS);
  scroller.style.setProperty('--padding', SCROLL_PADDING);
  scroller.style.setProperty('--stroke-width', STROKE);
  scroller.style.setProperty('--thumb-size', THUMB);
  scroller.style.setProperty('--bar-alpha', ALPHA);
  scroller.style.setProperty('--track-alpha', TRACK_ALPHA);

  const ro = new ResizeObserver((entries) => {
    for (const entry of entries) {
      syncBar(entry);
      if (tl && !CSS.supports('(animation-timeline: scroll())')) {
        tl.kill();
        tl = null;
        configureFallback();
      }
    }
  });
  ro.observe(scroller);

  syncBar({ target: list });
  configureFallback();
}

async function renderContent() {
  const res = await fetch(JSON_URL, { cache: "no-store" });
  if (!res.ok) return;

  const data = await res.json();
  const langKey = pickLangKey(data);
  const dict = data[langKey] || data["en"] || {};

  const main = document.getElementById("aboutContent");
  if (!main) return;

  main.innerHTML = "";

  for (const [k, v] of Object.entries(dict)) {
    const h2 = document.createElement("h2");
    h2.textContent = k;

    const p = document.createElement("p");
    p.textContent = String(v);

    main.appendChild(h2);
    main.appendChild(p);
  }
}

function applyAccentColor() {
  const color = getAccentColor();
  scroller.style.setProperty('--color', color);
}

export async function open() {
  ensureModalDom();

  const mask = document.getElementById("aboutMask");
  mask.classList.add("is-open");

  initScrollerOnce();
  applyAccentColor();

  await renderContent();

  // content changed => recalc track frames
  syncBar({ target: list });
}

export function close() {
  const mask = document.getElementById("aboutMask");
  if (mask) mask.classList.remove("is-open");
}

window.RhythmAboutModal = { open, close };
