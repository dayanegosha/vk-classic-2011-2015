const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const base = path.join(__dirname, '..', 'vk-classic');
const read = name => fs.readFileSync(path.join(base, name), 'utf8');
const shell = `<div id="page_wrap"><div id="page_header_wrap"><ul id="page_header"><li class="TopNavigation__logo--test"><a class="Logo__root--test" href="/feed"><svg></svg></a></li></ul></div><div id="page_layout"><aside id="layout_sidebar"><a id="l_pr" class="LeftMenu__itemLink" href="/id123"><span class="LeftMenu__itemLabel">Профиль</span></a><a id="friends" class="LeftMenu__itemLink" href="/friends"><span class="LeftMenu__icon">icon</span><span class="LeftMenu__itemLabel">Друзья</span><span class="LeftMenu__counter">42</span></a><a id="messages" class="LeftMenu__itemLink" href="/im"><span class="LeftMenu__itemLabel">Мессенджер</span><span class="LeftMenu__counter">3</span></a><a id="extra" class="LeftMenu__itemLink" href="/services"><span class="LeftMenu__itemLabel">Сервисы</span></a></aside><div id="page_body"><div class="ProfileHeader"><div class="OwnerPageCover"></div><div class="ProfileHeader__in"><div class="ProfileHeader__ava"><div class="OwnerPageAvatar"></div></div><div class="ProfileHeader__main"><div class="ProfileHeader__info">Info</div><div class="ProfileHeaderActions"><button id="native-action">Написать</button></div></div></div></div></div></div></div>`;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function harness(html = shell, initial = {}, options = {}) {
  const dom = new JSDOM(html, { url: options.url || 'https://vk.ru/id123', runScripts: 'outside-only', pretendToBeVisual: true });
  const listeners = new Set(), messages = new Set();
  let stored = initial, resolveGet;
  dom.window.chrome = {
    storage: {
      onChanged: { addListener: listener => listeners.add(listener), removeListener: listener => listeners.delete(listener) },
      local: {
        get: async () => options.delayRead ? new Promise(resolve => { resolveGet = resolve; }) : { vkClassicSettings: stored },
        set: async value => { const old = stored; stored = value.vkClassicSettings; for (const listener of [...listeners]) listener({ vkClassicSettings: { newValue: stored, oldValue: old } }, 'local'); }
      }
    },
    runtime: { onMessage: { addListener: listener => messages.add(listener) } },
    tabs: { query: async () => [{ id: 1 }], sendMessage: async () => ({ active: true }) }
  };
  const set = value => dom.window.chrome.storage.local.set({ vkClassicSettings: value });
  dom.window.eval(read('settings.js'));
  if (!options.popup) dom.window.eval(read('content.js'));
  return { dom, window: dom.window, document: dom.window.document, set, messages, finishRead: value => resolveGet(value), stored: () => stored, close: () => dom.window.close() };
}

test('Manifest V3 uses only local settings and exact desktop VK hosts; all shipped files exist', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.background, undefined);
  assert.deepEqual(manifest.content_scripts[0].matches, ['https://vk.com/*', 'https://www.vk.com/*', 'https://vk.ru/*', 'https://www.vk.ru/*']);
  const files = [...manifest.content_scripts[0].js, ...manifest.content_scripts[0].css, manifest.action.default_popup, ...Object.values(manifest.icons)];
  for (const file of files) assert.ok(fs.existsSync(path.join(base, file)), file);
  for (const script of ['content.js', 'popup.js', 'settings.js']) assert.doesNotMatch(read(script), /\b(fetch|XMLHttpRequest|WebSocket)\s*\(/);
});

test('Invalid saved settings cannot inject arbitrary CSS or change defaults', () => {
  const h = harness('', {}, { popup: true });
  try {
    const settings = h.window.VKClassicSettings.normalize({ enabled: 'false', width: '800px;display:none', fontSize: 900, classicMenu: false, extra: true });
    assert.equal(settings.width, 800); assert.equal(settings.fontSize, 11); assert.equal(settings.enabled, true); assert.equal(settings.classicMenu, false); assert.equal(settings.extra, undefined);
  } finally { h.close(); }
});

test('Classic menu preserves original text, counters, native actions and links', async () => {
  const h = harness();
  try {
    let clicks = 0;
    h.document.querySelector('#native-action').addEventListener('click', () => clicks++);
    await wait(20);
    assert.equal(h.document.documentElement.dataset.vkClassicEnabled, 'true');
    assert.equal(h.document.querySelector('#friends .LeftMenu__itemLabel').dataset.vkClassicLabel, 'Мои друзья');
    assert.equal(h.document.querySelector('#messages .LeftMenu__itemLabel').dataset.vkClassicLabel, 'Мои сообщения');
    assert.equal(h.document.querySelector('#l_pr .LeftMenu__itemLabel').dataset.vkClassicLabel, 'Моя страница');
    assert.equal(h.document.querySelector('#friends').getAttribute('href'), '/friends');
    assert.equal(h.document.querySelector('#friends .LeftMenu__itemLabel').textContent, 'Друзья');
    assert.equal(h.document.querySelector('#friends .LeftMenu__counter').textContent, '42');
    assert.equal(h.document.querySelector('#friends').getAttribute('aria-label'), 'Мои друзья (42)');
    assert.equal(h.document.querySelector('#extra .LeftMenu__itemLabel').hasAttribute('data-vk-classic-label'), false);
    h.document.querySelector('#native-action').click(); assert.equal(clicks, 1);
  } finally { h.close(); }
});

test('Turning the extension off removes every scope and keeps site-owned DOM intact', async () => {
  const h = harness();
  try {
    await wait(20); await h.set({ enabled: false });
    assert.equal(h.document.querySelectorAll('[data-vk-classic-label]').length, 0);
    assert.equal([...h.document.documentElement.attributes].some(a => a.name.startsWith('data-vk-classic-')), false);
    assert.equal(h.document.documentElement.style.getPropertyValue('--vkc-width'), '');
    assert.equal(h.document.querySelector('#messages .LeftMenu__itemLabel').textContent, 'Мессенджер');
    assert.equal(h.document.querySelector('#friends').hasAttribute('aria-label'), false);
    assert.ok(h.document.querySelector('#native-action'));
    await h.set({ enabled: true, fontSize: 14, width: 800 });
    assert.equal(h.document.documentElement.style.getPropertyValue('--vkc-width'), '800px');
    assert.equal(h.document.documentElement.style.getPropertyValue('--vkc-font-size'), '14px');
  } finally { h.close(); }
});

test('SPA startup and newly inserted navigation items are detected after hydration', async () => {
  const h = harness('<div id="spa_root"></div>');
  try {
    await wait(20); assert.equal(h.document.documentElement.hasAttribute('data-vk-classic-enabled'), false);
    h.document.querySelector('#spa_root').innerHTML = shell;
    await wait(150);
    assert.equal(h.document.documentElement.dataset.vkClassicEnabled, 'true');
    const nav = h.document.querySelector('#layout_sidebar');
    nav.insertAdjacentHTML('beforeend', '<a class="LeftMenu__itemLink" href="/albums123"><span class="LeftMenu__itemLabel">Фото</span></a>');
    await wait(150);
    assert.equal(nav.lastElementChild.querySelector('span').dataset.vkClassicLabel, 'Мои фотографии');
  } finally { h.close(); }
});

test('Reused SPA links and external destinations never retain stale menu labels', async () => {
  const h = harness();
  try {
    await wait(20); const link = h.document.querySelector('#friends');
    link.setAttribute('href', '/music'); await wait(150);
    assert.equal(link.querySelector('.LeftMenu__itemLabel').dataset.vkClassicLabel, 'Мои аудиозаписи');
    link.setAttribute('href', 'https://example.com/friends'); await wait(150);
    assert.equal(link.querySelector('.LeftMenu__itemLabel').hasAttribute('data-vk-classic-label'), false);
  } finally { h.close(); }
});

test('Each visual preference can be switched independently and menu text restored', async () => {
  const h = harness();
  try {
    await wait(20);
    await h.set({ classicMenu: false, classicProfile: false, hideStories: false, hideFeedSidebar: false, squareAvatars: false });
    assert.equal(h.document.querySelectorAll('[data-vk-classic-label]').length, 0);
    for (const attr of ['menu', 'profile', 'stories', 'sidebar', 'square']) assert.equal(h.document.documentElement.getAttribute(`data-vk-classic-${attr}`), 'false');
    assert.equal(h.document.documentElement.dataset.vkClassicEnabled, 'true');
  } finally { h.close(); }
});

test('Mobile and authentication pages are left unstyled', async () => {
  for (const [html, url] of [[shell + '<main id="mcont"></main>', 'https://vk.ru/feed'], [shell, 'https://vk.ru/login'], [shell, 'https://vk.com/restore']]) {
    const h = harness(html, {}, { url });
    try { await wait(20); assert.equal(h.document.documentElement.hasAttribute('data-vk-classic-enabled'), false); }
    finally { h.close(); }
  }
});

test('Settings changed during initial storage read take precedence over stale data', async () => {
  const h = harness(shell, {}, { delayRead: true });
  try {
    await h.set({ enabled: false });
    h.finishRead({ vkClassicSettings: { enabled: true } });
    await wait(20);
    assert.equal(h.document.documentElement.hasAttribute('data-vk-classic-enabled'), false);
  } finally { h.close(); }
});

test('Popup loads saved preferences, saves changes, and resets every preference', async () => {
  const h = harness(read('popup.html'), { fontSize: 14, width: 1040 }, { popup: true });
  try {
    h.window.eval(read('popup.js')); await wait(30);
    assert.equal(h.document.querySelector('#width').value, '1040');
    assert.equal(h.document.querySelector('#fontSize').value, '14');
    const toggle = h.document.querySelector('#enabled'); toggle.checked = false; toggle.dispatchEvent(new h.window.Event('change'));
    await wait(30); assert.equal(h.stored().enabled, false); assert.equal(h.document.querySelector('#appearance').disabled, true);
    h.document.querySelector('#reset').click(); await wait(30);
    assert.equal(h.stored().enabled, true); assert.equal(h.stored().width, 800); assert.equal(h.stored().fontSize, 11); assert.equal(h.document.querySelector('#appearance').disabled, false);
  } finally { h.close(); }
});

test('Styles parse and target current SPA shell, logo, profile, and legacy controls', async () => {
  const h = harness();
  try {
    await wait(20);
    const style = h.document.createElement('style'); style.textContent = read('classic.css'); h.document.head.append(style);
    assert.ok(style.sheet.cssRules.length > 45);
    let selectorCount = 0;
    function validate(rules) {
      for (const rule of rules) {
        if (rule.selectorText) { h.document.querySelectorAll(rule.selectorText); selectorCount++; }
        if (rule.cssRules) validate(rule.cssRules);
      }
    }
    validate(style.sheet.cssRules); assert.ok(selectorCount > 45);
    assert.equal(h.window.getComputedStyle(h.document.querySelector('#page_header_wrap')).height, 'var(--vkc-header)');
    assert.equal(h.window.getComputedStyle(h.document.querySelector('.OwnerPageCover')).display, 'none');
    assert.equal(h.window.getComputedStyle(h.document.querySelector('.ProfileHeader__in')).display, 'grid');
    assert.equal(h.window.getComputedStyle(h.document.querySelector('#friends .LeftMenu__itemLabel')).fontSize, '0px');
    await h.set({ enabled: false });
    assert.notEqual(h.window.getComputedStyle(h.document.querySelector('.OwnerPageCover')).display, 'none');
    assert.notEqual(h.window.getComputedStyle(h.document.querySelector('.ProfileHeader__in')).display, 'grid');
  } finally { h.close(); }
});

test('Hydrated VKCOM Kit menu and OwnerHeader are transformed, including a dark inner header', async () => {
  const html = fs.readFileSync(path.join(__dirname, 'current-runtime.html'), 'utf8');
  const h = harness(html);
  try {
    await wait(25);
    const style = h.document.createElement('style'); style.textContent = read('classic.css'); h.document.head.append(style);
    const label = h.document.querySelector('#l_pr [data-testid="leftmenuitem-text"]');
    assert.equal(label.dataset.vkClassicLabel, 'Моя страница');
    const friends = h.document.querySelector('[data-testid="leftmenuitem"] a[href$="friends"]');
    assert.equal(friends.getAttribute('aria-label'), 'Мои друзья (8)');
    assert.equal(h.document.querySelectorAll('[data-vk-classic-menu-icon]').length, 10);
    const cover = h.document.querySelector('[data-testid="communityheader_cover"]');
    assert.equal(h.window.getComputedStyle(cover).display, 'none');
    assert.equal(h.window.getComputedStyle(h.document.querySelector('[data-vk-classic-profile-row]')).display, 'grid');
    assert.equal(h.window.getComputedStyle(h.document.querySelector('[data-vk-classic-profile-columns]')).display, 'grid');
    assert.equal(h.window.getComputedStyle(h.document.querySelector('[data-vk-classic-narrow-slot]')).gridColumn, '1');
    assert.equal(h.window.getComputedStyle(h.document.querySelector('.vkitInternalRichAvatar')).borderRadius, '0px');
    assert.equal(h.window.getComputedStyle(h.document.querySelector('#page_header')).backgroundColor, 'rgb(78, 114, 154)');
    assert.equal(h.window.getComputedStyle(h.document.querySelector('[data-testid="profile-owner-name"]')).fontSize, '13px');
    const nativeAction = h.document.querySelector('#demo-action'); let clicks = 0;
    nativeAction.addEventListener('click', () => clicks++); nativeAction.click(); assert.equal(clicks, 1);
    const retained = h.document.querySelector('[data-testid="profile-avatar"]');
    await h.set({ enabled: false });
    assert.equal(h.document.querySelectorAll('[data-vk-classic-menu-link], [data-vk-classic-profile-row], [data-vk-classic-profile-decoration], [data-vk-classic-label]').length, 0);
    assert.equal(retained, h.document.querySelector('[data-testid="profile-avatar"]'));
    assert.notEqual(h.window.getComputedStyle(cover).display, 'none');
    nativeAction.click(); assert.equal(clicks, 2);
  } finally { h.close(); }
});

test('OwnerHeader adapts through internal wrappers and survives hydrated replacement', async () => {
  const h = harness(fs.readFileSync(path.join(__dirname, 'current-runtime.html'), 'utf8'));
  try {
    await wait(25);
    const header = h.document.querySelector('[data-testid="profile-header"]');
    const row = h.document.querySelector('[data-vk-classic-profile-row]');
    const wrapper = h.document.createElement('div'); header.replaceChild(wrapper, row); wrapper.append(row);
    await wait(150);
    assert.equal(wrapper.hasAttribute('data-vk-classic-profile-decoration'), false);
    assert.equal(row.getAttribute('data-vk-classic-profile-row'), 'true');
    const newRow = row.cloneNode(true); row.replaceWith(newRow);
    await wait(150);
    assert.equal(newRow.getAttribute('data-vk-classic-profile-row'), 'true');
    await h.set({ enabled: false });
    assert.equal(newRow.hasAttribute('data-vk-classic-profile-row'), false);
  } finally { h.close(); }
});
