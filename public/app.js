const state = {
  user: null,
  pin: '',
  menu: [],
  cart: new Map(),
  paymentMethod: 'cash',
  cashReceived: '',
  recentSales: [],
  adminDate: new Date().toISOString().slice(0, 10),
  adminSummary: null,
  adminMenu: [],
  pcCategory: '',
  variantPicker: null,
  variantDraft: {},
  message: ''
};

const app = document.getElementById('app');

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

function itemLabel(item) {
  return String(item?.displayName || item?.name || '');
}

function itemMeta(item) {
  const parts = [];
  if (item?.variant) parts.push(String(item.variant));
  if (item?.pluCode) parts.push(`#${item.pluCode}`);
  return parts.join(' • ');
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
  return `${money(prices[0])}-${money(prices[prices.length - 1])}`;
}

function groupVariantLabel(group) {
  const variants = (group?.items || []).map((item) => String(item.variant || '').trim()).filter(Boolean);
  if (variants.length <= 1) return group?.pluCode ? `#${group.pluCode}` : '';
  return `${variants.length} varianty`;
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
  return Array.from(state.cart.values());
}

function cartTotal() {
  return cartItems().reduce((sum, item) => sum + item.qty * item.priceCzk, 0);
}

function changeDue() {
  const received = Number(String(state.cashReceived || '').replace(',', '.'));
  const total = cartTotal();
  if (!Number.isFinite(received)) return null;
  return received - total;
}

function updateCashReceived(value) {
  state.cashReceived = value;
  updatePaymentPreview();
}

function updatePaymentPreview() {
  const change = changeDue();
  const changeBox = document.getElementById('changeBox');
  const changeValue = document.getElementById('changeValue');
  if (!changeBox || !changeValue) return;
  changeBox.classList.toggle('bad', change !== null && change < 0);
  changeValue.textContent = change === null ? '-' : money(Math.max(0, change));
}

function addItem(item) {
  const current = state.cart.get(item.id) || { ...item, qty: 0 };
  current.qty += 1;
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
    state.cart.set(id, { ...current, qty: Number(current.qty || 0) + qty });
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
  render();
}

async function loadMenu() {
  const data = await api('/api/menu');
  state.menu = data.items || [];
  if (state.user?.role === 'pc_cashier') {
    const categories = menuCategories();
    if (!state.pcCategory || !categories.includes(state.pcCategory)) {
      state.pcCategory = categories[0] || '';
    }
  }
}

function menuCategories() {
  return [...new Set(state.menu.map((item) => item.category))];
}

function selectPcCategory(category) {
  state.pcCategory = String(category || '');
  render();
}

async function loadRecentSales() {
  const data = await api('/api/sales/recent');
  state.recentSales = data.sales || [];
}

async function loadAdmin() {
  const data = await api(`/api/admin/summary?from=${encodeURIComponent(state.adminDate)}&to=${encodeURIComponent(state.adminDate)}`);
  const menu = await api('/api/admin/menu-items');
  state.adminSummary = data;
  state.adminMenu = menu.items || [];
}

async function pay() {
  const items = cartItems();
  if (items.length === 0) return setMessage('Košík je prázdný.');
  const total = cartTotal();
  const received = Number(String(state.cashReceived || '').replace(',', '.'));
  if (state.paymentMethod === 'cash' && (!Number.isFinite(received) || received < total)) {
    return setMessage('Zadej přijatou hotovost aspoň ve výši účtu.');
  }
  try {
    const data = await api('/api/sales', {
      method: 'POST',
      body: JSON.stringify({
        paymentMethod: state.paymentMethod,
        cashReceivedCzk: state.paymentMethod === 'cash' ? received : null,
        items: items.map((item) => ({ menuItemId: item.id, qty: item.qty }))
      })
    });
    const change = data.sale.changeCzk === null || data.sale.changeCzk === undefined ? '' : ` Vrátit: ${money(data.sale.changeCzk)}.`;
    state.cart.clear();
    state.cashReceived = '';
    await loadRecentSales();
    if (state.user.role === 'admin') await loadAdmin();
    setMessage(`Zaplaceno ${money(data.sale.totalCzk)}.${change}`);
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

async function saveMenuItem(id) {
  const name = document.querySelector(`[data-menu-name="${id}"]`)?.value || '';
  const category = document.querySelector(`[data-menu-category="${id}"]`)?.value || '';
  const variant = document.querySelector(`[data-menu-variant="${id}"]`)?.value || '';
  const pluCode = document.querySelector(`[data-menu-code="${id}"]`)?.value || '';
  const menuScope = document.querySelector(`[data-menu-scope="${id}"]`)?.value || 'mobile';
  const priceCzk = document.querySelector(`[data-menu-price="${id}"]`)?.value || 0;
  const active = document.querySelector(`[data-menu-active="${id}"]`)?.checked || false;
  try {
    await api(`/api/admin/menu-items/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ name, category, variant, pluCode, menuScope, priceCzk, active })
    });
    await loadAdmin();
    setMessage('Položka uložena.');
  } catch (e) {
    setMessage(e.message || String(e));
  }
}

async function addMenuItem(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  try {
    await api('/api/admin/menu-items', {
      method: 'POST',
      body: JSON.stringify({
        name: data.get('name'),
        category: data.get('category'),
        variant: data.get('variant'),
        pluCode: data.get('pluCode'),
        menuScope: data.get('menuScope') || 'mobile',
        priceCzk: data.get('priceCzk')
      })
    });
    form.reset();
    await loadMenu();
    await loadAdmin();
    setMessage('Položka přidána.');
  } catch (e) {
    setMessage(e.message || String(e));
  }
}

async function closeDay() {
  if (!confirm(`Uzavřít den ${state.adminDate}? Historie zůstane uložená.`)) return;
  try {
    await api('/api/admin/close-day', {
      method: 'POST',
      body: JSON.stringify({ date: state.adminDate })
    });
    await loadAdmin();
    setMessage('Denní uzávěrka uložena.');
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
          <p class="muted">Zadej PIN pokladní nebo admina.</p>
        </div>
        <form class="pin-form" onsubmit="event.preventDefault(); login(this.pin.value);">
          <input name="pin" inputmode="numeric" autocomplete="off" placeholder="PIN" autofocus />
          <button type="submit">Přihlásit</button>
        </form>
        <div class="pin-hint">
          <span>Pokladna 1: 1111</span>
          <span>Pokladna 2: 2222</span>
          <span>PC pokladna: 3333</span>
          <span>Admin: 9999</span>
        </div>
      </section>
    </main>
  `;
}

function cashierView() {
  const categories = menuCategories();
  const total = cartTotal();
  const change = changeDue();
  const isPcCashier = state.user?.role === 'pc_cashier';
  const visibleCategories = isPcCashier ? categories.filter((category) => category === state.pcCategory) : categories;
  const productButtonHtml = (item) => `
    <button type="button" class="item-btn" onclick="pressItem(${item.id})">
      <strong>${escapeHtml(itemLabel(item))}</strong>
      ${itemMeta(item) ? `<small>${escapeHtml(itemMeta(item))}</small>` : ''}
      <span>${money(item.priceCzk)}</span>
      ${state.cart.get(item.id)?.qty ? `<b class="item-count">${state.cart.get(item.id).qty}</b>` : ''}
    </button>
  `;
  const groupButtonHtml = (group) => {
    const qty = groupCartQty(group);
    const variants = groupVariantLabel(group);
    return `
      <button type="button" class="item-btn variant-group-btn" onclick='pressProductGroup(${JSON.stringify(group.category)}, ${JSON.stringify(group.name)}, ${JSON.stringify(group.pluCode)})'>
        <strong>${escapeHtml(group.name)}</strong>
        ${variants ? `<small>${escapeHtml(variants)}${group.pluCode && variants !== `#${group.pluCode}` ? ` • #${escapeHtml(group.pluCode)}` : ''}</small>` : ''}
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
          <h1>${isPcCashier ? 'PC pokladna' : 'Pokladna'}</h1>
        </div>
        <button class="icon-btn" onclick="logout()">Odhlásit</button>
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
          <div class="cart-head">
            <h2>Účet</h2>
            <button class="ghost-btn" onclick="state.cart.clear(); render()">Smazat</button>
          </div>
          <div class="cart-list">
            ${cartItems().length === 0 ? '<p class="empty">Žádné položky.</p>' : ''}
            ${cartItems().map((item) => `
              <div class="cart-row">
                <div>
                  <strong>${escapeHtml(itemLabel(item))}</strong>
                  <span>${money(item.priceCzk)} / ks</span>
                </div>
                <div class="qty">
                  <button onclick="setQty(${item.id}, ${item.qty - 1})">-</button>
                  <b>${item.qty}</b>
                  <button onclick="setQty(${item.id}, ${item.qty + 1})">+</button>
                </div>
                <strong>${money(item.qty * item.priceCzk)}</strong>
              </div>
            `).join('')}
          </div>
          <div class="pay-dock">
            <div class="total-box">
              <span>Celkem</span>
              <strong>${money(total)}</strong>
            </div>
            <div class="pay-tabs">
              <button class="${state.paymentMethod === 'cash' ? 'active' : ''}" onclick="state.paymentMethod='cash'; render()">Hotově</button>
              <button class="${state.paymentMethod === 'card' ? 'active' : ''}" onclick="state.paymentMethod='card'; render()">Kartou</button>
            </div>
            ${state.paymentMethod === 'cash' ? `
              <label class="field cash-field">
                <span>Přijato od zákazníka</span>
                <input inputmode="decimal" autocomplete="off" value="${escapeHtml(state.cashReceived)}" oninput="updateCashReceived(this.value)" placeholder="např. 200" />
              </label>
              <div id="changeBox" class="change-box ${change !== null && change < 0 ? 'bad' : ''}">
                <span>Vrátit</span>
                <strong id="changeValue">${change === null ? '-' : money(Math.max(0, change))}</strong>
              </div>
            ` : '<div class="change-box"><span>Platba</span><strong>Karta</strong></div>'}
            <button class="pay-btn" onclick="pay()">Zaplatit</button>
          </div>
        </aside>
      </section>
      ${variantPickerView()}
      ${historyView(false)}
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

function historyView(full) {
  return `
    <section class="history">
      <div class="section-title">
        <h2>${full ? 'Historie prodejů' : 'Poslední prodeje'}</h2>
        <button class="ghost-btn" onclick="loadRecentSales().then(render)">Obnovit</button>
      </div>
      <div class="sale-list">
        ${state.recentSales.length === 0 ? '<p class="empty">Zatím žádné prodeje.</p>' : ''}
        ${state.recentSales.map((sale) => `
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

function adminView() {
  const s = state.adminSummary || {};
  return `
    <main class="app-shell admin-shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">Admin</p>
          <h1>Přehled</h1>
        </div>
        <button class="icon-btn" onclick="logout()">Odhlásit</button>
      </header>
      <section class="admin-tools">
        <label class="field">
          <span>Datum</span>
          <input type="date" value="${state.adminDate}" onchange="state.adminDate=this.value; loadAdmin().then(render)" />
        </label>
        <button class="pay-btn compact" onclick="closeDay()">Uzavřít den</button>
      </section>
      <section class="kpi-grid">
        <div class="kpi"><span>Tržba</span><strong>${money(s.totalCzk)}</strong></div>
        <div class="kpi"><span>Hotově</span><strong>${money(s.cashCzk)}</strong></div>
        <div class="kpi"><span>Karta</span><strong>${money(s.cardCzk)}</strong></div>
        <div class="kpi danger"><span>Storna</span><strong>${money(s.voidedCzk)}</strong></div>
      </section>
      <section class="admin-grid">
        <div class="panel">
          <h2>Podle pokladní</h2>
          ${(s.byCashier || []).map((row) => `
            <div class="report-row"><span>${escapeHtml(row.cashierName)} (${row.salesCount}x)</span><strong>${money(row.totalCzk)}</strong></div>
          `).join('') || '<p class="empty">Bez prodejů.</p>'}
        </div>
        <div class="panel">
          <h2>Podle položek</h2>
          ${(s.byItem || []).map((row) => `
            <div class="report-row"><span>${escapeHtml(row.itemName)} (${row.qty}x)</span><strong>${money(row.totalCzk)}</strong></div>
          `).join('') || '<p class="empty">Bez prodejů.</p>'}
        </div>
      </section>
      <section class="panel">
        <h2>Menu a ceny</h2>
        <form class="add-form" onsubmit="addMenuItem(event)">
          <input name="name" placeholder="Název" required />
          <input name="category" placeholder="Kategorie" value="Jídlo" required />
          <input name="variant" placeholder="Varianta" />
          <input name="pluCode" placeholder="Kód" />
          <select name="menuScope">
            <option value="mobile">Mobil</option>
            <option value="pc">PC</option>
          </select>
          <input name="priceCzk" inputmode="decimal" placeholder="Cena" required />
          <button type="submit">Přidat</button>
        </form>
        <div class="menu-edit-list">
          ${state.adminMenu.map((item) => `
            <div class="menu-edit-row">
              <div class="menu-edit-main">
                <input data-menu-name="${item.id}" value="${escapeHtml(item.name)}" aria-label="Název" />
                <small>${escapeHtml(item.menuScope === 'pc' ? 'PC pokladna' : 'Mobilní pokladna')}</small>
              </div>
              <input data-menu-category="${item.id}" value="${escapeHtml(item.category)}" aria-label="Kategorie" />
              <input data-menu-variant="${item.id}" value="${escapeHtml(item.variant || '')}" placeholder="Bez varianty" aria-label="Varianta" />
              <input data-menu-code="${item.id}" value="${escapeHtml(item.pluCode || '')}" placeholder="Kód" aria-label="Kód" />
              <select data-menu-scope="${item.id}" aria-label="Katalog">
                <option value="mobile" ${item.menuScope !== 'pc' ? 'selected' : ''}>Mobil</option>
                <option value="pc" ${item.menuScope === 'pc' ? 'selected' : ''}>PC</option>
              </select>
              <input data-menu-price="${item.id}" inputmode="decimal" value="${item.priceCzk}" aria-label="Cena" />
              <label><input data-menu-active="${item.id}" type="checkbox" ${item.active ? 'checked' : ''}/> Aktivní</label>
              <button onclick="saveMenuItem(${item.id})">Uložit</button>
            </div>
          `).join('')}
        </div>
      </section>
      ${historyView(true)}
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
window.updateCashReceived = updateCashReceived;
window.setQty = setQty;
window.pay = pay;
window.voidSale = voidSale;
window.loadRecentSales = loadRecentSales;
window.loadAdmin = loadAdmin;
window.saveMenuItem = saveMenuItem;
window.addMenuItem = addMenuItem;
window.closeDay = closeDay;
window.state = state;
window.render = render;

render();
