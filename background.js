if (typeof importScripts === 'function' && !globalThis.TKL) importScripts('shared.js');

const FRESH_MS = 45 * 1000;
const STALE_OK_MS = 5 * 60 * 1000;
const cache = { twitch: null, kick: null };
const inflight = {};

async function cookieValue(url, name) {
  try {
    const c = await chrome.cookies.get({ url, name });
    return c ? c.value : null;
  } catch (e) {
    return null;
  }
}

async function fetchSite(site) {
  if (site === 'twitch') {
    return TKL.fetchTwitch(await cookieValue('https://www.twitch.tv', 'auth-token'));
  }
  const raw = await cookieValue('https://kick.com', 'session_token');
  return TKL.fetchKick(raw ? decodeURIComponent(raw) : null);
}

async function getSite(site, force) {
  const c = cache[site];
  if (!force && c && Date.now() - c.t < FRESH_MS) return { ok: true, data: c.data };
  try {
    inflight[site] = inflight[site] || fetchSite(site).finally(() => delete inflight[site]);
    const data = await inflight[site];
    cache[site] = { data, t: Date.now() };
    return { ok: true, data };
  } catch (e) {
    const code = e.code || 'error';
    if (code !== 'not_logged_in' && c && Date.now() - c.t < STALE_OK_MS) return { ok: true, data: c.data, stale: true };
    return { ok: false, error: code, message: e.message };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;
  if (msg.type === 'report' && (msg.site === 'twitch' || msg.site === 'kick') && Array.isArray(msg.data)) {
    cache[msg.site] = { data: msg.data, t: Date.now() };
    sendResponse({ ok: true });
    return;
  }
  if (msg.type === 'get' && (msg.site === 'twitch' || msg.site === 'kick')) {
    getSite(msg.site, false).then(sendResponse);
    return true;
  }
  if (msg.type === 'status') {
    Promise.all([getSite('twitch', true), getSite('kick', true)]).then(([twitch, kick]) => sendResponse({ twitch, kick }));
    return true;
  }
});
