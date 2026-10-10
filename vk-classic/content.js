(() => {
  "use strict";
  if (globalThis.__vkClassicLoaded) return;
  globalThis.__vkClassicLoaded = true;

  const { key, normalize } = VKClassicSettings;
  const root = document.documentElement;
  const menuSelector = '[data-testid="leftmenuitem"] a[href], .LeftMenu__itemLink, #side_bar .left_row, #side_bar a, #layout_sidebar .LeftMenu__itemLink';
  const labelSelector = '[data-testid="leftmenuitem-text"], .LeftMenu__itemLabel, .left_label';
  const attributes = ["enabled", "square", "menu", "stories", "sidebar", "profile"];
  const labelled = new Set();
  const accessibleLabels = new Map();
  const adapted = new Map();
  let settings = normalize();
  let observer;
  let timer;
  let active = false;
  let shellFound = false;

  // Match destinations, never names or private page data. Keep native links and counters.
  function classicLabel(link) {
    let url;
    try { url = new URL(link.getAttribute("href"), location.href); } catch { return null; }
    if (!["vk.com", "www.vk.com", "vk.ru", "www.vk.ru"].includes(url.hostname)) return null;
    const path = url.pathname.replace(/\/$/, "") || "/";
    const byPath = {
      "/friends": "Мои друзья", "/al_friends.php": "Мои друзья",
      "/im": "Мои сообщения", "/messenger": "Мои сообщения",
      "/groups": "Мои группы", "/communities": "Мои группы",
      "/feed": "Мои новости", "/settings": "Мои настройки",
      "/fave": "Мои закладки", "/docs": "Мои документы"
    };
    if (byPath[path]) return byPath[path];
    if (/^\/albums(?:-?\d+)?$/.test(path) || path === "/photos") return "Мои фотографии";
    if (/^\/audios(?:-?\d+)?$/.test(path) || path === "/audio" || path === "/music") return "Мои аудиозаписи";
    if (/^\/videos(?:-?\d+)?$/.test(path) || path === "/video") return "Мои видеозаписи";
    if (link.id === "l_pr" || link.closest("#l_pr") || link.getAttribute("data-testid") === "leftmenu-profile") return "Моя страница";
    const label = link.querySelector(labelSelector)?.textContent.trim();
    if (["Моя страница", "Мой профиль", "Профиль"].includes(label)) return "Моя страница";
    return null;
  }

  function restoreLabels() {
    for (const element of labelled) element.removeAttribute("data-vk-classic-label");
    labelled.clear();
    for (const link of accessibleLabels.keys()) restoreAccessibleLabel(link);
  }

  function restoreAccessibleLabel(link) {
    const saved = accessibleLabels.get(link);
    if (!saved) return;
    // Don't overwrite an accessible name changed by VK since the last update.
    if (link.getAttribute("aria-label") === saved.applied) {
      if (saved.original === null) link.removeAttribute("aria-label");
      else link.setAttribute("aria-label", saved.original);
    }
    accessibleLabels.delete(link);
  }

  function enhanceMenu() {
    for (const element of labelled) if (!element.isConnected) labelled.delete(element);
    for (const link of accessibleLabels.keys()) if (!link.isConnected) accessibleLabels.delete(link);
    if (!settings.classicMenu) { restoreLabels(); return; }
    for (const link of document.querySelectorAll(menuSelector)) {
      const label = link.querySelector(labelSelector);
      if (!label) continue;
      const replacement = classicLabel(link);
      if (replacement) {
        if (label.getAttribute("data-vk-classic-label") !== replacement) label.setAttribute("data-vk-classic-label", replacement);
        labelled.add(label);
        let saved = accessibleLabels.get(link);
        if (!saved || link.getAttribute("aria-label") !== saved.applied) saved = { original: link.getAttribute("aria-label") };
        const counter = (link.closest('[data-testid="leftmenuitem"]') || link).querySelector('[data-testid="leftmenuitem-counter"], .LeftMenu__counter, .LeftMenu__itemCounter, .left_count')?.textContent.trim();
        saved.applied = `${replacement}${counter ? ` (${counter})` : ""}`;
        accessibleLabels.set(link, saved);
        link.setAttribute("aria-label", saved.applied);
      } else if (label.hasAttribute("data-vk-classic-label")) {
        label.removeAttribute("data-vk-classic-label");
        labelled.delete(label);
        restoreAccessibleLabel(link);
      }
    }
  }

  // Annotate existing React nodes, without moving them or replacing native handlers.
  function mark(element, role) {
    if (!element) return;
    const name = `data-vk-classic-${role}`;
    let original = adapted.get(element);
    if (!original) { original = new Map(); adapted.set(element, original); }
    if (!original.has(name)) original.set(name, element.getAttribute(name) === "true" ? null : element.getAttribute(name));
    if (element.getAttribute(name) !== "true") element.setAttribute(name, "true");
  }
  function restoreAdapters() {
    for (const [element, values] of adapted) for (const [name, original] of values) {
      if (element.getAttribute(name) !== "true") continue;
      if (original === null) element.removeAttribute(name);
      else element.setAttribute(name, original);
    }
    adapted.clear();
  }
  function enhanceComponents() {
    for (const element of adapted.keys()) if (!element.isConnected) adapted.delete(element);
    for (const row of document.querySelectorAll('[data-testid="leftmenuitem"]')) {
      const text = row.querySelector('[data-testid="leftmenuitem-text"]');
      const link = text?.closest('a[href]');
      if (!link) continue;
      mark(link, "menu-link");
      // Icons can be nested in a Flex before the label, rather than next to the link.
      for (let node = text; node && node !== link; node = node.parentElement) {
        for (const sibling of node.parentElement.children) {
          if (sibling !== node && sibling.querySelector('svg') && !sibling.textContent.trim() && !sibling.querySelector('[data-testid="leftmenuitem-counter"]')) mark(sibling, "menu-icon");
        }
      }
    }
    for (const header of document.querySelectorAll('[data-testid="profile-header"]')) {
      const avatar = header.querySelector('[data-testid="profile-avatar"]');
      const info = header.querySelector('[data-testid="profile-info"]');
      if (!avatar || !info) continue;
      let shared = avatar.parentElement;
      while (shared && shared !== header && !shared.contains(info)) shared = shared.parentElement;
      if (shared && shared !== header) {
        mark(shared, "profile-row");
        for (let branch = shared; branch !== header; branch = branch.parentElement) {
          for (const sibling of branch.parentElement.children) if (sibling !== branch) mark(sibling, "profile-decoration");
        }
        let slot = avatar;
        while (slot.parentElement !== shared) slot = slot.parentElement;
        mark(slot, "avatar-slot");
        let main = info;
        while (main.parentElement !== shared) main = main.parentElement;
        mark(main, "profile-main");
        // The nested native info/actions Flex used by the current OwnerHeader.
        const action = main.querySelector('[data-testid="profile-edit-button"], [data-testid="profile-send-message-button"], [data-testid="profile-add-friend-button"]');
        if (action) {
          let actionsRow = info.parentElement;
          while (actionsRow && actionsRow !== main && !actionsRow.contains(action)) actionsRow = actionsRow.parentElement;
          if (actionsRow && actionsRow !== main) mark(actionsRow, "info-actions");
        }
      }
    }
    const wall = document.querySelector('#profile_redesigned .Profile__column');
    const narrow = document.querySelector('[data-testid="profile-narrow-column"], [data-testid="profile-narrow-column-empty"]');
    if (wall && narrow) {
      let row = wall.parentElement;
      while (row && row !== document.body && !row.contains(narrow)) row = row.parentElement;
      if (row && row !== document.body) {
        mark(row, "profile-columns");
        let branch = narrow;
        while (branch.parentElement !== row) branch = branch.parentElement;
        mark(branch, "narrow-slot");
      }
    }
  }

  function detectShell() {
    return Boolean(document.querySelector("#page_header, #page_header_wrap") && document.querySelector("#page_layout, #page_body"));
  }

  function apply() {
    shellFound = detectShell();
    // Skip sign-in and the mobile site, including a desktop-hosted mobile layout.
    active = settings.enabled && shellFound && !/^\/(login|join|restore)(?:[/?]|$)/.test(location.pathname) && !document.querySelector("#mcont");
    if (!active) {
      for (const attribute of attributes) root.removeAttribute(`data-vk-classic-${attribute}`);
      root.style.removeProperty("--vkc-width");
      root.style.removeProperty("--vkc-font-size");
      restoreLabels();
      restoreAdapters();
      return;
    }
    root.dataset.vkClassicEnabled = "true";
    root.dataset.vkClassicSquare = String(settings.squareAvatars);
    root.dataset.vkClassicMenu = String(settings.classicMenu);
    root.dataset.vkClassicStories = String(settings.hideStories);
    root.dataset.vkClassicSidebar = String(settings.hideFeedSidebar);
    root.dataset.vkClassicProfile = String(settings.classicProfile);
    root.style.setProperty("--vkc-width", `${settings.width}px`);
    root.style.setProperty("--vkc-font-size", `${settings.fontSize}px`);
    enhanceMenu();
    enhanceComponents();
  }

  function schedule() {
    if (timer !== undefined) return;
    timer = setTimeout(() => { timer = undefined; apply(); }, 100);
  }

  function observe() {
    observer?.disconnect();
    clearTimeout(timer);
    timer = undefined;
    if (settings.enabled) {
      observer = new MutationObserver(schedule);
      observer.observe(root, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["href"] });
    }
    apply();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[key]) {
      settings = normalize(changes[key].newValue);
      observe();
    }
  });
  chrome.runtime.onMessage.addListener((message, _sender, reply) => {
    if (message?.type === "VK_CLASSIC_STATUS") {
      apply();
      reply({ active, shellFound, enabled: settings.enabled });
    }
  });
  // Bind listeners before the asynchronous read so updates during startup aren't missed.
  let updatedDuringRead = false;
  const trackStartup = (changes, area) => { if (area === "local" && changes[key]) updatedDuringRead = true; };
  chrome.storage.onChanged.addListener(trackStartup);
  chrome.storage.local.get(key).then(result => {
    if (!updatedDuringRead) settings = normalize(result[key]);
    chrome.storage.onChanged.removeListener(trackStartup);
    observe();
  }).catch(() => {
    chrome.storage.onChanged.removeListener(trackStartup);
    observe();
  });
  document.addEventListener("DOMContentLoaded", schedule, { once: true });
  window.addEventListener("popstate", schedule);
  window.addEventListener("hashchange", schedule);
})();
