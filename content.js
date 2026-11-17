(() => {
  if (window.__tklLoaded) return;
  window.__tklLoaded = true;

  const SITE = /(^|\.)kick\.com$/.test(location.hostname) ? 'kick' : 'twitch';
  const OTHER = SITE === 'kick' ? 'twitch' : 'kick';
  const REFRESH_MS = 60 * 1000;

  const state = { own: [], other: [], aliases: new Set(), mainSite: 'current' };

  const cookie = (name) => {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]+)'));
    return m ? m[1] : null;
  };

  const fmt = (() => {
    let nf;
    try {
      nf = new Intl.NumberFormat(document.documentElement.lang || navigator.language, { notation: 'compact', maximumFractionDigits: 1 });
    } catch (e) {
      nf = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
    }
    return (n) => nf.format(n);
  })();

  function parseCount(text) {
    const m = String(text || '').match(/(\d[\d.,\s]*)\s*([KkMm])?/);
    if (!m) return null;
    if (m[2]) {
      const f = parseFloat(m[1].replace(/\s/g, '').replace(',', '.'));
      return isNaN(f) ? null : Math.round(f * (/m/i.test(m[2]) ? 1e6 : 1e3));
    }
    const n = parseInt(m[1].replace(/[.,\s]/g, ''), 10);
    return isNaN(n) ? null : n;
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function avatar(s, cls) {
    if (s.avatar) {
      const img = el('img', cls);
      img.src = s.avatar;
      img.alt = s.name;
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      return img;
    }
    return el('div', cls + ' tkl-noavatar', (s.name || '?').charAt(0).toUpperCase());
  }

  const label = (s) => (s.platform === 'kick' ? 'Kick' : 'Twitch');
  const countText = (s) => (s.showViewers ? fmt(s.viewers) : 'LIVE');
  const tooltip = (s) => `${s.name} — live on ${label(s)}${s.showViewers ? ' · ' + s.viewers.toLocaleString() + ' viewers' : ''}${s.title ? '\n' + s.title : ''}`;

  const adapters = {
    twitch: {
      fetchOwn: () => TKL.fetchTwitch(cookie('auth-token')),
      findList() {
        const marker = document.querySelector('.side-nav-section [data-test-selector="followed-channel"]');
        const section = marker ? marker.closest('.side-nav-section') : null;
        return section ? section.querySelector('.tw-transition-group') : null;
      },
      natives(list) {
        return [...list.children]
          .filter((c) => !c.hasAttribute('data-tkl'))
          .map((c) => {
            const a = c.querySelector('a[href]');
            const live = c.querySelector('.tw-channel-status-indicator');
            const span = c.querySelector('.side-nav-card__live-status span');
            return {
              el: c,
              id: a ? (a.getAttribute('href') || '').replace(/^\//, '').split(/[/?#]/)[0].toLowerCase() : '',
              live: !!live,
              parsed: span ? parseCount(span.textContent) : null,
            };
          });
      },
      build(s) {
        const wrap = el('div', 'tkl-card tkl-tw');
        const a = el('a', 'tkl-tw-link');
        a.href = s.url;
        const av = el('div', 'tkl-tw-avatar');
        av.appendChild(avatar(s, 'tkl-tw-img'));
        av.appendChild(el('span', 'tkl-dot tkl-dot-' + s.platform + ' tkl-tw-avatar-dot'));
        const meta = el('div', 'tkl-tw-meta');
        meta.appendChild(el('p', 'tkl-tw-title', s.name));
        meta.appendChild(el('p', 'tkl-tw-game', s.game));
        const status = el('div', 'tkl-tw-status');
        status.appendChild(el('span', 'tkl-dot tkl-dot-' + s.platform));
        status.appendChild(el('span', 'tkl-tw-count', countText(s)));
        a.append(av, meta, status);
        wrap.appendChild(a);
        return wrap;
      },
    },

    kick: {
      fetchOwn() {
        const raw = cookie('session_token');
        return TKL.fetchKick(raw ? decodeURIComponent(raw) : null);
      },
      findList() {
        const bar = document.querySelector('#sidebar-wrapper');
        if (!bar) return null;
        const marker = bar.querySelector('a[data-testid^="sidebar-following-channel"]');
        return marker ? marker.closest('section') : null;
      },
      natives(list) {
        return [...list.children]
          .filter((c) => c.tagName === 'A' && !c.hasAttribute('data-tkl'))
          .map((c) => {
            const dot = c.querySelector('.rounded-full.h-2, .bg-brand-bg-default');
            const spans = c.querySelectorAll('span');
            const last = spans[spans.length - 1];
            return {
              el: c,
              id: (c.getAttribute('href') || '').replace(/^\//, '').split(/[/?#]/)[0].toLowerCase(),
              live: !!dot,
              parsed: dot && last ? parseCount(last.textContent) : null,
            };
          });
      },
      build(s, list) {
        const native =
          list.querySelector('a[data-testid^="sidebar-following-channel"]:not([data-state="active"])') ||
          list.querySelector('a[data-testid^="sidebar-following-channel"]');
        const collapsed = native ? !native.querySelector('span') : list.offsetWidth < 120;
        const a = el('a', native ? native.className : 'flex h-11 w-full flex-row items-center gap-2 rounded px-1.5 text-left font-semibold');
        [...a.classList].filter((c) => c.startsWith('bg-')).forEach((c) => a.classList.remove(c));
        a.classList.add('tkl-card', 'tkl-kick');
        a.href = s.url;
        const av = el('div', 'relative shrink-0 rounded-full size-8');
        av.appendChild(avatar(s, 'h-full w-full overflow-hidden rounded-full'));
        a.appendChild(av);
        if (collapsed) {
          av.appendChild(el('span', 'tkl-dot tkl-dot-' + s.platform + ' tkl-kick-avatar-dot'));
          return a;
        }
        const body = el('div', 'flex w-full gap-1 overflow-hidden');
        const text = el('div', 'flex max-w-full min-w-0 shrink grow flex-col gap-0.5');
        text.appendChild(el('span', 'shrink truncate text-sm leading-[1.2] font-bold', s.name));
        text.appendChild(el('span', 'truncate text-sm leading-normal font-normal text-surface-fg-subtle', s.game));
        const status = el('div', 'flex w-fit shrink-0 flex-nowrap items-center gap-x-1 self-start text-surface-fg-default');
        status.appendChild(el('div', 'h-2 w-2 rounded-full tkl-dot tkl-dot-' + s.platform));
        status.appendChild(el('span', 'text-sm font-semibold', countText(s)));
        body.append(text, status);
        a.appendChild(body);
        return a;
      },
    },
  };
  const A = adapters[SITE];

  let observer = null;
  let renderTimer = null;

  function plan() {
    const preferOther = state.mainSite === OTHER;
    const others = [];
    const hiddenOwn = new Set();
    for (const o of state.other) {
      const dup = state.own.find((s) => TKL.sameStreamer(o, s, state.aliases));
      if (!dup) others.push(o);
      else if (preferOther) {
        others.push(o);
        hiddenOwn.add(TKL.norm(dup.id));
      }
    }
    return { others, hiddenOwn };
  }

  function render() {
    const list = A.findList();
    if (!list) return;
    if (observer) observer.disconnect();
    try {
      list.classList.add('tkl-list');
      const ownById = new Map(state.own.map((s) => [TKL.norm(s.id), s]));
      const { others, hiddenOwn } = plan();
      const entries = [];
      for (const n of A.natives(list)) {
        const hide = n.live && hiddenOwn.has(TKL.norm(n.id));
        if (hide !== n.el.hasAttribute('data-tkl-hidden')) n.el.toggleAttribute('data-tkl-hidden', hide);
        if (hide) continue;
        const own = ownById.get(TKL.norm(n.id));
        const viewers = n.live ? (n.parsed != null ? n.parsed : own ? own.viewers : 0) : -1;
        entries.push({ el: n.el, viewers });
      }

      const existing = new Map();
      list.querySelectorAll(':scope > [data-tkl]').forEach((c) => existing.set(c.getAttribute('data-tkl'), c));

      for (const s of others) {
        const key = s.platform + ':' + s.id;
        const collapsedSig = SITE === 'kick' ? (list.offsetWidth < 120 ? 'c' : 'e') : '';
        const sig = [s.name, s.avatar, s.game, countText(s), s.url, collapsedSig].join('|');
        let card = existing.get(key);
        existing.delete(key);
        if (!card || card.getAttribute('data-tkl-sig') !== sig) {
          const fresh = A.build(s, list);
          fresh.setAttribute('data-tkl', key);
          fresh.setAttribute('data-tkl-sig', sig);
          fresh.title = tooltip(s);
          if (card) card.replaceWith(fresh);
          else list.appendChild(fresh);
          card = fresh;
        }
        entries.push({ el: card, viewers: s.viewers });
      }
      existing.forEach((c) => c.remove());

      entries
        .map((e, i) => ({ e, i }))
        .sort((x, y) => y.e.viewers - x.e.viewers || x.i - y.i)
        .forEach(({ e }, rank) => {
          const order = String(rank + 1);
          if (e.el.style.order !== order) e.el.style.order = order;
        });
    } finally {
      observe();
    }
  }

  function scheduleRender() {
    if (renderTimer) return;
    renderTimer = setTimeout(() => {
      renderTimer = null;
      render();
    }, 250);
  }

  function observe() {
    if (!observer) observer = new MutationObserver(scheduleRender);
    const root = document.querySelector(SITE === 'twitch' ? '.side-nav' : '#sidebar-wrapper');
    observer.observe(root || document.body, { childList: true, subtree: true, characterData: true });
    if (!root) rootWatch();
  }

  let rootTimer = null;
  function rootWatch() {
    if (rootTimer) return;
    rootTimer = setInterval(() => {
      if (document.querySelector(SITE === 'twitch' ? '.side-nav' : '#sidebar-wrapper')) {
        clearInterval(rootTimer);
        rootTimer = null;
        render();
      }
    }, 1000);
  }

  async function send(msg) {
    try {
      return await chrome.runtime.sendMessage(msg);
    } catch (e) {
      return null;
    }
  }

  async function refresh() {
    const [own, other] = await Promise.all([
      A.fetchOwn().catch(() => null),
      send({ type: 'get', site: OTHER }),
    ]);
    if (own) {
      state.own = own;
      send({ type: 'report', site: SITE, data: own });
    }
    if (other) state.other = other.ok ? other.data : [];
    render();
  }

  async function loadAliases() {
    try {
      const r = await chrome.storage.sync.get({ aliases: '', mainSite: 'current' });
      state.aliases = TKL.parseAliases(r.aliases);
      state.mainSite = r.mainSite;
    } catch (e) {}
  }

  try {
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.aliases) state.aliases = TKL.parseAliases(changes.aliases.newValue);
      if (changes.mainSite) state.mainSite = changes.mainSite.newValue;
      if (changes.aliases || changes.mainSite) render();
    });
  } catch (e) {}

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh();
  });
  setInterval(() => {
    if (!document.hidden) refresh();
  }, REFRESH_MS);
  setInterval(() => {
    const list = A.findList();
    if (list && !document.hidden && plan().others.length && !list.querySelector(':scope > [data-tkl]')) render();
  }, 2000);

  loadAliases().then(refresh);
  observe();
  window.__tklDebug = { state, render, refresh };
})();
