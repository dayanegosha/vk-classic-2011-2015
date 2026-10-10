(() => {
  "use strict";
  if (globalThis.__vkClassicLoaded) return;
  globalThis.__vkClassicLoaded = true;

  const { key, normalize } = VKClassicSettings;
  const root = document.documentElement;
  const menuSelector = '[data-testid="leftmenuitem"] a[href], .LeftMenu__itemLink, #side_bar .left_row, #side_bar a, #layout_sidebar .LeftMenu__itemLink';
  const labelSelector = '[data-testid="leftmenuitem-text"], .LeftMenu__itemLabel, .left_label';
  const attributes = ["enabled", "square", "menu", "stories", "sidebar", "profile", "page"];
  const labelled = new Set();
  const accessibleLabels = new Map();
  const adapted = new Map();
  let marked;
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
    if (/^\/im\//.test(path)) return "Мои сообщения";
    if (/^\/(?:albums|photos)(?:-?\d+)?$/.test(path) || path === "/photo") return "Мои фотографии";
    if (/^\/audios(?:-?\d+)?$/.test(path) || path === "/audio" || path === "/music") return "Мои аудиозаписи";
    if (/^\/videos(?:-?\d+)?$/.test(path) || path === "/video" || path === "/video_for_you") return "Мои видеозаписи";
    const menuId = (link.closest('[data-testid="leftmenuitem"]') || link).id;
    const byId = { l_pr: "Моя страница", l_ph: "Мои фотографии", l_vid: "Мои видеозаписи", l_aud: "Мои аудиозаписи", l_msg: "Мои сообщения" };
    if (byId[menuId]) return byId[menuId];
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
    if (!marked.has(element)) marked.set(element, new Set());
    marked.get(element).add(name);
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
  function pruneAdapters() {
    for (const [element, values] of adapted) {
      if (!element.isConnected) { adapted.delete(element); continue; }
      for (const [name, original] of values) if (!marked.get(element)?.has(name)) {
        if (element.getAttribute(name) === "true") {
          if (original === null) element.removeAttribute(name);
          else element.setAttribute(name, original);
        }
        values.delete(name);
      }
      if (!values.size) adapted.delete(element);
    }
  }
  function pageKind() {
    if (/^\/(?:im|messenger)(?:\/|$)/.test(location.pathname)) return "messages";
    if (/^\/feed(?:\/|$)/.test(location.pathname)) return "feed";
    return document.querySelector('#profile_redesigned, [data-testid="profile-header"], .ProfileHeader') ? "profile" : "other";
  }
  function columns(main, aside, boundary) {
    if (!main || !aside || main.contains(aside) || aside.contains(main)) return null;
    let row = main.parentElement;
    while (row && row !== boundary && !row.contains(aside)) row = row.parentElement;
    if (!row || !row.contains(aside)) return null;
    const branch = element => {
      while (element.parentElement !== row) element = element.parentElement;
      return element;
    };
    return { row, main: branch(main), aside: branch(aside) };
  }
  function enhanceComponents() {
    marked = new Map();
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
    const profileColumns = columns(wall, narrow, document.querySelector('#profile_redesigned'));
    if (profileColumns) {
      mark(profileColumns.row, "profile-columns");
      mark(profileColumns.main, "wall-slot");
      mark(profileColumns.aside, "narrow-slot");
      for (let inner = narrow; inner !== profileColumns.aside; inner = inner.parentElement) mark(inner, "narrow-inner");
    }
    for (const cell of document.querySelectorAll('[data-testid^="profile-friends-list"]')) {
      const host = cell.closest('.vkuiHorizontalCell__host') || cell;
      mark(host, "friend-cell");
      mark(host.parentElement, "friends-grid");
    }
    for (const block of document.querySelectorAll('[class*="StoryBlock__noIslandsContainer--"], [class*="StoriesBlockFeedSkeleton__root--"]')) mark(block, "stories-block");
    if (pageKind() === "feed") {
      const body = document.querySelector('#page_body');
      const main = body?.querySelector('.wide_column, #feed_rows, #feed_wall, .feed_posts, .FeedPage__content, [data-testid="post"], .post');
      const aside = body?.querySelector('.narrow_column, #feed_right_column, .FeedRightColumn, [data-testid="feed-sidebar"], #feed_filters, [data-testid="rightmenu"]');
      const feedColumns = columns(main, aside, body);
      if (feedColumns) {
        mark(feedColumns.row, "feed-columns");
        mark(feedColumns.main, "feed-main");
        mark(feedColumns.aside, "feed-aside");
      }
    }
    pruneAdapters();
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
    root.dataset.vkClassicPage = pageKind();
    const needsColumns = pageKind() === "messages" || (pageKind() === "feed" && !settings.hideFeedSidebar);
    root.style.setProperty("--vkc-width", `${needsColumns ? Math.max(1040, settings.width) : settings.width}px`);
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
      reply({ active, shellFound, enabled: settings.enabled, version: chrome.runtime.getManifest?.().version || "1.2.0", page: pageKind(),
        storiesFound: document.querySelectorAll('[data-vk-classic-stories-block], #stories_feed_wrap, .stories_feed_wrap, .StoriesFeed, [data-testid="profile-narratives-block"]').length });
    } else if (message?.type === "VK_CLASSIC_DIAGNOSTIC") {
      apply();
      try { reply({ report: VKClassicDiagnostics.capture({ active, shellFound, settings, page: pageKind() }) }); }
      catch { reply({ error: "Не удалось сохранить структуру страницы. Обнови ВК и попробуй ещё раз." }); }
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
