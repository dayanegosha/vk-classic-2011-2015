(() => {
  "use strict";
  const { key, defaults, normalize } = VKClassicSettings;
  const fields = Object.keys(defaults);
  let settings = normalize();
  let saveQueue = Promise.resolve();
  let messageTimer;
  let statusRequest = 0;
  let diagnosticUrl;
  function render() {
    for (const name of fields) {
      const field = document.getElementById(name);
      if (field.type === "checkbox") field.checked = settings[name];
      else field.value = String(settings[name]);
    }
    document.getElementById("appearance").disabled = !settings.enabled;
  }
  async function status() {
    const request = ++statusRequest;
    const target = document.getElementById("status");
    const stories = document.getElementById("stories-status");
    stories.textContent = "";
    if (!settings.enabled) { target.textContent = "Выключено · обычное оформление ВК"; return; }
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error("No active tab");
      const result = await chrome.tabs.sendMessage(tab.id, { type: "VK_CLASSIC_STATUS" });
      if (request !== statusRequest) return;
      target.textContent = result.active ? "Включено на этой странице" : "Включено · открой полную версию ВК";
      if (result.active && result.page === "feed") {
        stories.textContent = result.storiesFound ? (settings.hideStories ? "Блок распознан · скрыт" : "Блок распознан · показан") : "Блок не найден · если видишь истории, сохрани диагностику";
      }
    } catch {
      if (request !== statusRequest) return;
      target.textContent = "Включено · открой или обнови ВК";
    }
  }
  async function diagnostic() {
    const button = document.getElementById("diagnostic");
    const target = document.getElementById("diagnostic-status");
    const download = document.getElementById("diagnostic-download");
    button.disabled = true;
    target.textContent = "Сохраняем структуру страницы…";
    let timeout;
    try {
      await saveQueue;
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error("Открой ВК и обнови страницу после обновления расширения.");
      const response = await Promise.race([
        chrome.tabs.sendMessage(tab.id, { type: "VK_CLASSIC_DIAGNOSTIC" }),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("ВК не ответил. Обнови страницу и повтори.")), 15000); })
      ]);
      if (response?.error) throw new Error(response.error);
      if (response?.report?.schema !== "vk-classic-layout/1") throw new Error("Обнови расширение и вкладку ВК, затем попробуй ещё раз.");
      const blob = new Blob([JSON.stringify(response.report, null, 2)], { type: "application/json" });
      if (diagnosticUrl) URL.revokeObjectURL(diagnosticUrl);
      const url = URL.createObjectURL(blob);
      diagnosticUrl = url;
      const anchor = document.createElement("a");
      const page = ["profile", "feed", "messages", "other"].includes(response.report.page) ? response.report.page : "page";
      anchor.href = url;
      anchor.download = `vk-classic-diagnostic-${page}.json`;
      document.body.append(anchor); anchor.click(); anchor.remove();
      download.href = url;
      download.download = anchor.download;
      download.hidden = false;
      target.textContent = "Загрузка JSON начата. Файл можно передать разработчику.";
    } catch (error) {
      target.textContent = error?.message || "Не удалось сохранить. Обнови вкладку ВК и повтори.";
    } finally {
      clearTimeout(timeout);
      button.disabled = false;
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
    document.getElementById("diagnostic").addEventListener("click", diagnostic);
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes[key]) { settings = normalize(changes[key].newValue); render(); status(); }
    });
    status();
  }
  init();
})();
