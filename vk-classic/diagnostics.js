/* Local, user-initiated layout report. Never serializes text or arbitrary attributes. */
globalThis.VKClassicDiagnostics = (() => {
  const limit = 1800;
  const staticIds = new Set(['page_wrap', 'layout_wrapper_root', 'spa_root', 'page_header_cont', 'page_header_wrap', 'page_header', 'page_layout', 'page_body', 'layout_sidebar', 'spa_layout_content', 'legacy_content', 'profile_redesigned', 'side_bar', 'feed_rows', 'feed_wall', 'feed_filters', 'feed_right_column', 'stories_feed_wrap']);
  const ignored = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'OBJECT', 'EMBED', 'TEMPLATE']);
  const properties = ['display', 'position', 'width', 'min-width', 'max-width', 'height', 'min-height', 'inline-size', 'min-inline-size', 'max-inline-size', 'flex', 'flex-direction', 'flex-wrap', 'grid-template-columns', 'grid-column', 'grid-row', 'gap', 'padding', 'margin', 'overflow', 'color', 'background-color', 'border-radius', 'font-family', 'font-size', 'line-height', 'opacity'];
  function round(number) { return Math.round(number * 10) / 10; }
  function styles(element) {
    const computed = getComputedStyle(element);
    const result = {};
    for (const name of properties) {
      const value = computed.getPropertyValue(name);
      // Never copy a URL or an arbitrary generated string into the report.
      if (value && !/url\s*\(|[<>]|https?:/i.test(value)) result[name] = value.slice(0, 180);
    }
    const rect = element.getBoundingClientRect();
    return { css: result, box: { x: round(rect.x), y: round(rect.y), width: round(rect.width), height: round(rect.height) } };
  }
  function safeClasses(element) {
    return [...element.classList].filter(value =>
      /^vkit-[A-Za-z0-9_-]{3,45}$/.test(value) || /^vkitInternal[A-Za-z]+$/.test(value) ||
      /^vkui[A-Za-z][A-Za-z0-9_-]{0,100}$/.test(value) || /^vkui--[A-Za-z-]+$/.test(value) ||
      /^[A-Za-z][A-Za-z]+__[A-Za-z]+(?:--[A-Za-z0-9_-]+)?$/.test(value) ||
      /^(?:Profile|ProfileBase|Profile__column|page_block|post|post_header|post_content|wide_column|narrow_column|feed_row|feed_posts|feed_content|stories_feed_wrap|im-page|im-page--[a-z-]+)$/.test(value)
    ).slice(0, 16);
  }
  function safeTestId(element) {
    const value = element.getAttribute('data-testid');
    // Only known technical component prefixes; dynamic numeric suffixes are removed.
    if (!value || !/^(?:profile|leftmenu|owner_content|post|feed|stor|rightmenu|richavatar|communityheader|image|grid|im-|messenger|convo|dialog)[a-z0-9_-]*$/i.test(value)) return undefined;
    return value.replace(/\d+/g, 'N').slice(0, 100);
  }
  function capture(context) {
    if (!context.shellFound) throw new Error('Desktop VK shell not found');
    const elements = [];
    function tree(element) {
      if (elements.length >= limit || ignored.has(element.tagName)) return undefined;
      const index = elements.length;
      elements.push(element);
      const node = { index, tag: element.tagName.toLowerCase(), classes: safeClasses(element) };
      if (staticIds.has(element.id)) node.id = element.id;
      const testId = safeTestId(element); if (testId) node.testId = testId;
      const roles = [...element.attributes].map(a => a.name).filter(name => /^data-vk-classic-[a-z-]+$/.test(name) && name !== 'data-vk-classic-label');
      if (roles.length) node.roles = roles;
      // Include SVG/image/control layout only. Their content, values and URLs are excluded.
      if (element.tagName === 'IFRAME') node.isolated = true;
      if (element.shadowRoot) node.shadow = true;
      if (!['SVG', 'IMG', 'VIDEO', 'AUDIO', 'CANVAS', 'INPUT', 'TEXTAREA', 'IFRAME'].includes(element.tagName)) {
        node.children = [...element.children].map(tree).filter(Boolean);
        if (element.shadowRoot) node.shadowChildren = [...element.shadowRoot.children].map(tree).filter(Boolean);
      }
      return node;
    }
    const structure = tree(document.querySelector('#page_wrap') || document.querySelector('#page_layout'));
    const current = elements.map(styles);
    const root = document.documentElement;
    const saved = [...root.attributes].filter(a => a.name.startsWith('data-vk-classic-')).map(a => [a.name, a.value]);
    let native;
    try {
      for (const [name] of saved) root.removeAttribute(name);
      native = elements.map(styles);
    } finally {
      for (const [name, value] of saved) root.setAttribute(name, value);
    }
    return {
      schema: 'vk-classic-layout/1', version: chrome.runtime.getManifest?.().version || '1.2.0',
      page: context.page, active: context.active, settings: context.settings,
      viewport: { width: innerWidth, height: innerHeight },
      truncated: elements.length >= limit, structure, current, native
    };
  }
  return Object.freeze({ capture });
})();
