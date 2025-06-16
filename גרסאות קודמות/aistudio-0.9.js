// ==UserScript==
// @name         AI-Studio Progress Sidebar (inside chat container) - MultiColumn
// @namespace    https://example.com/
// @version      0.9
// @description  סרגל-התקדמות שמאלי ב-aistudio.google.com – מתפצל לעמודות, רק על אזור-הצ’אט, נקודות ברווח שווה, מתעלם מ-Thoughts.
// @match        https://aistudio.google.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  const SIDEBAR_COLUMN_CLASS = 'ais-progress-sidebar-column'; // ★ שונה: שם קלאס לעמודה
  const DOT = 'ais-progress-dot';
  const COLOR_USER = '#4CAF50';
  const COLOR_MODEL = '#2196F3';
  const INIT_DELAY = 2000;
  const OBS_DELAY = 300;
  const MAX_PER_COL = 30; // ★ חדש: מקסימום נקודות לעמודה

  let messages = [], active = -1, io = null, mo = null, chatRoot = null, inited = false;
  let wrap = null; // ★ חדש: אלמנט העטיפה של העמודות (מחליף את sidebar כקונטיינר ראשי)

  const debounce = (fn, t) => { let id; return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), t); }; };

  const $ = (tag, cls = '', attrs = {}) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    return e;
  };

  /*──────  CSS  ──────*/
  function css() {
    if (document.getElementById('sidebar-css')) return;
    const s = $('style', '', { id: 'sidebar-css' });
    s.textContent = `
      /* ★ חדש: מעטפת כל העמודות */
      #ais-progress-wrap {
        position: absolute; /* צמוד לקונטיינר-צ'אט */
        pointer-events: none;
        display: flex; /* שורה של עמודות */
        gap: 18px; /* רווח ביניהן (כולל רווח לקו) */
        opacity: 0;
        transition: opacity .3s, left .3s;
      }
      #ais-progress-wrap.show { opacity: 1; }

      /* ★ שונה: סגנון לעמודה בודדת (לשעבר #ais-progress-sidebar) */
      .${SIDEBAR_COLUMN_CLASS} {
        position: relative; /* חשוב עבור ה ::before */
        display: flex;
        flex-direction: column;
        align-items: center;
        /* justify-content ייקבע דינמית ב render */
        pointer-events: none; /* הנקודות יקבלו pointer-events:auto */
        height: 100%; /* ימלא את גובה ה-wrap */
      }
      .${SIDEBAR_COLUMN_CLASS}::before { /* הקו האנכי של העמודה */
        content: '';
        position: absolute;
        left: 50%;
        top: 0;
        width: 4px;
        height: 100%;
        background: #B0B0B0;
        border-radius: 2px;
        transform: translateX(-50%);
      }
      .${DOT} {
        width: 10px; height: 10px; border-radius: 50%; cursor: pointer; pointer-events: auto;
        transition: transform .2s, box-shadow .2s; position: relative;
        z-index: 1; /* מעל הקו ::before */
      }
      .${DOT}::after {
        content: attr(data-num);
        position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
        font: 10px/1 sans-serif; color: #9e9e9e; pointer-events: none;
      }
      .${DOT}.first::after,
      .${DOT}.last::after { color: #000; }
      .${DOT}.user { background: ${COLOR_USER}; }
      .${DOT}.model { background: ${COLOR_MODEL}; }
      .${DOT}.active { transform: scale(1.35); box-shadow: 0 0 8px rgba(0,0,0,.4); }
      .${DOT}:hover { transform: scale(1.25); }
    `;
    document.head.appendChild(s);
  }

  /*── Sidebar (Wrap) Creation ──*/
  // ★ שונה: הפונקציה יוצרת את ה-wrap במקום sidebar ישירות
  function makeWrap() {
    wrap = document.getElementById('ais-progress-wrap') || $('div', '', { id: 'ais-progress-wrap' });
    // ודא שהוא עדיין לא קיים לפני הוספה
    if (!document.getElementById('ais-progress-wrap')) {
        document.body.appendChild(wrap);
    }
  }

  /*── Helpers ──*/
  const isThought = t => t.querySelector('ms-thought-chunk') || t.querySelector('.thought-panel');

  /*── Scan ──*/
  function scan() {
    chatRoot = document.querySelector('ms-autoscroll-container') || document.querySelector('ms-chat-session');
    const list = [];
    document.querySelectorAll('ms-chat-turn').forEach(t => {
      const box = t.querySelector('.chat-turn-container'); let role = 'unknown';
      if (box?.classList.contains('user')) role = 'user';
      if (box?.classList.contains('model')) role = 'model';
      if (role === 'model' && isThought(t)) role = 'skip';
      if (role === 'unknown') role = 'user'; // Default for safety
      if (role !== 'skip') list.push({ turn: t, role });
    });
    const changed = list.length !== messages.length || list.some((m, i) => m.turn !== messages[i]?.turn);
    if (changed) messages = list;
    return changed;
  }

  /*──────  רינדור נקודות (★ הוחלפה כמעט כולה)  ──────*/
  function render() {
    if (!wrap) makeWrap(); // ודא שה-wrap קיים
    wrap.replaceChildren(); // ניקוי כל העמודות הקודמות מה-wrap
    if (!messages.length) {
      wrap.classList.remove('show');
      return;
    }

    /* חישוב מספר העמודות הדרוש */
    const numCols = Math.ceil(messages.length / MAX_PER_COL);
    const dotsPerColActually = Math.ceil(messages.length / numCols); // מספר נקודות מאוזן יותר לכל עמודה

    /* בונה N עמודות */
    const colArr = [...Array(numCols)].map(() => {
      const col = $('div', SIDEBAR_COLUMN_CLASS); // ★ שימוש בקלאס החדש לעמודה
      col.style.display = 'flex';
      col.style.flexDirection = 'column';
      col.style.alignItems = 'center'; // ★ הוספתי align-items:center שהיה ב-CSS המקורי
      // col.style.justifyContent ייקבע בהמשך לכל עמודה
      wrap.appendChild(col);
      return col;
    });

    messages.forEach((m, i) => {
      const clsExtra = i === 0 ? ' first' : (i === messages.length - 1 ? ' last' : '');
      const d = $('div', `${DOT} ${m.role}${clsExtra}`, {
        'data-i': i,
        'data-num': i + 1
      });
      d.title = `הודעה ${i + 1} (${m.role === 'user' ? 'משתמש' : 'מודל'})`;
      d.onclick = e => { e.stopPropagation(); scrollTo(i); };

      const colIndex = Math.floor(i / dotsPerColActually); // פיזור מאוזן יותר
      if (colArr[colIndex]) { // בדיקת בטיחות
          colArr[colIndex].appendChild(d);
      }
    });

    // קביעת justify-content לכל עמודה בנפרד
    colArr.forEach(col => {
        if (col.children.length > 1) {
            col.style.justifyContent = 'space-between';
        } else {
            col.style.justifyContent = 'flex-start';
        }
    });


    wrap.classList.add('show');
    place(); // מיקום ה-wrap כולו
    resetIO();
  }

  /*──────  מיקום הסרגל (★ הוחלפה - מתייחסת ל-wrap)  ──────*/
  function place() {
    if (!chatRoot || !wrap) return; // בדיקה ששניהם קיימים
    const r = chatRoot.getBoundingClientRect();
    wrap.style.top = `${r.top + window.scrollY}px`;
    wrap.style.height = `${r.height}px`;
    wrap.style.left = `${r.left + 8}px`; // 8px פנימה מהקונטיינר
  }

  /*──────  גלילה  ──────*/
  function scrollTo(i) {
    const el = messages[i]?.turn;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.scrollBy({ top: -12, left: 0, behavior: 'smooth' }); // פיצוי קטן לגובה הבר העליון
    activate(i); // מדגיש מיד את הנקודה הנכונה
  }

  /*── Activate (★ שונה - עובד על wrap) ──*/
  const activate = i => {
    if (i === active || !wrap) return; active = i;
    wrap.querySelectorAll('.' + DOT).forEach(d => d.classList.remove('active')); // חיפוש בתוך wrap
    wrap.querySelector(`.${DOT}[data-i="${i}"]`)?.classList.add('active'); // חיפוש בתוך wrap
  };

  /*── IO ──*/
  function resetIO() {
    io?.disconnect(); if (!chatRoot) return;
    io = new IntersectionObserver(es => {
      let best = null, r = 0;
      es.forEach(e => {
        if (e.isIntersecting && e.intersectionRatio > r) {
          best = e; r = e.intersectionRatio;
        }
      });
      if (best) {
        const i = messages.findIndex(m => m.turn === best.target);
        if (i > -1) activate(i);
      }
    }, { root: chatRoot, rootMargin: '-50% 0% -50% 0%', threshold: .01 });
    messages.forEach(m => io.observe(m.turn));
  }

  /*── Mutation ──*/
  const refresh = debounce(() => { if (scan()) render(); else place(); }, OBS_DELAY);
  function watch() {
    const tgt = document.querySelector('ms-chat-session') || document.body;
    mo?.disconnect(); mo = new MutationObserver(refresh);
    mo.observe(tgt, { childList: true, subtree: true });
  }

  /*── Init ──*/
  function init() {
    if (inited) return; inited = true;
    css();
    makeWrap(); // ★ שונה: יוצר את ה-wrap
    if (scan()) render(); else place();
    watch();
    window.addEventListener('resize', debounce(place, 200));
    window.addEventListener('scroll', debounce(place, 200));
  }

  /*── Start ──*/
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', () => setTimeout(init, INIT_DELAY))
    : setTimeout(init, INIT_DELAY);
})();