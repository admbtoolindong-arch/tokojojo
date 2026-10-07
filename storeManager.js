const fs = require('fs');
const path = require('path');

const VOUCHERS_FILE = path.join(__dirname, 'vouchers.json');
const TRANSACTIONS_FILE = path.join(__dirname, 'transactions.json');
const ORDER_EXPIRE_MINUTES = 30;

// Data awal (Dummy Promo Codes) jika belum ada file
const DEFAULT_VOUCHERS = [
  { id: 1, code: "GDRIVE-PROMO-1TB-01", price: 1000, status: "AVAILABLE", buyer: null, sold_at: null },
  { id: 2, code: "GDRIVE-PROMO-1TB-02", price: 1000, status: "AVAILABLE", buyer: null, sold_at: null },
  { id: 3, code: "GDRIVE-PROMO-1TB-03", price: 1000, status: "AVAILABLE", buyer: null, sold_at: null },
  { id: 4, code: "GDRIVE-PROMO-1TB-04", price: 1000, status: "AVAILABLE", buyer: null, sold_at: null },
  { id: 5, code: "GDRIVE-PROMO-1TB-05", price: 1000, status: "AVAILABLE", buyer: null, sold_at: null },
  { id: 6, code: "GDRIVE-PROMO-1TB-06", price: 1000, status: "AVAILABLE", buyer: null, sold_at: null },
  { id: 7, code: "GDRIVE-PROMO-1TB-07", price: 1000, status: "AVAILABLE", buyer: null, sold_at: null },
  { id: 8, code: "GDRIVE-PROMO-1TB-08", price: 1000, status: "AVAILABLE", buyer: null, sold_at: null },
  { id: 9, code: "GDRIVE-PROMO-1TB-09", price: 1000, status: "AVAILABLE", buyer: null, sold_at: null },
  { id: 10, code: "GDRIVE-PROMO-1TB-10", price: 1000, status: "AVAILABLE", buyer: null, sold_at: null }
];

function initStore() {
  if (!fs.existsSync(VOUCHERS_FILE)) {
    fs.writeFileSync(VOUCHERS_FILE, JSON.stringify(DEFAULT_VOUCHERS, null, 2), 'utf-8');
  }
  if (!fs.existsSync(TRANSACTIONS_FILE)) {
    fs.writeFileSync(TRANSACTIONS_FILE, JSON.stringify([], null, 2), 'utf-8');
  }
}

function getVouchers() {
  initStore();
  try {
    const data = fs.readFileSync(VOUCHERS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return DEFAULT_VOUCHERS;
  }
}

function saveVouchers(vouchers) {
  fs.writeFileSync(VOUCHERS_FILE, JSON.stringify(vouchers, null, 2), 'utf-8');
}

function getTransactions() {
  initStore();
  try {
    const data = fs.readFileSync(TRANSACTIONS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

function saveTransactions(txs) {
  fs.writeFileSync(TRANSACTIONS_FILE, JSON.stringify(txs, null, 2), 'utf-8');
}

function countAvailable() {
  const vouchers = getVouchers();
  return vouchers.filter(v => v.status === 'AVAILABLE').length;
}

function getCurrentPrice() {
  const vouchers = getVouchers();
  const available = vouchers.find(v => v.status === 'AVAILABLE');
  return available ? available.price : 1000;
}

function findPendingOrderByChat(chatId) {
  releaseExpiredOrders();
  const txs = getTransactions();
  return txs.find(t => String(t.chatId) === String(chatId) && t.status === 'PENDING') || null;
}

function reserveVouchers(chatId, qty) {
  releaseExpiredOrders();
  const vouchers = getVouchers();
  const available = vouchers.filter(v => v.status === 'AVAILABLE');

  if (available.length < qty) return null;

  const reserved = [];
  for (let i = 0; i < qty; i++) {
    available[i].status = 'RESERVED';
    available[i].buyer = String(chatId);
    reserved.push({ ...available[i] });
  }

  saveVouchers(vouchers);
  return reserved;
}

function createOrder(chatId, orderId, reservedVouchers, totalAmount) {
  const txs = getTransactions();
  const newTx = {
    orderId,
    chatId: String(chatId),
    codes: reservedVouchers.map(v => v.code),
    amount: totalAmount,
    status: 'PENDING',
    createdAt: new Date().toISOString()
  };
  txs.unshift(newTx);
  saveTransactions(txs);
  return newTx;
}

function cancelOrder(chatId, orderId = null) {
  const txs = getTransactions();
  const vouchers = getVouchers();

  const targetTx = txs.find(t => {
    const isChat = String(t.chatId) === String(chatId);
    const isPending = t.status === 'PENDING';
    const isOrder = orderId ? t.orderId === orderId : true;
    return isChat && isPending && isOrder;
  });

  if (!targetTx) return null;

  targetTx.status = 'CANCELLED';
  targetTx.cancelledAt = new Date().toISOString();

  // Kembalikan voucher ke AVAILABLE
  for (const code of targetTx.codes) {
    const v = vouchers.find(item => item.code === code);
    if (v) {
      v.status = 'AVAILABLE';
      v.buyer = null;
    }
  }

  saveTransactions(txs);
  saveVouchers(vouchers);
  return targetTx;
}

function confirmOrderPayment(orderId) {
  const txs = getTransactions();
  const vouchers = getVouchers();

  const targetTx = txs.find(t => t.orderId === orderId && t.status === 'PENDING');
  if (!targetTx) return null;

  targetTx.status = 'SUCCESS';
  targetTx.paidAt = new Date().toISOString();

  for (const code of targetTx.codes) {
    const v = vouchers.find(item => item.code === code);
    if (v) {
      v.status = 'SOLD';
      v.buyer = targetTx.chatId;
      v.sold_at = new Date().toISOString();
    }
  }

  saveTransactions(txs);
  saveVouchers(vouchers);
  return targetTx;
}

function releaseExpiredOrders() {
  const txs = getTransactions();
  const vouchers = getVouchers();
  const now = Date.now();
  let changed = false;

  for (const t of txs) {
    if (t.status === 'PENDING') {
      const created = new Date(t.createdAt).getTime();
      if (now - created > ORDER_EXPIRE_MINUTES * 60000) {
        t.status = 'EXPIRED';
        for (const code of t.codes) {
          const v = vouchers.find(item => item.code === code);
          if (v && v.status === 'RESERVED') {
            v.status = 'AVAILABLE';
            v.buyer = null;
          }
        }
        changed = true;
      }
    }
  }

  if (changed) {
    saveTransactions(txs);
    saveVouchers(vouchers);
  }
}

// Generate kode unik acak 1..299 yang belum aktif di order pending lain
function getAvailableUniqueCode(basePrice, min = 1, max = 299) {
  const txs = getTransactions();
  const activeAmounts = new Set(txs.filter(t => t.status === 'PENDING').map(t => t.amount));

  for (let i = 0; i < 50; i++) {
    const code = Math.floor(Math.random() * (max - min + 1)) + min;
    if (!activeAmounts.has(basePrice + code)) {
      return code;
    }
  }
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Tambah voucher baru oleh admin
function addVouchers(codes, price = 1000) {
  const vouchers = getVouchers();
  let maxId = vouchers.reduce((max, v) => (v.id > max ? v.id : max), 0);

  const added = [];
  for (const code of codes) {
    const cleanCode = code.trim();
    if (cleanCode && !vouchers.some(v => v.code === cleanCode)) {
      maxId++;
      const newV = {
        id: maxId,
        code: cleanCode,
        price: parseInt(price, 10) || 15000,
        status: 'AVAILABLE',
        buyer: null,
        sold_at: null
      };
      vouchers.push(newV);
      added.push(newV);
    }
  }

  saveVouchers(vouchers);
  return added;
}

module.exports = {
  initStore,
  getVouchers,
  countAvailable,
  getCurrentPrice,
  findPendingOrderByChat,
  reserveVouchers,
  createOrder,
  cancelOrder,
  confirmOrderPayment,
  releaseExpiredOrders,
  getAvailableUniqueCode,
  addVouchers
};
