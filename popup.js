const LOGIN = { twitch: 'https://www.twitch.tv/login', kick: 'https://kick.com/' };

function show(site, res) {
  const dot = document.getElementById(site + '-dot');
  const info = document.getElementById(site + '-info');
  info.textContent = '';
  if (res && res.ok) {
    dot.classList.add('ok');
    info.textContent = `connected · ${res.data.length} live`;
    return;
  }
  dot.classList.add('bad');
  if (res && res.error === 'not_logged_in') {
    info.append('not logged in — ');
    const a = document.createElement('a');
    a.href = LOGIN[site];
    a.target = '_blank';
    a.textContent = 'log in';
    info.append(a);
  } else {
    info.textContent = 'error: ' + ((res && (res.message || res.error)) || 'no response');
  }
}

chrome.runtime.sendMessage({ type: 'status' }).then(
  (s) => {
    show('twitch', s && s.twitch);
    show('kick', s && s.kick);
  },
  () => {
    show('twitch', null);
    show('kick', null);
  }
);

const box = document.getElementById('aliases');
const main = document.getElementById('mainSite');
chrome.storage.sync.get({ aliases: '', mainSite: 'current' }).then((r) => {
  box.value = r.aliases;
  main.value = r.mainSite;
});
main.addEventListener('change', () => chrome.storage.sync.set({ mainSite: main.value }));
document.getElementById('save').addEventListener('click', async () => {
  await chrome.storage.sync.set({ aliases: box.value });
  document.getElementById('saved').textContent = 'saved';
  setTimeout(() => (document.getElementById('saved').textContent = ''), 1500);
});
