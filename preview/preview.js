(() => {
  // This local preview uses only demonstration data; never contacts VK.
  const listeners = new Set();
  let value = { ...VKClassicSettings.defaults };
  const mock = {
    storage: {
      onChanged: { addListener(fn) { listeners.add(fn); }, removeListener(fn) { listeners.delete(fn); } },
      local: {
        async get() { return { vkClassicSettings: value }; },
        async set(next) { const old = value; value = next.vkClassicSettings; for (const fn of listeners) fn({ vkClassicSettings: { oldValue: old, newValue: value } }, 'local'); }
      }
    },
    runtime: { onMessage: { addListener() {} } }
  };
  window.chrome = mock;
  function update() { mock.storage.local.set({ vkClassicSettings: { ...value, enabled: document.querySelector('#demo-toggle').checked, width: Number(document.querySelector('#demo-width').value) } }); }
  document.querySelector('#demo-toggle').addEventListener('change', update);
  document.querySelector('#demo-width').addEventListener('change', update);
  let timer;
  function toast(text) { const target = document.querySelector('#toast'); target.textContent = text; target.classList.add('visible'); clearTimeout(timer); timer = setTimeout(() => target.classList.remove('visible'), 2500); }
  document.querySelectorAll('#page_wrap a').forEach(link => link.addEventListener('click', event => { event.preventDefault(); toast('Это демонстрация оформления. В расширении ссылка открывает настоящий раздел ВК.'); }));
  document.querySelector('#demo-action').addEventListener('click', () => toast('Кнопка работает. В ВК она откроет настоящий диалог.'));
  document.querySelector('#demo-friend').addEventListener('click', event => { event.target.textContent = event.target.textContent === 'Добавить в друзья' ? 'Вы друзья · демо' : 'Добавить в друзья'; });
  document.querySelector('#demo-post').addEventListener('click', () => toast('Это только демонстрация — запись никуда не отправляется.'));
})();
