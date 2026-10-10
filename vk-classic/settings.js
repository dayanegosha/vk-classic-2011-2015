/* Shared by the isolated content script and the extension popup. */
globalThis.VKClassicSettings = (() => {
  const key = "vkClassicSettings";
  const defaults = Object.freeze({
    enabled: true,
    width: 800,
    fontSize: 11,
    squareAvatars: true,
    classicMenu: true,
    hideStories: true,
    hideFeedSidebar: true,
    classicProfile: true
  });
  function normalize(value) {
    const input = value && typeof value === "object" ? value : {};
    const result = { ...defaults };
    for (const [name, fallback] of Object.entries(defaults)) {
      if (typeof fallback === "boolean" && typeof input[name] === "boolean") result[name] = input[name];
    }
    if ([800, 900, 1040].includes(input.width)) result.width = input.width;
    if ([11, 12, 13, 14].includes(input.fontSize)) result.fontSize = input.fontSize;
    return result;
  }
  return Object.freeze({ key, defaults, normalize });
})();
