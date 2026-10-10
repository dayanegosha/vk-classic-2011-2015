(() => {
  "use strict";
  const { key, defaults, normalize } = VKClassicSettings;
  const fields = Object.keys(defaults);
  let settings = normalize();
  let saveQueue = Promise.resolve();
  let messageTimer;
  function render() {
    for (const name of fields) {
      const field = document.getElementById(name);
      if (field.type === "checkbox") field.checked = settings[name];
      else field.value = String(settings[name]);
    }
    document.getElementById("appearance").disabled = !settings.enabled;
  }
  async function status() {
    const target = document.getElementById("status");
    if (!settings.enabled) { target.textContent = "Выключено · обычное оформление ВК"; return; }
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error("No active tab");
      const result = await chrome.tabs.sendMessage(tab.id, { type: "VK_CLASSIC_STATUS" });
      target.textContent = result.active ? "Включено на этой странице" : "Включено · открой полную версию ВК";
    } catch {
      target.textContent = "Включено · открой или обнови ВК";
    }
  }
  function save() {
    const snapshot = { ...settings };
    saveQueue = saveQueue.catch(() => {}).then(async () => {
      try {
        await chrome.storage.local.set({ [key]: snapshot });
        clearTimeout(messageTimer);
        document.getElementById("saved").textContent = "Сохранено";
        await status();
        messageTimer = setTimeout(() => { document.getElementById("saved").textContent = ""; }, 1600);
      } catch {
        document.getElementById("saved").textContent = "Не удалось сохранить";
      }
    });
  }
  async function init() {
    try { settings = normalize((await chrome.storage.local.get(key))[key]); }
    catch { document.getElementById("saved").textContent = "Не удалось прочитать настройки"; }
    render();
    for (const name of fields) {
      document.getElementById(name).addEventListener("change", event => {
        const field = event.target;
        settings = normalize({ ...settings, [name]: field.type === "checkbox" ? field.checked : Number(field.value) });
        render();
        save();
      });
    }
    document.getElementById("reset").addEventListener("click", () => { settings = normalize(); render(); save(); });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes[key]) { settings = normalize(changes[key].newValue); render(); status(); }
    });
    status();
  }
  init();
})();
