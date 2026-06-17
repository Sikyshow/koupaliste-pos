import 'dotenv/config';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';

const [{ default: express }, { default: cors }] = await Promise.all([
  import('express'),
  import('cors')
]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const dataDir = process.env.KOUPALISTE_DB_DIR
  ? path.resolve(process.env.KOUPALISTE_DB_DIR)
  : path.join(os.homedir(), '.koupaliste-pos');
const dbPath = path.join(dataDir, 'koupaliste.db');
const PORT = Number(process.env.KOUPALISTE_PORT || 5050) || 5050;
const HOST = String(process.env.KOUPALISTE_HOST || '0.0.0.0').trim() || '0.0.0.0';

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row || null)));
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });
}

function normalizeRole(role) {
  const value = String(role || '').trim().toLowerCase();
  return value === 'admin' ? 'admin' : 'cashier';
}

function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function localDateTimeSql(date = new Date()) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${localDateKey(date)} ${h}:${m}:${s}`;
}

function parseDateKey(value, fallback = localDateKey()) {
  const raw = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : fallback;
}

function czk(value) {
  return Number(Number(value || 0).toFixed(2));
}

function mapUser(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    name: String(row.name || ''),
    role: String(row.role || 'cashier'),
    active: Number(row.active || 0) === 1
  };
}

function mapMenuItem(row) {
  const variant = String(row.variant_name || '').trim();
  const pluCode = String(row.plu_code || '').trim();
  const displayName = [String(row.name || ''), variant].filter(Boolean).join(' - ');
  return {
    id: Number(row.id),
    name: String(row.name || ''),
    displayName,
    category: String(row.category || 'Ostatní'),
    variant,
    pluCode,
    menuScope: String(row.menu_scope || 'mobile'),
    priceCzk: czk(row.price_czk),
    active: Number(row.active || 0) === 1,
    sortOrder: Number(row.sort_order || 0)
  };
}

function saleItemName(row) {
  return [String(row.name || ''), String(row.variant_name || '').trim()].filter(Boolean).join(' - ');
}

function pcCatalogPrice(name, variantName = '') {
  if (String(name || '') === 'Doplatek') {
    const variantPrice = Number(String(variantName || '').replace(',', '.'));
    return Number.isFinite(variantPrice) && variantPrice > 0 ? variantPrice : 5;
  }
  const prices = {
    '1.Pivo': 50,
    '2.Birell': 50,
    '3.Malinovka': 50,
    'Birell nick nack': 45,
    'Malinovka nick nack': 45,
    'Pivo nick nack': 45,
    'Plzeň': 65,
    'Domácí limonáda': 70,
    'Ledový čaj': 50,
    'Míchané nápoje alko': 119,
    'Mojito': 135,
    'Nealko drinky': 99,
    'Prosseco': 50,
    'Voda s limetkou': 25,
    'Cappucino': 70,
    'Espresso': 55,
    'Espresso tonic': 80,
    'Flat white': 80,
    'Latté': 80,
    'Ledová káva': 90,
    'Příchuť': 20,
    'Ovocný salátek': 50,
    'Platek melounu': 20,
    'Balzám': 50,
    'Bebe': 25,
    'Chipsy': 40,
    'Cukrová vata': 30,
    'Křupky': 30,
    'Pendrek': 5,
    'Slazené mléko': 40,
    'Sprej': 20,
    'Tatranka': 20,
    'Tyčinky': 30,
    '1. Zmrzlina': 35,
    '2. Italská zmrzlina': 45,
    'Hot dog': 45,
    'Klobáska': 90,
    'Kukuřice': 50,
    'Miska': 40,
    'Popcorn': 50,
    'Brýle': 60,
    'Kruhy': 50,
    'Lehátko': 160,
    'Míček': 20,
    'Nafukovací tyčky': 50,
    'Pistolky': 30,
    'Plavidlo': 160,
    'Přívěšek': 80,
    'Rukávky': 70,
    'Vesta': 70,
    'Cider': 50,
    'Cola': 45,
    'Energy': 45,
    'Jupik': 25,
    'Kofola': 40,
    'Kubik': 30,
    'Rajec': 30,
    'Vinea': 40
  };
  return Object.prototype.hasOwnProperty.call(prices, String(name || '')) ? prices[String(name || '')] : null;
}

function mapSale(row) {
  return {
    id: Number(row.id),
    saleNo: Number(row.sale_no || row.id || 0),
    cashierId: String(row.cashier_id || ''),
    cashierName: String(row.cashier_name || ''),
    totalCzk: czk(row.total_czk),
    paymentMethod: String(row.payment_method || 'cash'),
    cashReceivedCzk: row.cash_received_czk === null || row.cash_received_czk === undefined ? null : czk(row.cash_received_czk),
    changeCzk: row.change_czk === null || row.change_czk === undefined ? null : czk(row.change_czk),
    note: String(row.note || ''),
    voided: Number(row.voided || 0) === 1,
    voidedAt: row.voided_at || '',
    voidedByName: String(row.voided_by_name || ''),
    voidReason: String(row.void_reason || ''),
    createdAt: String(row.created_at || '')
  };
}

async function initDb() {
  await run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    pin TEXT NOT NULL UNIQUE,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  await run(`CREATE TABLE IF NOT EXISTS menu_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    variant_name TEXT NOT NULL DEFAULT '',
    plu_code TEXT NOT NULL DEFAULT '',
    menu_scope TEXT NOT NULL DEFAULT 'mobile',
    price_czk REAL NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  await run(`CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_no INTEGER NOT NULL DEFAULT 0,
    cashier_id TEXT NOT NULL,
    cashier_name TEXT NOT NULL,
    total_czk REAL NOT NULL,
    business_date TEXT NOT NULL DEFAULT '',
    payment_method TEXT NOT NULL,
    cash_received_czk REAL,
    change_czk REAL,
    note TEXT NOT NULL DEFAULT '',
    voided INTEGER NOT NULL DEFAULT 0,
    voided_at TEXT,
    voided_by_id TEXT,
    voided_by_name TEXT,
    void_reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  )`);

  await run(`CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL,
    menu_item_id INTEGER,
    item_name TEXT NOT NULL,
    category TEXT NOT NULL,
    qty INTEGER NOT NULL,
    unit_price_czk REAL NOT NULL,
    line_total_czk REAL NOT NULL
  )`);

  await run(`CREATE TABLE IF NOT EXISTS day_closures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_date TEXT NOT NULL,
    closed_by_id TEXT NOT NULL,
    closed_by_name TEXT NOT NULL,
    total_czk REAL NOT NULL DEFAULT 0,
    cash_czk REAL NOT NULL DEFAULT 0,
    card_czk REAL NOT NULL DEFAULT 0,
    voided_czk REAL NOT NULL DEFAULT 0,
    sales_count INTEGER NOT NULL DEFAULT 0,
    voided_count INTEGER NOT NULL DEFAULT 0,
    report_json TEXT NOT NULL,
    closed_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  )`);
  await run(`CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id)`);

  const menuCols = await all(`PRAGMA table_info(menu_items)`);
  if (!menuCols.some((col) => col.name === 'variant_name')) {
    await run(`ALTER TABLE menu_items ADD COLUMN variant_name TEXT NOT NULL DEFAULT ''`);
  }
  if (!menuCols.some((col) => col.name === 'plu_code')) {
    await run(`ALTER TABLE menu_items ADD COLUMN plu_code TEXT NOT NULL DEFAULT ''`);
  }
  if (!menuCols.some((col) => col.name === 'menu_scope')) {
    await run(`ALTER TABLE menu_items ADD COLUMN menu_scope TEXT NOT NULL DEFAULT 'mobile'`);
  }
  await run(`UPDATE menu_items SET menu_scope='mobile' WHERE trim(COALESCE(menu_scope, ''))=''`);
  await run(`CREATE INDEX IF NOT EXISTS idx_menu_items_scope ON menu_items(menu_scope, active, sort_order)`);

  const salesCols = await all(`PRAGMA table_info(sales)`);
  if (!salesCols.some((col) => col.name === 'business_date')) {
    await run(`ALTER TABLE sales ADD COLUMN business_date TEXT NOT NULL DEFAULT ''`);
    await run(`UPDATE sales SET business_date=substr(created_at, 1, 10) WHERE trim(COALESCE(business_date, ''))=''`);
  }
  await run(`CREATE INDEX IF NOT EXISTS idx_sales_business_date ON sales(business_date)`);

  const users = [
    ['cashier1', 'Pokladna 1', 'cashier', '1111'],
    ['cashier2', 'Pokladna 2', 'cashier', '2222'],
    ['pc_cashier', 'PC pokladna', 'pc_cashier', '3333'],
    ['admin', 'Admin', 'admin', '9999']
  ];
  for (const user of users) {
    await run(
      `INSERT OR IGNORE INTO users(id, name, role, pin, active) VALUES (?, ?, ?, ?, 1)`,
      user
    );
  }

  const count = await get(`SELECT COUNT(*) AS c FROM menu_items WHERE menu_scope='mobile'`);
  if (Number(count?.c || 0) === 0) {
    const seed = [
      ['Kopeček zmrzliny', 'Zmrzlina', 35, 10],
      ['Párek v rohlíku', 'Jídlo', 45, 20],
      ['Klobáska', 'Jídlo', 90, 30],
      ['Kukuřice', 'Jídlo', 50, 40]
    ];
    for (const row of seed) {
      await run(
        `INSERT INTO menu_items(name, category, price_czk, active, sort_order, menu_scope) VALUES (?, ?, ?, 1, ?, 'mobile')`,
        row
      );
    }
  }

  const pcSeed = [
    ['Pokladna', '1.Pivo', '82701', 'Malé', 0],
    ['Pokladna', '1.Pivo', '82701', 'Velké', 0],
    ['Pokladna', '2.Birell', '82705', 'Malý', 0],
    ['Pokladna', '2.Birell', '82705', 'Velký', 0],
    ['Pokladna', '3.Malinovka', '83217', 'Malá', 0],
    ['Pokladna', '3.Malinovka', '83217', 'Velká', 0],
    ['Pokladna', 'Doplatek', '82707', '5', 5],
    ['Pokladna', 'Doplatek', '82707', '10', 10],
    ['Pokladna', 'Doplatek', '82707', '20', 20],
    ['Pokladna', 'Doplatek', '82707', '50', 50],
    ['Pokladna', 'Doplatek', '82707', '100', 100],
    ['Pokladna', 'Doplatek', '82707', '1000', 1000],
    ['Doplňkový', 'Balzám', '82947', '', 0],
    ['Doplňkový', 'Bebe', '82931', 'Kus', 0],
    ['Doplňkový', 'Chipsy', '82925', 'Kus', 0],
    ['Doplňkový', 'Cukrová vata', '87455', '', 0],
    ['Doplňkový', 'Křupky', '87453', 'Křupky', 0],
    ['Doplňkový', 'Pendrek', '82935', '', 0],
    ['Doplňkový', 'Pendrek', '82935', 'Kus', 0],
    ['Doplňkový', 'Slazené mléko', '115557', '', 0],
    ['Doplňkový', 'Sprej', '87459', '', 0],
    ['Doplňkový', 'Tatranka', '115541', '', 0],
    ['Doplňkový', 'Tyčinky', '82933', 'Kus', 0],
    ['Zmrzlina', '1. Zmrzlina', '82953', 'Kopeček', 35],
    ['Zmrzlina', '2. Italská zmrzlina', '87759', '', 0],
    ['Zmrzlina', 'Hot dog', '83711', 'Kus', 45],
    ['Zmrzlina', 'Klobáska', '86909', 'Kus', 90],
    ['Zmrzlina', 'Kukuřice', '86911', 'Kus', 50],
    ['Zmrzlina', 'Miska', '87967', '', 0],
    ['Zmrzlina', 'Popcorn', '83709', 'Kus', 0],
    ['Hračky', 'Brýle', '115547', 'Klasik', 0],
    ['Hračky', 'Brýle', '115547', 'Šnorchl', 0],
    ['Hračky', 'Kruhy', '82927', 'Meloun velký', 0],
    ['Hračky', 'Kruhy', '82927', '[60]', 0],
    ['Hračky', 'Kruhy', '82927', '[80]', 0],
    ['Hračky', 'Lehátko', '117019', '', 0],
    ['Hračky', 'Míček', '82951', 'Malý', 0],
    ['Hračky', 'Míček', '82951', 'Nafukovací', 0],
    ['Hračky', 'Míček', '82951', 'Střední barevný', 0],
    ['Hračky', 'Míček', '82951', 'Velký pěnový', 0],
    ['Hračky', 'Nafukovací tyčky', '115543', '', 0],
    ['Hračky', 'Pistolky', '82709', 'Dlouhá pěnová', 0],
    ['Hračky', 'Pistolky', '82709', 'Kus', 0],
    ['Hračky', 'Pistolky', '82709', 'Zvířátka', 0],
    ['Hračky', 'Plavidlo', '117021', '', 0],
    ['Hračky', 'Přívěšek', '115783', '', 0],
    ['Hračky', 'Rukávky', '115781', '', 0],
    ['Hračky', 'Vesta', '87457', 'L', 0],
    ['Hračky', 'Vesta', '87457', 'M', 0],
    ['Hračky', 'Vesta', '87457', 'S', 0],
    ['Nápoje', 'Cider', '115685', '', 0],
    ['Nápoje', 'Cola', '115691', '', 0],
    ['Nápoje', 'Energy', '115693', '', 0],
    ['Nápoje', 'Jupik', '115555', 'Malý', 0],
    ['Nápoje', 'Jupik', '115555', 'Velký', 0],
    ['Nápoje', 'Kofola', '115689', '', 0],
    ['Nápoje', 'Kubik', '115551', '', 0],
    ['Nápoje', 'Rajec', '115683', '', 0],
    ['Nápoje', 'Vinea', '115687', '', 0]
  ];
  for (let i = 0; i < pcSeed.length; i += 1) {
    const [category, name, pluCode, variantName, priceCzk] = pcSeed[i];
    const exists = await get(
      `SELECT id FROM menu_items
       WHERE menu_scope='pc' AND category=? AND name=? AND plu_code=? AND variant_name=?
       LIMIT 1`,
      [category, name, pluCode, variantName]
    );
    if (exists) continue;
    const resolvedPrice = pcCatalogPrice(name, variantName);
    await run(
      `INSERT INTO menu_items(
        name, category, variant_name, plu_code, menu_scope, price_czk, active, sort_order
      ) VALUES (?, ?, ?, ?, 'pc', ?, 1, ?)`,
      [name, category, variantName, pluCode, czk(resolvedPrice ?? priceCzk), 1000 + i]
    );
  }

  const pcItemsForPriceUpdate = await all(
    `SELECT id, name, variant_name
     FROM menu_items
     WHERE menu_scope='pc'`
  );
  for (const item of pcItemsForPriceUpdate) {
    const price = pcCatalogPrice(item.name, item.variant_name);
    if (price === null) continue;
    await run(
      `UPDATE menu_items
       SET price_czk=?, updated_at=datetime('now')
       WHERE id=?`,
      [czk(price), Number(item.id)]
    );
  }
}

async function requireUser(req, res, next) {
  try {
    const pin = String(req.header('x-pin') || req.body?.pin || req.query?.pin || '').trim();
    if (!pin) return res.status(401).json({ error: 'Zadej PIN.' });
    const user = await get(`SELECT id, name, role, active FROM users WHERE pin=? AND active=1`, [pin]);
    if (!user) return res.status(401).json({ error: 'Neplatný PIN.' });
    req.user = mapUser(user);
    next();
  } catch (e) {
    next(e);
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Jen admin.' });
  next();
}

async function getSaleItems(saleId) {
  const rows = await all(
    `SELECT id, menu_item_id, item_name, category, qty, unit_price_czk, line_total_czk
     FROM sale_items
     WHERE sale_id=?
     ORDER BY id`,
    [Number(saleId)]
  );
  return rows.map((row) => ({
    id: Number(row.id),
    menuItemId: Number(row.menu_item_id || 0),
    itemName: String(row.item_name || ''),
    category: String(row.category || ''),
    qty: Number(row.qty || 0),
    unitPriceCzk: czk(row.unit_price_czk),
    lineTotalCzk: czk(row.line_total_czk)
  }));
}

async function buildSummary({ from, to }) {
  const params = [from, to];
  const sales = await all(
    `SELECT * FROM sales
     WHERE business_date BETWEEN ? AND ?
     ORDER BY datetime(created_at) DESC, id DESC`,
    params
  );
  const activeSales = sales.filter((row) => Number(row.voided || 0) !== 1);
  const voidedSales = sales.filter((row) => Number(row.voided || 0) === 1);

  const byCashier = await all(
    `SELECT cashier_name, COUNT(*) AS sales_count, COALESCE(SUM(total_czk), 0) AS total_czk
     FROM sales
     WHERE voided=0 AND business_date BETWEEN ? AND ?
     GROUP BY cashier_name
     ORDER BY total_czk DESC`,
    params
  );

  const byItem = await all(
    `SELECT si.item_name, si.category, COALESCE(SUM(si.qty), 0) AS qty, COALESCE(SUM(si.line_total_czk), 0) AS total_czk
     FROM sale_items si
     JOIN sales s ON s.id=si.sale_id
     WHERE s.voided=0 AND s.business_date BETWEEN ? AND ?
     GROUP BY si.item_name, si.category
     ORDER BY qty DESC, total_czk DESC`,
    params
  );

  const total = activeSales.reduce((sum, row) => sum + Number(row.total_czk || 0), 0);
  const cash = activeSales
    .filter((row) => String(row.payment_method) === 'cash')
    .reduce((sum, row) => sum + Number(row.total_czk || 0), 0);
  const card = activeSales
    .filter((row) => String(row.payment_method) === 'card')
    .reduce((sum, row) => sum + Number(row.total_czk || 0), 0);
  const voided = voidedSales.reduce((sum, row) => sum + Number(row.total_czk || 0), 0);

  return {
    from,
    to,
    totalCzk: czk(total),
    cashCzk: czk(cash),
    cardCzk: czk(card),
    voidedCzk: czk(voided),
    salesCount: activeSales.length,
    voidedCount: voidedSales.length,
    byCashier: byCashier.map((row) => ({
      cashierName: String(row.cashier_name || ''),
      salesCount: Number(row.sales_count || 0),
      totalCzk: czk(row.total_czk)
    })),
    byItem: byItem.map((row) => ({
      itemName: String(row.item_name || ''),
      category: String(row.category || ''),
      qty: Number(row.qty || 0),
      totalCzk: czk(row.total_czk)
    })),
    sales: sales.map(mapSale)
  };
}

await initDb();

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(rootDir, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, app: 'koupaliste-pos', dbPath });
});

app.post('/api/login', async (req, res, next) => {
  try {
    const pin = String(req.body?.pin || '').trim();
    const user = await get(`SELECT id, name, role, active FROM users WHERE pin=? AND active=1`, [pin]);
    if (!user) return res.status(401).json({ error: 'Neplatný PIN.' });
    res.json({ user: mapUser(user) });
  } catch (e) {
    next(e);
  }
});

app.get('/api/menu', requireUser, async (req, res, next) => {
  try {
    const scope = req.user?.role === 'pc_cashier' ? 'pc' : 'mobile';
    const rows = await all(
      `SELECT id, name, category, variant_name, plu_code, menu_scope, price_czk, active, sort_order
       FROM menu_items
       WHERE active=1 AND menu_scope=?
       ORDER BY sort_order, category, name`
      , [scope]
    );
    res.json({ items: rows.map(mapMenuItem) });
  } catch (e) {
    next(e);
  }
});

app.post('/api/sales', requireUser, async (req, res, next) => {
  try {
    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
    const paymentMethod = String(req.body?.paymentMethod || 'cash') === 'card' ? 'card' : 'cash';
    const cashReceived = req.body?.cashReceivedCzk === '' || req.body?.cashReceivedCzk === null
      ? null
      : Number(req.body?.cashReceivedCzk);
    const cart = [];

    for (const raw of rawItems) {
      const id = Number(raw?.menuItemId || raw?.id || 0);
      const qty = Math.max(0, Math.floor(Number(raw?.qty || 0)));
      if (!id || !qty) continue;
      const item = await get(`SELECT * FROM menu_items WHERE id=? AND active=1`, [id]);
      if (!item) return res.status(400).json({ error: 'Položka už není aktivní.' });
      const unitPrice = czk(item.price_czk);
      cart.push({
        menuItemId: Number(item.id),
        itemName: saleItemName(item),
        category: String(item.category),
        qty,
        unitPriceCzk: unitPrice,
        lineTotalCzk: czk(unitPrice * qty)
      });
    }

    if (cart.length === 0) return res.status(400).json({ error: 'Košík je prázdný.' });
    const total = czk(cart.reduce((sum, item) => sum + item.lineTotalCzk, 0));
    if (paymentMethod === 'cash' && Number.isFinite(cashReceived) && cashReceived < total) {
      return res.status(400).json({ error: 'Přijato je méně než celková částka.' });
    }
    const change = paymentMethod === 'cash' && Number.isFinite(cashReceived) ? czk(cashReceived - total) : null;
    const result = await run(
      `INSERT INTO sales(cashier_id, cashier_name, total_czk, business_date, payment_method, cash_received_czk, change_czk, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        req.user.name,
        total,
        localDateKey(),
        paymentMethod,
        paymentMethod === 'cash' && Number.isFinite(cashReceived) ? czk(cashReceived) : null,
        change,
        String(req.body?.note || '').trim(),
        localDateTimeSql()
      ]
    );
    await run(`UPDATE sales SET sale_no=? WHERE id=?`, [result.id, result.id]);
    for (const item of cart) {
      await run(
        `INSERT INTO sale_items(sale_id, menu_item_id, item_name, category, qty, unit_price_czk, line_total_czk)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [result.id, item.menuItemId, item.itemName, item.category, item.qty, item.unitPriceCzk, item.lineTotalCzk]
      );
    }
    const sale = await get(`SELECT * FROM sales WHERE id=?`, [result.id]);
    res.json({ sale: mapSale(sale), items: await getSaleItems(result.id) });
  } catch (e) {
    next(e);
  }
});

app.get('/api/sales/recent', requireUser, async (_req, res, next) => {
  try {
    const rows = await all(`SELECT * FROM sales ORDER BY datetime(created_at) DESC, id DESC LIMIT 30`);
    const sales = [];
    for (const row of rows) sales.push({ ...mapSale(row), items: await getSaleItems(row.id) });
    res.json({ sales });
  } catch (e) {
    next(e);
  }
});

app.post('/api/sales/:id/void', requireUser, async (req, res, next) => {
  try {
    const id = Number(req.params.id || 0);
    const sale = await get(`SELECT * FROM sales WHERE id=?`, [id]);
    if (!sale) return res.status(404).json({ error: 'Prodej nenalezen.' });
    if (Number(sale.voided || 0) === 1) return res.status(400).json({ error: 'Prodej už je stornovaný.' });
    await run(
      `UPDATE sales
       SET voided=1, voided_at=?, voided_by_id=?, voided_by_name=?, void_reason=?
       WHERE id=?`,
      [localDateTimeSql(), req.user.id, req.user.name, String(req.body?.reason || '').trim(), id]
    );
    const updated = await get(`SELECT * FROM sales WHERE id=?`, [id]);
    res.json({ sale: mapSale(updated), items: await getSaleItems(id) });
  } catch (e) {
    next(e);
  }
});

app.get('/api/admin/summary', requireUser, requireAdmin, async (req, res, next) => {
  try {
    const from = parseDateKey(req.query?.from);
    const to = parseDateKey(req.query?.to || req.query?.from, from);
    res.json(await buildSummary({ from, to }));
  } catch (e) {
    next(e);
  }
});

app.get('/api/admin/menu-items', requireUser, requireAdmin, async (_req, res, next) => {
  try {
    const rows = await all(`SELECT * FROM menu_items ORDER BY active DESC, sort_order, category, name`);
    res.json({ items: rows.map(mapMenuItem) });
  } catch (e) {
    next(e);
  }
});

app.post('/api/admin/menu-items', requireUser, requireAdmin, async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    const category = String(req.body?.category || 'Ostatní').trim() || 'Ostatní';
    const price = Number(req.body?.priceCzk);
    if (!name) return res.status(400).json({ error: 'Chybí název.' });
    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'Neplatná cena.' });
    const result = await run(
      `INSERT INTO menu_items(name, category, variant_name, plu_code, menu_scope, price_czk, active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        name,
        category,
        String(req.body?.variant || req.body?.variantName || '').trim(),
        String(req.body?.pluCode || '').trim(),
        String(req.body?.menuScope || 'mobile').trim() === 'pc' ? 'pc' : 'mobile',
        czk(price),
        Number(req.body?.sortOrder || 100)
      ]
    );
    const row = await get(`SELECT * FROM menu_items WHERE id=?`, [result.id]);
    res.json({ item: mapMenuItem(row) });
  } catch (e) {
    next(e);
  }
});

app.put('/api/admin/menu-items/:id', requireUser, requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id || 0);
    const current = await get(`SELECT * FROM menu_items WHERE id=?`, [id]);
    if (!current) return res.status(404).json({ error: 'Položka nenalezena.' });
    const name = String(req.body?.name ?? current.name).trim();
    const category = String(req.body?.category ?? current.category).trim() || 'Ostatní';
    const variantName = String(req.body?.variant ?? req.body?.variantName ?? current.variant_name ?? '').trim();
    const pluCode = String(req.body?.pluCode ?? current.plu_code ?? '').trim();
    const menuScope = String(req.body?.menuScope ?? current.menu_scope ?? 'mobile').trim() === 'pc' ? 'pc' : 'mobile';
    const price = Number(req.body?.priceCzk ?? current.price_czk);
    const active = req.body?.active === undefined ? Number(current.active || 0) : (req.body.active ? 1 : 0);
    if (!name) return res.status(400).json({ error: 'Chybí název.' });
    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'Neplatná cena.' });
    await run(
      `UPDATE menu_items
       SET name=?, category=?, variant_name=?, plu_code=?, menu_scope=?, price_czk=?, active=?, sort_order=?, updated_at=datetime('now')
       WHERE id=?`,
      [name, category, variantName, pluCode, menuScope, czk(price), active, Number(req.body?.sortOrder ?? current.sort_order ?? 100), id]
    );
    const row = await get(`SELECT * FROM menu_items WHERE id=?`, [id]);
    res.json({ item: mapMenuItem(row) });
  } catch (e) {
    next(e);
  }
});

app.post('/api/admin/close-day', requireUser, requireAdmin, async (req, res, next) => {
  try {
    const date = parseDateKey(req.body?.date);
    const summary = await buildSummary({ from: date, to: date });
    const result = await run(
      `INSERT INTO day_closures(
        business_date, closed_by_id, closed_by_name, total_czk, cash_czk, card_czk,
        voided_czk, sales_count, voided_count, report_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        date,
        req.user.id,
        req.user.name,
        summary.totalCzk,
        summary.cashCzk,
        summary.cardCzk,
        summary.voidedCzk,
        summary.salesCount,
        summary.voidedCount,
        JSON.stringify(summary)
      ]
    );
    res.json({ closureId: result.id, summary });
  } catch (e) {
    next(e);
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: String(err?.message || err || 'Chyba serveru') });
});

app.listen(PORT, HOST, () => {
  console.log(`Koupaliste POS bezi na http://127.0.0.1:${PORT}`);
  console.log(`Data: ${dbPath}`);
});
