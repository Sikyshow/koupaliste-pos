const state = {
  user: null,
  pin: '',
  theme: localStorage.getItem('koupaliste-theme') === 'dark' ? 'dark' : 'light',
  menu: [],
  categoryOrder: [],
  cart: new Map(),
  cartSeq: 0,
  paymentMethod: 'cash',
  cashReceived: '',
  chargeTotal: '',
  recentSales: [],
  adminDate: new Date().toISOString().slice(0, 10),
  adminSummary: null,
  adminMenu: [],
  adminScopes: [],
  adminCategoryOrder: [],
  adminClosures: [],
  selectedClosure: null,
  adminTab: 'overview',
  adminClosureMonth: '',
  pcCategory: '',
  showRecentSales: false,
  variantPicker: null,
  variantDraft: {},
  message: ''
};

const app = document.getElementById('app');
document.documentElement.dataset.theme = state.theme;

document.addEventListener(
  'gesturestart',
  (event) => {
    event.preventDefault();
  },
  { passive: false }
);

function money(value) {
  return `${Number(value || 0).toFixed(0)} Kč`;
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = state.theme;
  localStorage.setItem('koupaliste-theme', state.theme);
  render();
}

function themeButton() {
  const dark = state.theme === 'dark';
  return `<button class="icon-btn theme-toggle" onclick="toggleTheme()" title="${dark ? 'Zapnout světlý režim' : 'Zapnout tmavý režim'}">${dark ? '☀ Světlý' : '☾ Tmavý'}</button>`;
}

function czDate(value) {
  const parts = String(value || '').slice(0, 10).split('-').map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return String(value || '');
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function monthKey(value) {
  return String(value || '').slice(0, 7);
}

function monthLabel(key) {
  const [year, month] = String(key || '').split('-').map(Number);
  if (!year || !month) return String(key || '');
  return `${month}.${year}`;
}

function itemLabel(item) {
  return String(item?.displayName || item?.name || '');
}

function groupKeyForItem(item) {
  return [item?.category || '', item?.name || '', item?.pluCode || ''].join('||');
}

function productGroupsForCategory(category) {
  const groups = new Map();
  for (const item of state.menu.filter((row) => row.category === category)) {
    const key = groupKeyForItem(item);
    const group = groups.get(key) || {
      key,
      category: item.category,
      name: item.name,
      pluCode: item.pluCode || '',
      items: []
    };
    group.items.push(item);
    groups.set(key, group);
  }
  return Array.from(groups.values()).map((group) => ({
    ...group,
    items: group.items.sort((a, b) => {
      const av = String(a.variant || '').replace(',', '.');
      const bv = String(b.variant || '').replace(',', '.');
      const an = Number(av);
      const bn = Number(bv);
      if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
      return String(a.variant || '').localeCompare(String(b.variant || ''), 'cs');
    })
  }));
}

function groupCartQty(group) {
  return (group?.items || []).reduce((sum, item) => sum + Number(state.cart.get(item.id)?.qty || 0), 0);
}

function groupPriceLabel(group) {
  const prices = [...new Set((group?.items || []).map((item) => Number(item.priceCzk || 0)))].sort((a, b) => a - b);
  if (prices.length === 0) return money(0);
  if (prices.length === 1) return money(prices[0]);
  return `od ${money(prices[0])}`;
}

function isPcUser(user = state.user) {
  return ['bouda', 'pc2', 'pc_cashier'].includes(String(user?.role || '').trim());
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function headers() {
  return {
    'Content-Type': 'application/json',
    'x-pin': state.pin
  };
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      ...headers(),
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function setMessage(message) {
  state.message = message;
  render();
  if (message) {
    setTimeout(() => {
      if (state.message === message) {
        state.message = '';
        render();
      }
    }, 2600);
  }
}

function cartItems() {
  return Array.from(state.cart.values()).sort((a, b) => Number(b.lastAdded || 0) - Number(a.lastAdded || 0));
}

function cartTotal() {
  return cartItems().reduce((sum, item) => sum + item.qty * item.priceCzk, 0);
}

function changeDue() {
  const raw = String(state.cashReceived || '').trim();
  if (!raw) return null;
  const received = Number(raw.replace(',', '.'));
  const total = chargedTotal();
  if (!Number.isFinite(received)) return null;
  return received - total;
}

function chargedTotal() {
  const raw = String(state.chargeTotal || '').trim();
  if (!raw) return cartTotal();
  const amount = Number(raw.replace(',', '.'));
  return Number.isFinite(amount) ? amount : NaN;
}

function surchargeDue() {
  const charged = chargedTotal();
  if (!Number.isFinite(charged)) return null;
  return czkClient(charged - cartTotal());
}

function czkClient(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function quickCashAmounts(total = cartTotal()) {
  const base = Math.ceil(Number(total || 0));
  if (base <= 0) return [];
  const roundTo10 = Math.ceil(base / 10) * 10;
  const roundTo50 = Math.ceil(base / 50) * 50;
  const candidates = [
    base,
    base + 5,
    base + 10,
    base + 15,
    base + 20,
    roundTo10,
    roundTo50,
    Math.ceil(base / 100) * 100,
    200,
    500,
    1000
  ].filter((value) => value >= base);
  return [...new Set(candidates)].sort((a, b) => a - b).slice(0, 6);
}

function quickReceivedAmounts(total = chargedTotal()) {
  const base = Math.ceil(Number(total || 0));
  if (base <= 0 || !Number.isFinite(base)) return [];
  const candidates = [
    base,
    Math.ceil(base / 50) * 50,
    Math.ceil(base / 100) * 100,
    200,
    500,
    1000
  ].filter((value) => value >= base);
  return [...new Set(candidates)].sort((a, b) => a - b).slice(0, 4);
}

function setCashReceived(value) {
  state.cashReceived = String(value || '');
  render();
}

function setChargeTotal(value) {
  state.chargeTotal = String(value || '');
  render();
}

function updateCashReceived(value) {
  state.cashReceived = value;
  updatePaymentPreview();
}

function updateChargeTotal(value) {
  state.chargeTotal = value;
  updatePaymentPreview();
}

function updatePaymentPreview() {
  const surcharge = surchargeDue();
  const change = changeDue();
  const surchargeValue = document.getElementById('surchargeValue');
  const changeBox = document.getElementById('changeBox');
  const changeValue = document.getElementById('changeValue');
  if (surchargeValue) surchargeValue.textContent = surcharge === null ? '-' : money(Math.max(0, surcharge));
  if (!changeBox || !changeValue) return;
  changeBox.classList.toggle('bad', change !== null && change < 0);
  changeValue.textContent = change === null ? '-' : money(Math.max(0, change));
}

function addItem(item) {
  const current = state.cart.get(item.id) || { ...item, qty: 0 };
  current.qty += 1;
  current.lastAdded = ++state.cartSeq;
  state.cart.set(item.id, current);
  render();
}

function addItemById(id) {
  const item = state.menu.find((row) => Number(row.id) === Number(id));
  if (item) addItem(item);
}

function pressItem(id) {
  addItemById(id);
}

function findProductGroup(category, name, pluCode) {
  return productGroupsForCategory(category).find(
    (group) => group.name === name && String(group.pluCode || '') === String(pluCode || '')
  );
}

function pressProductGroup(category, name, pluCode) {
  const group = findProductGroup(category, name, pluCode);
  if (!group) return;
  if (group.items.length === 1) {
    addItem(group.items[0]);
    return;
  }
  state.variantPicker = group;
  state.variantDraft = {};
  render();
}

function closeVariantPicker() {
  state.variantPicker = null;
  state.variantDraft = {};
  render();
}

function setQty(id, qty) {
  const item = state.cart.get(Number(id));
  if (!item) return;
  const next = Math.max(0, Math.floor(Number(qty || 0)));
  if (next <= 0) state.cart.delete(Number(id));
  else state.cart.set(Number(id), { ...item, qty: next });
  render();
}

function adjustVariantQty(id, delta) {
  const key = String(id);
  const current = Number(state.variantDraft[key] || 0);
  const next = Math.max(0, current + Number(delta || 0));
  state.variantDraft = { ...state.variantDraft };
  if (next <= 0) delete state.variantDraft[key];
  else state.variantDraft[key] = next;
  render();
}

function variantDraftTotal() {
  return Object.values(state.variantDraft || {}).reduce((sum, qty) => sum + Number(qty || 0), 0);
}

function addVariantDraftToCart() {
  for (const [rawId, rawQty] of Object.entries(state.variantDraft || {})) {
    const id = Number(rawId);
    const qty = Math.max(0, Math.floor(Number(rawQty || 0)));
    if (!id || !qty) continue;
    const item = state.menu.find((row) => Number(row.id) === id);
    if (!item) continue;
    const current = state.cart.get(id) || { ...item, qty: 0 };
    state.cart.set(id, { ...current, qty: Number(current.qty || 0) + qty, lastAdded: ++state.cartSeq });
  }
  closeVariantPicker();
}

async function login(pin) {
  const safePin = String(pin || '').trim();
  if (!safePin) return;
  try {
    const data = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: safePin })
    }).then(async (res) => {
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Přihlášení selhalo.');
      return payload;
    });
    state.pin = safePin;
    state.user = data.user;
    state.cart.clear();
    await loadMenu();
    await loadRecentSales();
    if (state.user.role === 'admin') {
      await loadAdmin();
    }
    render();
  } catch (e) {
    setMessage(e.message || String(e));
  }
}

function logout() {
  state.user = null;
  state.pin = '';
  state.cart.clear();
  state.recentSales = [];
  state.adminSummary = null;
  state.adminClosures = [];
  render();
}

async function loadMenu() {
  const data = await api('/api/menu');
  state.menu = data.items || [];
  state.categoryOrder = data.categoryOrder || [];
  if (isPcUser()) {
    const categories = menuCategories();
    if (!state.pcCategory || !categories.includes(state.pcCategory)) {
      state.pcCategory = categories[0] || '';
    }
  }
}

function menuCategories() {
  return orderCategories([...new Set(state.menu.map((item) => item.category))], state.categoryOrder);
}

function selectPcCategory(category) {
  state.pcCategory = String(category || '');
  render();
}

function orderCategories(categories, order = []) {
  const rank = new Map((order || []).map((category, index) => [String(category), index]));
  return [...categories].sort((a, b) => {
    const ai = rank.has(String(a)) ? rank.get(String(a)) : Number.MAX_SAFE_INTEGER;
    const bi = rank.has(String(b)) ? rank.get(String(b)) : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return String(a).localeCompare(String(b), 'cs');
  });
}

function moveBefore(list, dragged, target) {
  const current = [...list];
  const from = current.indexOf(dragged);
  const to = current.indexOf(target);
  if (from < 0 || to < 0 || from === to) return current;
  current.splice(from, 1);
  current.splice(current.indexOf(target), 0, dragged);
  return current;
}

function toggleRecentSales() {
  state.showRecentSales = !state.showRecentSales;
  render();
}

async function loadRecentSales() {
  const data = await api('/api/sales/recent');
  state.recentSales = data.sales || [];
}

async function loadAdmin() {
  const data = await api(`/api/admin/summary?from=${encodeURIComponent(state.adminDate)}&to=${encodeURIComponent(state.adminDate)}`);
  const menu = await api('/api/admin/menu-items');
  const closures = await api('/api/admin/closures');
  state.adminSummary = data;
  state.adminMenu = menu.items || [];
  state.adminScopes = menu.scopes || [];
  state.adminCategoryOrder = menu.categoryOrder || [];
  state.adminClosures = closures.closures || [];
}

async function pay() {
  const items = cartItems();
  if (items.length === 0) return setMessage('Košík je prázdný.');
  const total = cartTotal();
  const rawChargeTotal = String(state.chargeTotal || '').trim();
  const chargeTotal = rawChargeTotal ? Number(rawChargeTotal.replace(',', '.')) : total;
  const rawReceived = String(state.cashReceived || '').trim();
  const received = rawReceived ? Number(rawReceived.replace(',', '.')) : chargeTotal;
  if (!Number.isFinite(chargeTotal) || chargeTotal < total) {
    return setMessage('Účtovaná cena musí být aspoň ve výši účtu.');
  }
  if (state.paymentMethod === 'cash' && (!Number.isFinite(received) || received < chargeTotal)) {
    return setMessage('Přijatá hotovost musí být aspoň ve výši účtované ceny.');
  }
  try {
    const data = await api('/api/sales', {
      method: 'POST',
      body: JSON.stringify({
        paymentMethod: state.paymentMethod,
        chargedTotalCzk: chargeTotal,
        cashReceivedCzk: state.paymentMethod === 'cash' ? received : null,
        items: items.map((item) => ({ menuItemId: item.id, qty: item.qty }))
      })
    });
    const change = data.sale.changeCzk === null || data.sale.changeCzk === undefined ? '' : ` Vrátit: ${money(data.sale.changeCzk)}.`;
    state.cart.clear();
    state.cashReceived = '';
    state.chargeTotal = '';
    await loadRecentSales();
    if (state.user.role === 'admin') await loadAdmin();
    setMessage(`Zaplaceno ${money(data.sale.totalCzk)}.${change}`);
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  } catch (e) {
    setMessage(e.message || String(e));
  }
}

async function voidSale(id) {
  const reason = prompt('Důvod storna:', 'Storno prodeje') || '';
  if (!confirm('Opravdu stornovat prodej?')) return;
  try {
    await api(`/api/sales/${encodeURIComponent(id)}/void`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
    await loadRecentSales();
    if (state.user.role === 'admin') await loadAdmin();
    setMessage('Prodej byl stornován.');
  } catch (e) {
    setMessage(e.message || String(e));
  }
}

function menuItemPayload(id) {
  const name = document.querySelector(`[data-menu-name="${id}"]`)?.value || '';
  const category = document.querySelector(`[data-menu-category="${id}"]`)?.value || '';
  const variant = document.querySelector(`[data-menu-variant="${id}"]`)?.value || '';
  const pluCode = document.querySelector(`[data-menu-code="${id}"]`)?.value || '';
  const menuScopes = Array.from(document.querySelectorAll(`[data-menu-scope="${id}"]:checked`)).map((input) => input.value);
  const priceCzk = document.querySelector(`[data-menu-price="${id}"]`)?.value || 0;
  const active = document.querySelector(`[data-menu-active="${id}"]`)?.checked || false;
  return { name, category, variant, pluCode, menuScopes, priceCzk, active };
}

async function saveMenuItem(id) {
  try {
    await api(`/api/admin/menu-items/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(menuItemPayload(id))
    });
    await loadAdmin();
    setMessage('Položka uložena.');
  } catch (e) {
    setMessage(e.message || String(e));
  }
}

async function saveMenuCategory(ids, category) {
  const rows = Array.isArray(ids) ? ids.map(Number).filter(Boolean) : [];
  if (rows.length === 0) return setMessage('V kategorii nejsou žádné položky.');
  try {
    await Promise.all(rows.map((id) => api(`/api/admin/menu-items/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(menuItemPayload(id))
    })));
    await loadAdmin();
    setMessage(`Kategorie ${category} uložena (${rows.length} položek).`);
  } catch (e) {
    setMessage(e.message || String(e));
  }
}

async function cleanupDefaultBoudaItems() {
  if (!confirm('Skrýt staré výchozí položky pro Boudu? Tvoje nové položky a historie prodejů zůstanou.')) return;
  try {
    const data = await api('/api/admin/menu-items/cleanup-default-bouda', { method: 'POST' });
    await loadAdmin();
    setMessage(`Skryto ${Number(data.hidden || 0)} starých položek.`);
  } catch (e) {
    setMessage(e.message || String(e));
  }
}

function dragCategory(event, category) {
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', String(category));
  state.dragCategory = String(category);
}

async function dropCategory(event, targetCategory) {
  event.preventDefault();
  const dragged = state.dragCategory || event.dataTransfer.getData('text/plain');
  state.dragCategory = '';
  if (!dragged || dragged === targetCategory) return;
  const categories = orderCategories([...new Set(state.adminMenu.map((item) => item.category).filter(Boolean))], state.adminCategoryOrder);
  const nextOrder = moveBefore(categories, dragged, targetCategory);
  state.adminCategoryOrder = nextOrder;
  render();
  try {
    await api('/api/admin/menu-categories/order', {
      method: 'POST',
      body: JSON.stringify({ categories: nextOrder })
    });
    await loadMenu();
    await loadAdmin();
    render();
  } catch (e) {
    setMessage(e.message || String(e));
  }
}

function dragMenuItem(event, id) {
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', String(id));
  state.dragMenuItemId = Number(id);
}

async function dropMenuItem(event, category, targetId) {
  event.preventDefault();
  const draggedId = Number(state.dragMenuItemId || event.dataTransfer.getData('text/plain'));
  state.dragMenuItemId = 0;
  const target = Number(targetId);
  if (!draggedId || !target || draggedId === target) return;
  const rows = state.adminMenu.filter((item) => item.category === category).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'cs'));
  const ids = moveBefore(rows.map((item) => item.id), draggedId, target);
  state.adminMenu = state.adminMenu.map((item) => ids.includes(item.id) ? { ...item, sortOrder: (ids.indexOf(item.id) + 1) * 10 } : item);
  render();
  try {
    await api('/api/admin/menu-items/reorder', {
      method: 'POST',
      body: JSON.stringify({ category, ids })
    });
    await loadMenu();
    await loadAdmin();
    render();
  } catch (e) {
    setMessage(e.message || String(e));
  }
}

async function addMenuItem(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const selectedCategory = String(data.get('category') || '');
  const newCategory = String(data.get('newCategory') || '').trim();
  const category = selectedCategory === '__new__' ? newCategory : selectedCategory;
  const variantMode = data.get('variantMode') === 'variants';
  const variantRows = variantMode ? Array.from(form.querySelectorAll('.variant-price-row'))
    .map((row) => ({
      variant: row.querySelector('[name="variantName"]')?.value.trim() || '',
      priceCzk: row.querySelector('[name="variantPrice"]')?.value.trim() || ''
    }))
    .filter((row) => row.variant || row.priceCzk) : [];
  const basePriceCzk = String(data.get('priceCzk') || '').trim();
  const rows = variantMode ? variantRows : [{ variant: '', priceCzk: basePriceCzk }];
  if (!category) {
    setMessage('Vyber nebo napiš kategorii.');
    return;
  }
  if (!variantMode && !basePriceCzk) {
    setMessage('Vyplň cenu.');
    return;
  }
  if (variantMode && (!rows.length || rows.some((row) => !row.priceCzk || !row.variant))) {
    setMessage('U každého druhu vyplň název i cenu.');
    return;
  }
  try {
    await Promise.all(
      rows.map((row) => api('/api/admin/menu-items', {
        method: 'POST',
        body: JSON.stringify({
          name: data.get('name'),
          category,
          variant: row.variant,
          pluCode: data.get('pluCode') || '',
          menuScopes: data.getAll('menuScopes'),
          priceCzk: row.priceCzk
        })
      })
    ));
    form.reset();
    await loadMenu();
    await loadAdmin();
    setMessage(rows.length > 1 ? `Přidáno ${rows.length} variant.` : 'Položka přidána.');
  } catch (e) {
    setMessage(e.message || String(e));
  }
}

function setMenuAddMode(button, mode) {
  const form = button.closest('form');
  if (!form) return;
  const isVariantMode = mode === 'variants';
  form.querySelector('[name="variantMode"]').value = isVariantMode ? 'variants' : 'single';
  form.querySelector('.base-price-field')?.classList.toggle('is-hidden', isVariantMode);
  form.querySelector('.variant-prices')?.classList.toggle('is-hidden', !isVariantMode);
  form.querySelectorAll('.mode-btn').forEach((modeButton) => {
    modeButton.classList.toggle('active', modeButton === button);
  });
  const priceInput = form.querySelector('[name="priceCzk"]');
  if (priceInput) priceInput.required = !isVariantMode;
}

function addVariantPriceRow(button) {
  const list = button.closest('.variant-prices')?.querySelector('.variant-price-list');
  if (!list) return;
  list.insertAdjacentHTML('beforeend', variantPriceRowTemplate());
}

function removeVariantPriceRow(button) {
  const row = button.closest('.variant-price-row');
  const list = button.closest('.variant-price-list');
  if (!row || !list) return;
  if (list.querySelectorAll('.variant-price-row').length === 1) {
    row.querySelectorAll('input').forEach((input) => { input.value = ''; });
    return;
  }
  row.remove();
}

function variantPriceRowTemplate() {
  return `
    <div class="variant-price-row">
      <input name="variantName" placeholder="Druh: Malý" />
      <input name="variantPrice" inputmode="decimal" placeholder="Cena" />
      <button type="button" class="ghost-btn remove-variant-btn" onclick="removeVariantPriceRow(this)" aria-label="Odebrat druh">-</button>
    </div>
  `;
}

function setAdminTab(tab) {
  state.adminTab = tab;
  render();
}

function setClosureMonth(month) {
  state.adminClosureMonth = month;
  state.selectedClosure = null;
  render();
}

function toggleNewCategoryField(select) {
  const form = select.closest('form');
  const field = form?.querySelector('.new-category-field');
  const input = field?.querySelector('input');
  const isNew = select.value === '__new__';
  field?.classList.toggle('is-hidden', !isNew);
  if (input) {
    input.required = isNew;
    if (isNew) input.focus();
  }
}

async function closeDay() {
  if (!confirm(`Uzavřít den ${state.adminDate}? Historie zůstane uložená.`)) return;
  try {
    await api('/api/admin/close-day', {
      method: 'POST',
      body: JSON.stringify({ date: state.adminDate })
    });
    state.cart.clear();
    state.cashReceived = '';
    state.recentSales = [];
    await loadAdmin();
    setMessage('Směna uzavřena. Nová směna začíná od nuly.');
  } catch (e) {
    setMessage(e.message || String(e));
  }
}

async function openClosure(id) {
  try {
    const data = await api(`/api/admin/closures/${encodeURIComponent(id)}`);
    state.selectedClosure = data.closure || null;
    render();
    requestAnimationFrame(() => {
      document.getElementById('closure-detail')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    });
  } catch (e) {
    setMessage(e.message || String(e));
  }
}

function closeClosureDetail() {
  state.selectedClosure = null;
  render();
}

async function deleteClosure(id) {
  if (!confirm('Smazat tuto uzávěrku? Prodeje zůstanou uložené, smaže se jen záznam uzávěrky.')) return;
  try {
    await api(`/api/admin/closures/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (Number(state.selectedClosure?.id || 0) === Number(id)) {
      state.selectedClosure = null;
    }
    await loadAdmin();
    setMessage('Uzávěrka smazána.');
  } catch (e) {
    setMessage(e.message || String(e));
  }
}

function loginView() {
  return `
    <main class="login-screen">
      <section class="login-panel">
        <div>
          <p class="eyebrow">Koupaliště</p>
          <h1>Mobilní pokladna</h1>
          <p class="muted">Zadej svůj PIN.</p>
        </div>
        <form class="pin-form" onsubmit="event.preventDefault(); login(this.pin.value);">
          <input name="pin" inputmode="numeric" autocomplete="off" placeholder="PIN" autofocus />
          <button type="submit">Přihlásit</button>
        </form>
      </section>
    </main>
  `;
}

function cashierView() {
  const categories = menuCategories();
  const total = cartTotal();
  const change = changeDue();
  const surcharge = surchargeDue();
  const charged = chargedTotal();
  const isPcCashier = isPcUser();
  const visibleCategories = isPcCashier ? categories.filter((category) => category === state.pcCategory) : categories;
  const productButtonHtml = (item) => `
    <button type="button" class="item-btn" onclick="pressItem(${item.id})">
      <strong>${escapeHtml(itemLabel(item))}</strong>
      <span>${money(item.priceCzk)}</span>
      ${state.cart.get(item.id)?.qty ? `<b class="item-count">${state.cart.get(item.id).qty}</b>` : ''}
    </button>
  `;
  const groupButtonHtml = (group) => {
    const qty = groupCartQty(group);
    return `
      <button type="button" class="item-btn variant-group-btn" onclick='pressProductGroup(${JSON.stringify(group.category)}, ${JSON.stringify(group.name)}, ${JSON.stringify(group.pluCode)})'>
        <strong>${escapeHtml(group.name)}</strong>
        <span>${groupPriceLabel(group)}</span>
        ${qty ? `<b class="item-count">${qty}</b>` : ''}
      </button>
    `;
  };
  return `
    <main class="app-shell cashier-shell ${isPcCashier ? 'pc-cashier-shell' : ''}">
      <header class="topbar">
        <div>
          <p class="eyebrow">${escapeHtml(state.user.name)}</p>
          <h1>${isPcCashier ? state.user.name : 'Pokladna'}</h1>
        </div>
        <div class="topbar-actions">
          ${isPcCashier ? `<button class="icon-btn history-toggle ${state.showRecentSales ? 'active' : ''}" onclick="toggleRecentSales()">Prodeje</button>` : ''}
          ${themeButton()}
          <button class="icon-btn" onclick="logout()">Odhlásit</button>
        </div>
      </header>

      <section class="pos-grid">
        <div class="menu-zone">
          ${isPcCashier ? `
            <nav class="pc-category-tabs">
              ${categories.map((category) => {
                const count = state.menu.filter((item) => item.category === category).length;
                return `
                  <button class="${category === state.pcCategory ? 'active' : ''}" onclick='selectPcCategory(${JSON.stringify(category)})'>
                    <strong>${escapeHtml(category)}</strong>
                    <span>${count}</span>
                  </button>
                `;
              }).join('')}
            </nav>
          ` : ''}
          ${visibleCategories.map((category) => `
            <section class="menu-section">
              <h2>${escapeHtml(category)}${isPcCashier ? ` <span>${state.menu.filter((item) => item.category === category).length} položek</span>` : ''}</h2>
              <div class="item-grid">
                ${isPcCashier
                  ? productGroupsForCategory(category).map((group) => groupButtonHtml(group)).join('')
                  : state.menu.filter((item) => item.category === category).map((item) => productButtonHtml(item)).join('')}
              </div>
            </section>
          `).join('')}
        </div>

        <aside class="cart-zone">
          <div class="cart-card">
            <div class="cart-head">
              <div>
                <h2>Účet</h2>
                <span>${cartItems().length} položek</span>
              </div>
              <button class="ghost-btn" onclick="state.cart.clear(); state.cashReceived=''; state.chargeTotal=''; render()">Smazat</button>
            </div>
            <div class="cart-list">
              ${cartItems().length === 0 ? '<p class="empty">Žádné položky.</p>' : ''}
              ${cartItems().map((item) => `
                <div class="cart-row">
                  <div>
                    <strong>${escapeHtml(itemLabel(item))}</strong>
                    <span>${money(item.priceCzk)} / ks</span>
                  </div>
                  <strong>${money(item.qty * item.priceCzk)}</strong>
                  <div class="qty">
                    <button onclick="setQty(${item.id}, ${item.qty - 1})">-</button>
                    <b>${item.qty}</b>
                    <button onclick="setQty(${item.id}, ${item.qty + 1})">+</button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
          ${isPcCashier && state.showRecentSales ? historyView(false, 'side') : ''}
          <div class="pay-dock">
            <div class="total-box">
              <span>Celkem</span>
              <strong>${money(total)}</strong>
            </div>
            <div class="pay-tabs">
              <button class="${state.paymentMethod === 'cash' ? 'active' : ''}" onclick="state.paymentMethod='cash'; render()">Hotově</button>
              <button class="${state.paymentMethod === 'card' ? 'active' : ''}" onclick="state.paymentMethod='card'; render()">Kartou</button>
            </div>
            <label class="field charge-field">
              <span>Účtovat celkem</span>
              <input inputmode="decimal" autocomplete="off" value="${escapeHtml(state.chargeTotal)}" oninput="updateChargeTotal(this.value)" placeholder="${money(total)}" />
            </label>
            <div class="surcharge-box">
              <span>Dýško</span>
              <strong id="surchargeValue">${surcharge === null ? '-' : money(Math.max(0, surcharge))}</strong>
            </div>
            <label class="field cash-field ${state.paymentMethod === 'card' ? 'inactive' : ''}">
              <span>${state.paymentMethod === 'cash' ? 'Hotově přijal' : 'Hotově přijal'}</span>
              <input inputmode="decimal" autocomplete="off" value="${escapeHtml(state.cashReceived)}" oninput="updateCashReceived(this.value)" placeholder="např. 500" ${state.paymentMethod === 'card' ? 'disabled' : ''} />
            </label>
            <div id="changeBox" class="change-box ${change !== null && change < 0 ? 'bad' : ''} ${state.paymentMethod === 'card' ? 'card-mode' : ''}">
              <span>${state.paymentMethod === 'cash' ? 'Vrátit' : 'Platba'}</span>
              <strong id="changeValue">${state.paymentMethod === 'cash' ? (change === null ? '-' : money(Math.max(0, change))) : 'Karta'}</strong>
            </div>
            <button class="pay-btn" onclick="pay()">Zaplatit</button>
          </div>
        </aside>
      </section>
      ${variantPickerView()}
      ${isPcCashier ? '' : historyView(false)}
    </main>
  `;
}

function variantPickerView() {
  const group = state.variantPicker;
  if (!group) return '';
  const draftTotal = variantDraftTotal();
  return `
    <div class="variant-modal-backdrop" onclick="closeVariantPicker()">
      <section class="variant-modal" onclick="event.stopPropagation()">
        <div class="variant-modal-head">
          <div>
            <p class="eyebrow">${escapeHtml(group.category)}</p>
            <h2>${escapeHtml(group.name)}</h2>
            ${group.pluCode ? `<span>#${escapeHtml(group.pluCode)}</span>` : ''}
          </div>
          <button class="ghost-btn" onclick="closeVariantPicker()">Zavřít</button>
        </div>
        <div class="variant-choice-grid">
          ${group.items.map((item) => {
            const cartQty = Number(state.cart.get(item.id)?.qty || 0);
            const draftQty = Number(state.variantDraft[String(item.id)] || 0);
            return `
              <article class="variant-choice ${draftQty ? 'active' : ''}">
                <div>
                  <strong>${escapeHtml(item.variant || item.name)}</strong>
                  <div class="variant-info-row">
                    <span>${money(item.priceCzk)}</span>
                    <b class="variant-qty-badge">Přidat nyní: ${draftQty}</b>
                    ${cartQty ? `<b class="variant-cart-badge">V účtu: ${cartQty}</b>` : ''}
                  </div>
                </div>
                <div class="variant-stepper">
                  <button type="button" onclick="adjustVariantQty(${item.id}, -1)" ${draftQty <= 0 ? 'disabled' : ''}>-</button>
                  <b>${draftQty}</b>
                  <button type="button" onclick="adjustVariantQty(${item.id}, 1)">+</button>
                </div>
              </article>
            `;
          }).join('')}
        </div>
        <div class="variant-modal-actions">
          <button class="ghost-btn" onclick="closeVariantPicker()">Zrušit</button>
          <button class="pay-btn" onclick="addVariantDraftToCart()" ${draftTotal <= 0 ? 'disabled' : ''}>
            Přidat do účtu${draftTotal ? ` (${draftTotal})` : ''}
          </button>
        </div>
      </section>
    </div>
  `;
}

function historyView(full, mode = '') {
  const sales = full && state.adminSummary?.sales ? state.adminSummary.sales : state.recentSales;
  return `
    <section class="history ${mode === 'side' ? 'side-history' : ''}">
      <div class="section-title">
        <h2>${full ? 'Historie prodejů' : 'Poslední prodeje'}</h2>
        <button class="ghost-btn" onclick="${full ? 'loadAdmin().then(render)' : 'loadRecentSales().then(render)'}">Obnovit</button>
      </div>
      <div class="sale-list">
        ${sales.length === 0 ? '<p class="empty">Zatím žádné prodeje.</p>' : ''}
        ${sales.map((sale) => `
          <article class="sale-row ${sale.voided ? 'voided' : ''}">
            <div>
              <strong>#${sale.saleNo} ${money(sale.totalCzk)}</strong>
              <span>${escapeHtml(sale.cashierName)} • ${sale.paymentMethod === 'cash' ? 'hotově' : 'kartou'} • ${escapeHtml(sale.createdAt)}</span>
              <small>${(sale.items || []).map((item) => `${escapeHtml(item.itemName)} ${item.qty}x`).join(', ')}</small>
              ${sale.voided ? `<em>Storno: ${escapeHtml(sale.voidedByName)} ${escapeHtml(sale.voidedAt)}</em>` : ''}
            </div>
            ${sale.voided ? '<b>STORNO</b>' : `<button class="danger-btn" onclick="voidSale(${sale.id})">Storno</button>`}
          </article>
        `).join('')}
      </div>
    </section>
  `;
}

function adminVoidsView() {
  const voids = (state.adminSummary?.sales || []).filter((sale) => sale.voided);
  return `
    <section class="panel void-panel">
      <div class="section-title">
        <h2>Storna</h2>
        <span>${voids.length}x</span>
      </div>
      <div class="sale-list void-list">
        ${voids.length === 0 ? '<p class="empty">Pro vybraný den nejsou žádná storna.</p>' : ''}
        ${voids.map((sale) => `
          <article class="sale-row voided">
            <div>
              <strong>#${sale.saleNo} ${money(sale.totalCzk)}</strong>
              <span>${escapeHtml(sale.cashierName)} • ${sale.paymentMethod === 'cash' ? 'hotově' : 'kartou'} • ${escapeHtml(sale.createdAt)}</span>
              <small>${(sale.items || []).map((item) => `${escapeHtml(item.itemName)} ${item.qty}x`).join(', ')}</small>
              <em>Storno: ${escapeHtml(sale.voidedByName)} ${escapeHtml(sale.voidedAt)}</em>
              ${sale.voidReason ? `<small>Důvod: ${escapeHtml(sale.voidReason)}</small>` : ''}
            </div>
            <b>STORNO</b>
          </article>
        `).join('')}
      </div>
    </section>
  `;
}

function closureReportRows(report = {}) {
  const sales = report.sales || [];
  const cashierMap = new Map();
  const itemMap = new Map();
  const voids = [];

  for (const sale of sales) {
    const cashierName = String(sale.cashierName || 'Neznámá pokladna');
    const cashier = cashierMap.get(cashierName) || {
      cashierName,
      salesCount: 0,
      cashCzk: 0,
      cardCzk: 0,
      totalCzk: 0,
      voidedCount: 0,
      voidedCzk: 0
    };

    if (sale.voided) {
      cashier.voidedCount += 1;
      cashier.voidedCzk += Number(sale.totalCzk || 0);
      voids.push(sale);
    } else {
      cashier.salesCount += 1;
      cashier.totalCzk += Number(sale.totalCzk || 0);
      if (sale.paymentMethod === 'card') cashier.cardCzk += Number(sale.totalCzk || 0);
      else cashier.cashCzk += Number(sale.totalCzk || 0);

      for (const item of sale.items || []) {
        const key = item.itemName || 'Položka';
        const row = itemMap.get(key) || { itemName: key, qty: 0, totalCzk: 0 };
        row.qty += Number(item.qty || 0);
        row.totalCzk += Number(item.lineTotalCzk || 0);
        itemMap.set(key, row);
      }
    }

    cashierMap.set(cashierName, cashier);
  }

  return {
    cashiers: Array.from(cashierMap.values()).sort((a, b) => b.totalCzk - a.totalCzk),
    items: Array.from(itemMap.values()).sort((a, b) => b.qty - a.qty || b.totalCzk - a.totalCzk),
    voids
  };
}

function adminClosuresView() {
  const closures = state.adminClosures || [];
  const months = [...new Set(closures.map((closure) => monthKey(closure.businessDate)).filter(Boolean))]
    .sort((a, b) => b.localeCompare(a));
  if (!state.adminClosureMonth || !months.includes(state.adminClosureMonth)) {
    state.adminClosureMonth = months[0] || '';
  }
  const selectedMonth = state.adminClosureMonth;
  const monthClosures = closures.filter((closure) => monthKey(closure.businessDate) === selectedMonth);
  const monthSummary = monthClosures.reduce((sum, closure) => ({
    totalCzk: sum.totalCzk + Number(closure.totalCzk || 0),
    cashCzk: sum.cashCzk + Number(closure.cashCzk || 0),
    cardCzk: sum.cardCzk + Number(closure.cardCzk || 0),
    voidedCzk: sum.voidedCzk + Number(closure.voidedCzk || 0),
    salesCount: sum.salesCount + Number(closure.salesCount || 0),
    voidedCount: sum.voidedCount + Number(closure.voidedCount || 0)
  }), { totalCzk: 0, cashCzk: 0, cardCzk: 0, voidedCzk: 0, salesCount: 0, voidedCount: 0 });
  const detail = state.selectedClosure;
  const report = detail?.report || {};
  const rows = closureReportRows(report);
  return `
    <section class="panel closures-panel">
      <div class="section-title">
        <h2>Uzávěrky směn</h2>
        <button class="ghost-btn" onclick="loadAdmin().then(render)">Obnovit</button>
      </div>
      ${months.length ? `
        <div class="closure-month-tabs">
          ${months.map((month) => `
            <button class="closure-month-tab ${month === selectedMonth ? 'active' : ''}" onclick="setClosureMonth('${escapeHtml(month)}')">
              <strong>${escapeHtml(monthLabel(month))}</strong>
              <span>${closures.filter((closure) => monthKey(closure.businessDate) === month).length} uzávěrek</span>
            </button>
          `).join('')}
        </div>
        <section class="closure-month-summary">
          <div><span>Měsíc</span><strong>${escapeHtml(monthLabel(selectedMonth))}</strong></div>
          <div><span>Celkem</span><strong>${money(monthSummary.totalCzk)}</strong></div>
          <div><span>Hotově</span><strong>${money(monthSummary.cashCzk)}</strong></div>
          <div><span>Karta</span><strong>${money(monthSummary.cardCzk)}</strong></div>
          <div><span>Prodeje</span><strong>${monthSummary.salesCount}x</strong></div>
          <div><span>Storna</span><strong>${money(monthSummary.voidedCzk)} / ${monthSummary.voidedCount}x</strong></div>
        </section>
      ` : ''}
      <div class="closure-list">
        ${closures.length === 0 ? '<p class="empty">Zatím nejsou uložené žádné uzávěrky.</p>' : ''}
        ${monthClosures.map((closure) => `
          <article class="closure-row ${Number(detail?.id || 0) === Number(closure.id) ? 'selected' : ''}">
            <div>
              <strong>${escapeHtml(czDate(closure.businessDate))} • ${money(closure.totalCzk)}</strong>
              <span>${escapeHtml(closure.closedAt)} • ${escapeHtml(closure.closedByName)} • ${closure.salesCount} prodejů</span>
            </div>
            <div class="closure-money">
              <span>Hotově ${money(closure.cashCzk)}</span>
              <span>Karta ${money(closure.cardCzk)}</span>
              <span>Storna ${money(closure.voidedCzk)} (${closure.voidedCount}x)</span>
            </div>
            <div class="closure-actions">
              <button class="ghost-btn" onclick="openClosure(${closure.id})">${Number(detail?.id || 0) === Number(closure.id) ? 'Zobrazeno' : 'Detail'}</button>
              <button class="danger-btn compact-danger" onclick="deleteClosure(${closure.id})">Smazat</button>
            </div>
          </article>
        `).join('')}
        ${closures.length && monthClosures.length === 0 ? '<p class="empty">V tomto měsíci nejsou žádné uzávěrky.</p>' : ''}
      </div>
      ${detail ? `
        <div class="closure-detail" id="closure-detail">
          <div class="section-title">
            <h3>Detail uzávěrky ${escapeHtml(czDate(detail.businessDate))} • ${money(detail.totalCzk)}</h3>
            <button class="ghost-btn" onclick="closeClosureDetail()">Zavřít</button>
          </div>
          <section class="closure-kpis">
            <div><span>Hotově</span><strong>${money(detail.cashCzk)}</strong></div>
            <div><span>Karta</span><strong>${money(detail.cardCzk)}</strong></div>
            <div><span>Prodeje</span><strong>${detail.salesCount}</strong></div>
            <div><span>Storna</span><strong>${money(detail.voidedCzk)}</strong></div>
          </section>
          <section class="closure-section">
            <h4>Pokladny</h4>
            <div class="report-table cashier-report">
              <div class="report-head">
                <span>Pokladna</span><span>Hotově</span><span>Karta</span><span>Celkem</span><span>Prodeje</span><span>Storna</span>
              </div>
              ${rows.cashiers.map((row) => `
                <div class="report-line">
                  <strong>${escapeHtml(row.cashierName)}</strong>
                  <span>${money(row.cashCzk)}</span>
                  <span>${money(row.cardCzk)}</span>
                  <strong>${money(row.totalCzk)}</strong>
                  <span>${row.salesCount}x</span>
                  <span>${row.voidedCount}x / ${money(row.voidedCzk)}</span>
                </div>
              `).join('') || '<p class="empty">Bez prodejů.</p>'}
            </div>
          </section>
          <section class="closure-section">
            <h4>Prodáno podle položek</h4>
            <div class="report-table item-report">
              <div class="report-head">
                <span>Položka</span><span>Ks</span><span>Celkem</span>
              </div>
              ${rows.items.map((row) => `
                <div class="report-line">
                  <strong>${escapeHtml(row.itemName)}</strong>
                  <span>${row.qty}x</span>
                  <strong>${money(row.totalCzk)}</strong>
                </div>
              `).join('') || '<p class="empty">Bez položek.</p>'}
            </div>
          </section>
          <section class="closure-section">
            <h4>Storna</h4>
            <div class="report-table void-report">
              <div class="report-head">
                <span>Prodej</span><span>Pokladna</span><span>Položky</span><span>Důvod</span><span>Částka</span>
              </div>
              ${rows.voids.map((sale) => `
                <div class="report-line">
                  <strong>#${sale.saleNo}</strong>
                  <span>${escapeHtml(sale.cashierName)}</span>
                  <span>${(sale.items || []).map((item) => `${escapeHtml(item.itemName)} ${item.qty}x`).join(', ')}</span>
                  <span>${escapeHtml(sale.voidReason || '-')}</span>
                  <strong>${money(sale.totalCzk)}</strong>
                </div>
              `).join('') || '<p class="empty">Bez storen.</p>'}
            </div>
          </section>
          <div class="closure-sales">
            <h4>Jednotlivé prodeje</h4>
            ${(report.sales || []).map((sale) => `
              <article class="sale-row ${sale.voided ? 'voided' : ''}">
                <div>
                  <strong>#${sale.saleNo} ${money(sale.totalCzk)}</strong>
                  <span>${escapeHtml(sale.cashierName)} • ${sale.paymentMethod === 'cash' ? 'hotově' : 'kartou'} • ${escapeHtml(sale.createdAt)}</span>
                  <small>${(sale.items || []).map((item) => `${escapeHtml(item.itemName)} ${item.qty}x (${money(item.lineTotalCzk)})`).join(', ')}</small>
                  ${sale.voided ? `<em>STORNO ${escapeHtml(sale.voidReason || '')}</em>` : ''}
                </div>
                <b>${sale.voided ? 'STORNO' : money(sale.totalCzk)}</b>
              </article>
            `).join('') || '<p class="empty">Bez prodejů.</p>'}
          </div>
        </div>
      ` : ''}
    </section>
  `;
}

function adminView() {
  const s = state.adminSummary || {};
  const categories = orderCategories([...new Set(state.adminMenu.map((item) => item.category).filter(Boolean))], state.adminCategoryOrder);
  const scopes = state.adminScopes.length ? state.adminScopes : [
    { id: 'zmrzlina', label: 'Zmrzlina 1111' },
    { id: 'bouda', label: 'Bouda 3333' },
    { id: 'pc2', label: 'Truck 4444' }
  ];
  const scopeCheckboxes = (name, selected = []) => `
    <div class="scope-checks">
      ${scopes.map((scope) => `
        <label>
          <input type="checkbox" name="${name}" value="${escapeHtml(scope.id)}" ${selected.includes(scope.id) ? 'checked' : ''} />
          <span>${escapeHtml(scope.label)}</span>
        </label>
      `).join('')}
    </div>
  `;
  const activeMenuCount = state.adminMenu.filter((item) => item.active).length;
  const hiddenMenuCount = state.adminMenu.length - activeMenuCount;
  const voids = (s.sales || []).filter((sale) => sale.voided);
  const tab = state.adminTab || 'overview';
  const adminTabs = [
    { id: 'overview', label: 'Přehled', meta: money(s.totalCzk) },
    { id: 'closures', label: 'Uzávěrky', meta: `${state.adminClosures.length}x` },
    { id: 'voids', label: 'Storna', meta: `${voids.length}x` },
    { id: 'items', label: 'Položky', meta: `${activeMenuCount} aktivních` },
    { id: 'sales', label: 'Prodeje', meta: `${(s.sales || []).length}x` }
  ];
  const overviewContent = `
    <section class="admin-grid">
      <div class="panel admin-panel-card">
        <h2>Podle pokladní</h2>
        ${(s.byCashier || []).map((row) => `
          <div class="report-row"><span>${escapeHtml(row.cashierName)} (${row.salesCount}x)</span><strong>${money(row.totalCzk)}</strong></div>
        `).join('') || '<p class="empty">Bez prodejů.</p>'}
      </div>
      <div class="panel admin-panel-card">
        <h2>Nejprodávanější položky</h2>
        ${(s.byItem || []).slice(0, 12).map((row) => `
          <div class="report-row"><span>${escapeHtml(row.itemName)} (${row.qty}x)</span><strong>${money(row.totalCzk)}</strong></div>
        `).join('') || '<p class="empty">Bez prodejů.</p>'}
      </div>
    </section>
  `;
  const itemsContent = `
    <section class="panel admin-panel-card items-admin-panel">
      <div class="section-title">
        <div>
          <h2>Správa položek</h2>
          <p class="muted">Přidání, ceny, kategorie a pokladny.</p>
        </div>
        <div class="section-actions">
          <button type="button" class="ghost-btn danger-ghost" onclick="cleanupDefaultBoudaItems()">Skrýt staré Bouda položky</button>
          <strong class="admin-pill">${state.adminMenu.length} položek</strong>
        </div>
      </div>
      <form class="add-form quick-add-form" onsubmit="addMenuItem(event)">
        <label class="field">
          <span>Kam přidat</span>
          <select name="category" onchange="toggleNewCategoryField(this)" required>
            ${categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('')}
            <option value="__new__">+ Nová kategorie</option>
          </select>
        </label>
        <label class="field new-category-field ${categories.length ? 'is-hidden' : ''}">
          <span>Nová kategorie</span>
          <input name="newCategory" placeholder="Např. Sladkosti" ${categories.length ? '' : 'required'} />
        </label>
        <label class="field">
          <span>Název</span>
          <input name="name" placeholder="Např. Jupík" required />
        </label>
        <div class="field price-mode-field">
          <span>Typ ceny</span>
          <input type="hidden" name="variantMode" value="single" />
          <div class="mode-switch">
            <button type="button" class="mode-btn active" onclick="setMenuAddMode(this, 'single')">Jedna cena</button>
            <button type="button" class="mode-btn" onclick="setMenuAddMode(this, 'variants')">Více druhů</button>
          </div>
        </div>
        <label class="field base-price-field">
          <span>Cena bez druhu</span>
          <input name="priceCzk" inputmode="decimal" placeholder="Např. 25" required />
        </label>
        <div class="variant-prices is-hidden">
          <div class="section-title">
            <span class="field-title">Druhy s vlastní cenou</span>
            <button type="button" class="ghost-btn" onclick="addVariantPriceRow(this)">Přidat druh</button>
          </div>
          <div class="variant-price-list">
            ${variantPriceRowTemplate()}
          </div>
        </div>
        <div class="quick-add-scope">
          <span class="field-title">Pokladna</span>
          ${scopeCheckboxes('menuScopes', ['zmrzlina'])}
        </div>
        <button type="submit">Přidat položku</button>
      </form>
      <div class="menu-edit-list">
        ${categories.map((category) => {
          const items = state.adminMenu.filter((item) => item.category === category);
          const itemIds = items.map((item) => item.id);
          return `
            <details class="menu-category-edit">
              <summary draggable="true" ondragstart='dragCategory(event, ${JSON.stringify(category)})' ondragover="event.preventDefault()" ondrop='dropCategory(event, ${JSON.stringify(category)})'>
                <b class="drag-handle">☰</b>
                <strong>${escapeHtml(category)}</strong>
                <span>${items.length} položek</span>
              </summary>
              <div class="category-bulk-actions">
                <button type="button" class="save-category-btn" onclick='saveMenuCategory(${JSON.stringify(itemIds)}, ${JSON.stringify(category)})'>Uložit celou kategorii</button>
              </div>
              <div class="menu-category-items">
                ${items.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'cs')).map((item) => `
                  <div class="menu-edit-row" draggable="true" ondragstart="dragMenuItem(event, ${item.id})" ondragover="event.preventDefault()" ondrop='dropMenuItem(event, ${JSON.stringify(category)}, ${item.id})'>
                    <b class="drag-handle">☰</b>
                    <div class="menu-edit-main">
                      <input data-menu-name="${item.id}" value="${escapeHtml(item.name)}" aria-label="Název" />
                      <small>${escapeHtml((item.menuScopeLabels || []).join(', '))}</small>
                    </div>
                    <input data-menu-category="${item.id}" value="${escapeHtml(item.category)}" aria-label="Kategorie" />
                    <input data-menu-variant="${item.id}" value="${escapeHtml(item.variant || '')}" placeholder="Bez varianty" aria-label="Varianta" />
                    <input data-menu-code="${item.id}" value="${escapeHtml(item.pluCode || '')}" placeholder="Kód" aria-label="Kód" />
                    ${scopeCheckboxes(`scope-${item.id}`, item.menuScopeIds || []).replaceAll('name=', `data-menu-scope="${item.id}" name=`)}
                    <input data-menu-price="${item.id}" inputmode="decimal" value="${item.priceCzk}" aria-label="Cena" />
                    <label><input data-menu-active="${item.id}" type="checkbox" ${item.active ? 'checked' : ''}/> Aktivní</label>
                    <button onclick="saveMenuItem(${item.id})">Uložit</button>
                  </div>
                `).join('')}
              </div>
            </details>
          `;
        }).join('') || '<p class="empty">Zatím nejsou žádné položky.</p>'}
      </div>
    </section>
  `;
  const tabContent = tab === 'closures'
    ? adminClosuresView()
    : tab === 'voids'
      ? adminVoidsView()
      : tab === 'items'
        ? itemsContent
        : tab === 'sales'
          ? historyView(true)
          : overviewContent;
  return `
    <main class="app-shell admin-shell">
      <section class="admin-hero-card">
        <div class="admin-hero-top">
          <div>
            <p class="eyebrow">Hlavní administrace</p>
            <h1>${tab === 'items' ? 'Správa položek' : tab === 'closures' ? 'Uzávěrky' : tab === 'voids' ? 'Storna' : tab === 'sales' ? 'Prodeje' : 'Denní přehled'}</h1>
            <p class="muted">Tržby, pokladny, položky a uzávěrky na jednom místě.</p>
          </div>
          <div class="admin-hero-total">
            <span>Dnes</span>
            <strong>${money(s.totalCzk)}</strong>
            <small>${s.salesCount || 0} prodejů</small>
          </div>
        </div>
        <div class="admin-hero-actions">
          <label class="field">
            <span>Datum</span>
            <input type="date" value="${state.adminDate}" onchange="state.adminDate=this.value; loadAdmin().then(render)" />
          </label>
          <button class="pay-btn compact" onclick="closeDay()">Uzavřít den</button>
          ${themeButton()}
          <button class="icon-btn" onclick="logout()">Odhlásit</button>
        </div>
        <section class="kpi-grid admin-kpi-row">
          <div class="kpi"><span>Hotově</span><strong>${money(s.cashCzk)}</strong></div>
          <div class="kpi"><span>Karta</span><strong>${money(s.cardCzk)}</strong></div>
          <div class="kpi"><span>Aktivní položky</span><strong>${activeMenuCount}</strong></div>
          <div class="kpi danger"><span>Storna</span><strong>${money(s.voidedCzk)}</strong></div>
        </section>
      </section>
      <nav class="admin-tabs-row" aria-label="Admin záložky">
        ${adminTabs.map((item) => `
          <button class="admin-tab-btn ${tab === item.id ? 'active' : ''}" onclick="setAdminTab('${item.id}')">
            <strong>${escapeHtml(item.label)}</strong>
            <span>${escapeHtml(item.meta)}</span>
          </button>
        `).join('')}
      </nav>
      <section class="admin-tab-content">
        ${tabContent}
      </section>
    </main>
  `;
}

function render() {
  const message = state.message ? `<div class="toast">${escapeHtml(state.message)}</div>` : '';
  if (!state.user) {
    app.innerHTML = message + loginView();
    return;
  }
  app.innerHTML = message + (state.user.role === 'admin' ? adminView() : cashierView());
}

window.login = login;
window.logout = logout;
window.addItem = addItem;
window.addItemById = addItemById;
window.pressItem = pressItem;
window.pressProductGroup = pressProductGroup;
window.closeVariantPicker = closeVariantPicker;
window.adjustVariantQty = adjustVariantQty;
window.addVariantDraftToCart = addVariantDraftToCart;
window.selectPcCategory = selectPcCategory;
window.toggleRecentSales = toggleRecentSales;
window.setCashReceived = setCashReceived;
window.setChargeTotal = setChargeTotal;
window.updateCashReceived = updateCashReceived;
window.updateChargeTotal = updateChargeTotal;
window.setQty = setQty;
window.pay = pay;
window.voidSale = voidSale;
window.loadRecentSales = loadRecentSales;
window.loadAdmin = loadAdmin;
window.saveMenuItem = saveMenuItem;
window.saveMenuCategory = saveMenuCategory;
window.cleanupDefaultBoudaItems = cleanupDefaultBoudaItems;
window.dragCategory = dragCategory;
window.dropCategory = dropCategory;
window.dragMenuItem = dragMenuItem;
window.dropMenuItem = dropMenuItem;
window.addMenuItem = addMenuItem;
window.setAdminTab = setAdminTab;
window.setClosureMonth = setClosureMonth;
window.setMenuAddMode = setMenuAddMode;
window.addVariantPriceRow = addVariantPriceRow;
window.removeVariantPriceRow = removeVariantPriceRow;
window.toggleTheme = toggleTheme;
window.toggleNewCategoryField = toggleNewCategoryField;
window.closeDay = closeDay;
window.openClosure = openClosure;
window.closeClosureDetail = closeClosureDetail;
window.deleteClosure = deleteClosure;
window.state = state;
window.render = render;

render();
