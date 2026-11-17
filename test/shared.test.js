const test = require('node:test');
const assert = require('node:assert/strict');

require('../shared.js');
const TKL = globalThis.TKL;

const tw = (id, extra = {}) => ({ platform: 'twitch', id, name: id, viewers: 100, title: '', ...extra });
const kk = (id, extra = {}) => ({ platform: 'kick', id, name: id, viewers: 100, title: '', ...extra });

function mockFetch(responses) {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts });
    const r = responses.shift();
    return { status: r.status || 200, ok: (r.status || 200) < 400, json: async () => r.body };
  };
  return calls;
}

test('parseCount reads plain and abbreviated counts', () => {
  assert.equal(TKL.parseCount('874'), 874);
  assert.equal(TKL.parseCount('2,1K'), 2100);
  assert.equal(TKL.parseCount('10.8K'), 10800);
  assert.equal(TKL.parseCount('44,9K kijkers'), 44900);
  assert.equal(TKL.parseCount('1.2M'), 1200000);
  assert.equal(TKL.parseCount('1.234'), 1234);
  assert.equal(TKL.parseCount('2K'), 2000);
  assert.equal(TKL.parseCount('LIVE'), null);
  assert.equal(TKL.parseCount(''), null);
});

test('norm ignores case and separators', () => {
  assert.equal(TKL.norm('Sick_Nerd'), 'sicknerd');
  assert.equal(TKL.norm('sick-nerd'), 'sicknerd');
  assert.equal(TKL.norm(null), '');
});

test('parseAliases accepts lines, commas and spaces', () => {
  const a = TKL.parseAliases('zackrawrr=asmongold\n Foo_Bar = foo-bar , x=y\nbroken\n=z');
  assert.deepEqual([...a].sort(), ['foobar|foobar', 'x|y', 'zackrawrr|asmongold']);
  assert.equal(TKL.parseAliases(undefined).size, 0);
});

test('sameStreamer matches on name', () => {
  assert.ok(TKL.sameStreamer(kk('sick_nerd'), tw('Sick-Nerd')));
  assert.ok(TKL.sameStreamer(kk('slug1', { name: 'B0aty' }), tw('b0aty')));
  assert.ok(!TKL.sameStreamer(kk('jay'), tw('lirik')));
});

test('sameStreamer matches on alias in either argument order', () => {
  const a = TKL.parseAliases('zackrawrr=asmongold');
  assert.ok(TKL.sameStreamer(kk('asmongold'), tw('zackrawrr'), a));
  assert.ok(TKL.sameStreamer(tw('zackrawrr'), kk('asmongold'), a));
  assert.ok(!TKL.sameStreamer(tw('asmongold2'), kk('zackrawrr'), a));
});

test('sameStreamer matches identical long titles only', () => {
  const title = 'HARDCORE WORLDS day 14  !today';
  assert.ok(TKL.sameStreamer(kk('a', { title }), tw('b', { title: title.toLowerCase().replace('  ', ' ') })));
  assert.ok(!TKL.sameStreamer(kk('a', { title: 'live' }), tw('b', { title: 'live' })));
  assert.ok(!TKL.sameStreamer(kk('a', { title }), tw('b', { title: title + '!' })));
});

test('plan drops the other site entry for multistreamers by default', () => {
  const own = [tw('b0aty'), tw('lirik')];
  const other = [kk('b0aty'), kk('odablock')];
  const p = TKL.plan(own, other, new Set(), false);
  assert.deepEqual(p.others.map((s) => s.id), ['odablock']);
  assert.equal(p.hiddenOwn.size, 0);
});

test('plan keeps the other site entry and hides the native one when the other site is main', () => {
  const own = [tw('b0aty'), tw('zackrawrr'), tw('lirik')];
  const other = [kk('b0aty'), kk('asmongold'), kk('odablock')];
  const p = TKL.plan(own, other, TKL.parseAliases('zackrawrr=asmongold'), true);
  assert.deepEqual(p.others.map((s) => s.id), ['b0aty', 'asmongold', 'odablock']);
  assert.deepEqual([...p.hiddenOwn].sort(), ['b0aty', 'zackrawrr']);
});

test('fetchTwitch maps live channels and sends the session token', async () => {
  const calls = mockFetch([
    {
      body: {
        data: {
          currentUser: {
            followedLiveUsers: {
              edges: [
                { node: { login: 'lirik', displayName: 'LIRIK', profileImageURL: 'img', stream: { viewersCount: 13914, title: 't', game: { displayName: 'ROB RUN' } } } },
                { node: { login: 'offline', displayName: 'Offline', stream: null } },
              ],
            },
          },
        },
      },
    },
  ]);
  const list = await TKL.fetchTwitch('tok');
  assert.equal(calls[0].opts.headers.Authorization, 'OAuth tok');
  assert.deepEqual(list, [
    { platform: 'twitch', id: 'lirik', name: 'LIRIK', avatar: 'img', viewers: 13914, showViewers: true, game: 'ROB RUN', title: 't', url: 'https://www.twitch.tv/lirik' },
  ]);
});

test('fetchTwitch reports a missing or rejected login', async () => {
  await assert.rejects(TKL.fetchTwitch(null), { code: 'not_logged_in' });
  mockFetch([{ status: 401, body: {} }]);
  await assert.rejects(TKL.fetchTwitch('tok'), { code: 'not_logged_in' });
  mockFetch([{ body: { data: { currentUser: null } } }]);
  await assert.rejects(TKL.fetchTwitch('tok'), { code: 'not_logged_in' });
  mockFetch([{ body: { errors: [{ message: 'PersistedQueryNotFound' }] } }]);
  await assert.rejects(TKL.fetchTwitch('tok'), { code: 'api_error' });
  mockFetch([{ status: 500, body: {} }]);
  await assert.rejects(TKL.fetchTwitch('tok'), { code: 'http_500' });
});

test('fetchKick pages until the first offline channel', async () => {
  const ch = (slug, live, extra = {}) => ({ channel_slug: slug, user_username: slug.toUpperCase(), is_live: live, viewer_count: 10, show_view_count: true, category_name: 'c', session_title: 's', profile_picture: null, ...extra });
  const calls = mockFetch([
    { body: { nextCursor: 2, channels: [ch('a', true), ch('b', true, { show_view_count: false })] } },
    { body: { nextCursor: 4, channels: [ch('c', true), ch('d', false)] } },
    { body: { nextCursor: null, channels: [ch('never', true)] } },
  ]);
  const list = await TKL.fetchKick('tok');
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /cursor=0$/);
  assert.match(calls[1].url, /cursor=2$/);
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer tok');
  assert.deepEqual(list.map((s) => s.id), ['a', 'b', 'c']);
  assert.equal(list[1].showViewers, false);
  assert.deepEqual(list[0], { platform: 'kick', id: 'a', name: 'A', avatar: '', viewers: 10, showViewers: true, game: 'c', title: 's', url: 'https://kick.com/a' });
});

test('fetchKick stops on an empty list or the last page', async () => {
  let calls = mockFetch([{ body: { nextCursor: null, channels: [] } }]);
  assert.deepEqual(await TKL.fetchKick('tok'), []);
  assert.equal(calls.length, 1);
  calls = mockFetch([{ body: { nextCursor: null, channels: [{ channel_slug: 'a', is_live: true }] } }]);
  assert.equal((await TKL.fetchKick('tok')).length, 1);
  assert.equal(calls.length, 1);
});

test('fetchKick reports a missing or rejected login', async () => {
  await assert.rejects(TKL.fetchKick(null), { code: 'not_logged_in' });
  mockFetch([{ status: 401, body: {} }]);
  await assert.rejects(TKL.fetchKick('tok'), { code: 'not_logged_in' });
  mockFetch([{ status: 403, body: {} }]);
  await assert.rejects(TKL.fetchKick('tok'), { code: 'http_403' });
});
