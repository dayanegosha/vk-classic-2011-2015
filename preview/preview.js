(() => {
  const listeners = new Set(), messages = new Set();
  let value;
  try { value = VKClassicSettings.normalize(JSON.parse(sessionStorage.getItem('vk-classic-demo-settings'))); }
  catch { value = VKClassicSettings.normalize(); }
  const mock = {
    storage: {
      onChanged: { addListener(fn) { listeners.add(fn); }, removeListener(fn) { listeners.delete(fn); } },
      local: {
        async get() { return { vkClassicSettings: value }; },
        async set(next) {
          const old = value; value = VKClassicSettings.normalize(next.vkClassicSettings);
          sessionStorage.setItem('vk-classic-demo-settings', JSON.stringify(value));
          for (const fn of listeners) fn({ vkClassicSettings: { oldValue: old, newValue: value } }, 'local');
        }
      }
    },
    runtime: { getManifest: () => ({ version: '1.2.0' }), onMessage: { addListener(fn) { messages.add(fn); } } },
    tabs: {
      async query() { return [{ id: 1 }]; },
      async sendMessage(_id, message) {
        return new Promise((resolve, reject) => {
          let answered = false;
          for (const fn of messages) fn(message, {}, result => { answered = true; resolve(result); });
          if (!answered) reject(new Error('Unsupported preview message'));
        });
      }
    }
  };
  window.chrome = mock;
  function render() { document.querySelector('#demo-toggle').checked = value.enabled; document.querySelector('#demo-width').value = String(value.width); }
  listeners.add(render); render();
  function update() { mock.storage.local.set({ vkClassicSettings: { ...value, enabled: document.querySelector('#demo-toggle').checked, width: Number(document.querySelector('#demo-width').value) } }); }
  document.querySelector('#demo-toggle').addEventListener('change', update);
  document.querySelector('#demo-width').addEventListener('change', update);
  document.querySelector('#demo-settings').addEventListener('click', () => document.querySelector('#settings-dialog').showModal());
  document.querySelector('#close-settings').addEventListener('click', () => document.querySelector('#settings-dialog').close());
  // Export a real report from the fixture's content script in the top-level page.
  // Embedded-frame blob downloads are unavailable in the in-app test browser.
  const diagnostic = document.createElement('button');
  diagnostic.textContent = 'Диагностика демо';
  document.querySelector('.preview-toolbar').append(diagnostic);
  let reportUrl;
  diagnostic.addEventListener('click', async () => {
    const result = await mock.tabs.sendMessage(1, { type: 'VK_CLASSIC_DIAGNOSTIC' });
    if (!result.report) { toast(result.error || 'Ошибка диагностики'); return; }
    if (reportUrl) URL.revokeObjectURL(reportUrl);
    reportUrl = URL.createObjectURL(new Blob([JSON.stringify(result.report, null, 2)], { type: 'application/json' }));
    let link = document.querySelector('#preview-diagnostic-download');
    if (!link) { link = document.createElement('a'); link.id = 'preview-diagnostic-download'; document.querySelector('.preview-toolbar').append(link); }
    link.href = reportUrl; link.download = `vk-classic-diagnostic-${result.report.page}.json`; link.textContent = 'Скачать отчёт демо';
  });
  let timer;
  function toast(text) { const target = document.querySelector('#toast'); target.textContent = text; target.classList.add('visible'); clearTimeout(timer); timer = setTimeout(() => target.classList.remove('visible'), 2500); }
  document.querySelectorAll('#page_wrap a').forEach(link => link.addEventListener('click', event => { event.preventDefault(); toast('Демонстрационная ссылка.'); }));
  document.querySelector('#demo-action')?.addEventListener('click', () => toast('Нативная кнопка профиля сохранена. Это тестовая страница.'));
  document.querySelector('#demo-friend')?.addEventListener('click', event => { event.target.textContent = event.target.textContent === 'Добавить в друзья' ? 'Вы друзья · демо' : 'Добавить в друзья'; });
  document.querySelector('#demo-post')?.addEventListener('click', () => toast('Тестовая кнопка. Сообщения и записи не отправляются.'));
})();
