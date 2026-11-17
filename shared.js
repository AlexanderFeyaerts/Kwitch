(() => {
  const g = globalThis;
  if (g.TKL) return;

  const TWITCH_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
  const TWITCH_FOLLOWING_LIVE_HASH = 'bbfa83064e90280dce3eaa9de3a18eb6647505546336313241afdf569b6b34b6';

  class TklError extends Error {
    constructor(code, message) {
      super(message || code);
      this.code = code;
    }
  }

  async function fetchTwitch(token) {
    if (!token) throw new TklError('not_logged_in');
    const res = await fetch('https://gql.twitch.tv/gql', {
      method: 'POST',
      headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        Authorization: 'OAuth ' + token,
        'Content-Type': 'text/plain;charset=UTF-8',
      },
      body: JSON.stringify({
        operationName: 'FollowingLive_CurrentUser',
        variables: { imageWidth: 50, limit: 100, includeCostreaming: false },
        extensions: { persistedQuery: { version: 1, sha256Hash: TWITCH_FOLLOWING_LIVE_HASH } },
      }),
    });
    if (res.status === 401) throw new TklError('not_logged_in');
    if (!res.ok) throw new TklError('http_' + res.status);
    const json = await res.json();
    const user = json && json.data && json.data.currentUser;
    if (!user) {
      const msg = json && json.errors && json.errors[0] && json.errors[0].message;
      throw new TklError(msg ? 'api_error' : 'not_logged_in', msg);
    }
    const edges = (user.followedLiveUsers && user.followedLiveUsers.edges) || [];
    return edges
      .map((e) => e && e.node)
      .filter((n) => n && n.stream)
      .map((n) => ({
        platform: 'twitch',
        id: n.login,
        name: n.displayName || n.login,
        avatar: n.profileImageURL || '',
        viewers: n.stream.viewersCount || 0,
        showViewers: true,
        game: (n.stream.game && (n.stream.game.displayName || n.stream.game.name)) || '',
        title: n.stream.title || '',
        url: 'https://www.twitch.tv/' + n.login,
      }));
  }

  async function fetchKick(token) {
    if (!token) throw new TklError('not_logged_in');
    const out = [];
    let cursor = 0;
    for (let page = 0; page < 15; page++) {
      const res = await fetch('https://kick.com/api/v2/channels/followed?cursor=' + cursor, {
        credentials: 'include',
        headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
      });
      if (res.status === 401) throw new TklError('not_logged_in');
      if (!res.ok) throw new TklError('http_' + res.status);
      const json = await res.json();
      const channels = (json && json.channels) || [];
      for (const c of channels) {
        if (!c.is_live) continue;
        out.push({
          platform: 'kick',
          id: c.channel_slug,
          name: c.user_username || c.channel_slug,
          avatar: c.profile_picture || '',
          viewers: c.viewer_count || 0,
          showViewers: c.show_view_count !== false,
          game: c.category_name || '',
          title: c.session_title || '',
          url: 'https://kick.com/' + c.channel_slug,
        });
      }
      const last = channels[channels.length - 1];
      if (!channels.length || !last.is_live || json.nextCursor == null || json.nextCursor === cursor) break;
      cursor = json.nextCursor;
    }
    return out;
  }

  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const normTitle = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

  function parseAliases(text) {
    const set = new Set();
    for (const line of String(text || '').split(/[\n,;]+/)) {
      const m = line.split('=');
      if (m.length === 2 && norm(m[0]) && norm(m[1])) set.add(norm(m[0]) + '|' + norm(m[1]));
    }
    return set;
  }

  function sameStreamer(a, b, aliases) {
    if (norm(a.id) === norm(b.id) || norm(a.name) === norm(b.name)) return true;
    const t = a.platform === 'twitch' ? a : b;
    const k = a.platform === 'twitch' ? b : a;
    if (aliases && aliases.has(norm(t.id) + '|' + norm(k.id))) return true;
    const ta = normTitle(a.title);
    return ta.length >= 12 && ta === normTitle(b.title);
  }

  g.TKL = { fetchTwitch, fetchKick, norm, parseAliases, sameStreamer, TklError };
})();
