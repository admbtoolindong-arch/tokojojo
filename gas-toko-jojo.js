// =========================================================================
// GOOGLE APPS SCRIPT: TOKO DIGITAL JOJO (DENGAN INTEGRASI GOPAY GATEWAY)
// =========================================================================
// Salin seluruh isi file ini ke Google Apps Script (script.google.com)
// yang terhubung dengan Google Spreadsheet toko Anda.
// =========================================================================

const BOT_TOKEN    = "8263331940:AAHcB-HFAufz4imo8mN5xSpw2kHHlEuxuyo";
const BOT_USERNAME = "@tokojojo_bot";

// Chat ID admin (Anda)
const ADMIN_CHAT_ID = "8909142626";

// Username/ID channel bukti transaksi (bot harus jadi admin). Kosongkan jika belum ada.
const CHANNEL_ID = "@tokojojo";

// Kunci rahasia untuk webhook pembayaran (harus sama dengan WEBHOOK_SECRET di .env gateway)
const WEBHOOK_SECRET = "jojo-rahasia-8f3k2m9x";

// Batas waktu pembayaran (menit). Lewat dari ini, kode kembali AVAILABLE.
const ORDER_EXPIRE_MINUTES = 30;

// QRIS Statis (Mas Mas IT, SIDOREJO - SEMARANG)
const STATIC_QRIS = "00020101021126610014COM.GO-JEK.WWW01189360091433116303860210G3116303860303UMI51440014ID.CO.QRIS.WWW0215ID10253706262240303UMI5204581553033605802ID5920Mas Mas IT, SIDOREJO6008SEMARANG61055071562140703A01110362163040916";

// URL GoPay Payment Gateway Anda (Tiarina Cloud / Hosting / Ngrok)
// Contoh Tiarina Cloud: "https://tokojojo-a382be1azimtl5l.sg-sin1.tiarinacloud.app"
// Kosongkan "" jika sedang offline / menggunakan QRIS generator lokal fallback
const GOPAY_GATEWAY_URL = "https://tokojojo-a382be1azimtl5l.sg-sin1.tiarinacloud.app";
const GOPAY_API_KEY     = "local_secret_12345"; // Sesuaikan dengan API_KEY di .env gateway Anda

// Kolom sheet (index 0-based)
const V = { ID: 0, CODE: 1, PRICE: 2, STATUS: 3, BUYER: 4, SOLD_AT: 5 };
const T = { TIME: 0, ORDER: 1, CHAT: 2, CODE: 3, AMOUNT: 4, STATUS: 5 };

// =========================================================================
// WEBHOOK UTAMA (MENERIMA DARI TELEGRAM & GOPAY GATEWAY)
// =========================================================================
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) return;
    const data = JSON.parse(e.postData.contents);

    // 1. Tangani Webhook Telegram
    if (data.update_id) {
      const cache = CacheService.getScriptCache();
      const key = "upd_" + data.update_id;
      if (cache.get(key)) return;
      cache.put(key, "1", 21600);
    }

    if (data.message) {
      handleTelegramMessage(data.message);
    } 
    // 2. Tangani Webhook Notifikasi Pembayaran dari GoPay Gateway
    else if (data.order_id && data.status) {
      if (data.secret !== WEBHOOK_SECRET) {
        console.warn("Ditolak: WEBHOOK_SECRET tidak cocok.");
        return;
      }
      if (data.status === "PAID" || data.status === "SUCCESS") {
        confirmPayment(data.order_id);
      }
    }
  } catch (err) {
    console.error("doPost error: " + err);
  }
}

// Untuk cek di browser bahwa Web App aktif
function doGet() {
  return HtmlService.createHtmlOutput("Bot TOKO DIGITAL JOJO aktif & terhubung GoPay Gateway.");
}

// =========================================================================
// PESAN TELEGRAM
// =========================================================================
function handleTelegramMessage(msg) {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();
  const cmd = text.split(" ")[0].toLowerCase().replace(BOT_USERNAME.toLowerCase(), "");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const voucherSheet = getOrCreateSheet(ss, "Vouchers");
  const txSheet = getOrCreateSheet(ss, "Transactions");

  switch (cmd) {
    case "/start":
    case "/stok":
    case "/help": {
      releaseExpiredOrders();
      const count = countAvailable(voucherSheet);
      const price = getCurrentPrice(voucherSheet);
      sendMessage(chatId,
        `👋 Selamat datang di *TOKO DIGITAL JOJO*!\n\n` +
        `📦 Stok Kode Promo: *${count} Pcs*\n` +
        (price ? `💰 Harga: *${formatRp(price)}*\n` : "") +
        `\nPerintah:\n` +
        `👉 /beli - Beli 1 kode promo\n` +
        `👉 /stok - Cek stok`
      );
      return;
    }

    case "/myid":
      sendMessage(chatId, `🆔 Chat ID Anda: \`${chatId}\``);
      return;

    case "/beli":
      handleBuy(chatId, voucherSheet, txSheet);
      return;

    case "/konfirmasi": {
      if (String(chatId) !== String(ADMIN_CHAT_ID)) return; // hanya admin
      const orderId = text.split(" ")[1];
      if (!orderId) {
        sendMessage(chatId, "Format: `/konfirmasi TX-1234567890`");
        return;
      }
      const ok = confirmPayment(orderId);
      sendMessage(chatId, ok
        ? `✅ Order \`${orderId}\` dikonfirmasi & kode sudah dikirim.`
        : `❌ Order \`${orderId}\` tidak ditemukan / bukan PENDING.`);
      return;
    }

    default:
      sendMessage(chatId, "Ketik /start untuk melihat menu.");
  }
}

// =========================================================================
// PROSES PEMBELIAN (OTOMATIS DAFTAR KE GOPAY GATEWAY)
// =========================================================================
function handleBuy(chatId, voucherSheet, txSheet) {
  releaseExpiredOrders();

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let voucher, orderId;
  try {
    // Cegah 1 user punya banyak order PENDING sekaligus
    const pending = findPendingOrderByChat(txSheet, chatId);
    if (pending) {
      sendMessage(chatId,
        `⏳ Anda masih punya order belum dibayar: \`${pending}\`\n` +
        `Selesaikan pembayaran dulu atau tunggu ${ORDER_EXPIRE_MINUTES} menit hingga kedaluwarsa.`);
      return;
    }

    voucher = reserveVoucher(voucherSheet, chatId);
    if (!voucher) {
      sendMessage(chatId, "❌ *Maaf, stok Kode Promo sedang HABIS.* Silakan cek lagi nanti.");
      return;
    }

    orderId = "TX-" + Date.now();
    txSheet.appendRow([new Date(), orderId, chatId, voucher.code, voucher.price, "PENDING"]);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  // Daftarkan order ke GoPay Payment Gateway agar otomatis dipantau di background
  let dynamicQris = "";
  let paymentUrl  = "";

  if (GOPAY_GATEWAY_URL) {
    try {
      const res = UrlFetchApp.fetch(GOPAY_GATEWAY_URL + "/create-qris", {
        method: "post",
        contentType: "application/json",
        headers: { "x-api-key": GOPAY_API_KEY },
        payload: JSON.stringify({
          amount: voucher.price,
          order_id: orderId,
          expire_minutes: ORDER_EXPIRE_MINUTES
        }),
        muteHttpExceptions: true
      });

      if (res.getResponseCode() === 200) {
        const json = JSON.parse(res.getContentText());
        if (json.success && json.data) {
          dynamicQris = json.data.qris_code;
          paymentUrl  = json.data.qris_url;
        }
      }
    } catch (e) {
      console.warn("Gagal request ke GoPay Gateway, menggunakan generator internal: " + e);
    }
  }

  // Fallback jika gateway sedang tidak terjangkau
  if (!dynamicQris) {
    dynamicQris = convertToDynamicQRIS(STATIC_QRIS, voucher.price);
  }

  const qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=10&data=" + encodeURIComponent(dynamicQris);

  let caption = 
    `📲 *ORDER KODE PROMO*\n\n` +
    `🆔 Order ID: \`${orderId}\`\n` +
    `💰 Total: *${formatRp(voucher.price)}*\n` +
    `📌 Merchant: *Mas Mas IT, SIDOREJO*\n` +
    `⏳ Batas bayar: *${ORDER_EXPIRE_MINUTES} menit*\n\n` +
    `Scan QR di atas dengan GoPay, OVO, DANA, ShopeePay, atau m-Banking.\n`;

  if (paymentUrl) {
    caption += `🌐 Cek Status / Bayar via Web:\n${paymentUrl}\n\n`;
  }
  caption += `⚡ *Kode promo dikirim OTOMATIS* setelah pembayaran Anda terverifikasi oleh gateway.`;

  sendPhoto(chatId, qrUrl, caption);

  if (ADMIN_CHAT_ID) {
    sendMessage(ADMIN_CHAT_ID,
      `🛎 *Order Baru Masuk*\n🆔 \`${orderId}\`\n💰 ${formatRp(voucher.price)}\n👤 \`${chatId}\`\n\n` +
      `⚡ *Auto-Watcher Aktif:* Gateway akan konfirmasi otomatis jika pembayaran masuk.\n` +
      `Manual fallback: \`/konfirmasi ${orderId}\``);
  }

  if (CHANNEL_ID) {
    postNewOrderToChannel(orderId, voucher.price, chatId);
  }
}

function postNewOrderToChannel(orderId, amount, chatId) {
  const masked = String(chatId).substring(0, 4) + "****";
  const time = Utilities.formatDate(new Date(), "Asia/Jakarta", "dd MMM yyyy, HH:mm") + " WIB";
  sendMessage(CHANNEL_ID,
    `🛎 *ORDER BARU MASUK*\n\n` +
    `🆔 Order: \`${orderId}\`\n` +
    `🛍️ Produk: *Kode Promo*\n` +
    `💰 Total: *${formatRp(amount)}*\n` +
    `👤 Pembeli: \`${masked}\`\n` +
    `🕒 ${time}\n` +
    `⏳ Status: *Menunggu Pembayaran*\n\n` +
    `🛒 Order via ${BOT_USERNAME}`
  );
}

// =========================================================================
// KONFIRMASI PEMBAYARAN (DIPANGGIL OTOMATIS OLEH WEBHOOK GOPAY GATEWAY)
// =========================================================================
function confirmPayment(orderId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const txSheet = getOrCreateSheet(ss, "Transactions");
  const voucherSheet = getOrCreateSheet(ss, "Vouchers");

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let chatId, code, amount;
  try {
    const rows = txSheet.getDataRange().getValues();
    let found = -1;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][T.ORDER]) === String(orderId) && rows[i][T.STATUS] === "PENDING") {
        found = i; break;
      }
    }
    if (found === -1) return false;

    chatId = rows[found][T.CHAT];
    code   = rows[found][T.CODE];
    amount = rows[found][T.AMOUNT]; // nominal diambil dari sheet

    txSheet.getRange(found + 1, T.STATUS + 1).setValue("SUCCESS");
    setVoucherStatus(voucherSheet, code, "SOLD", chatId);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  sendMessage(chatId,
    `🎉 *PEMBAYARAN BERHASIL!*\n\n` +
    `Terima kasih telah berbelanja *${formatRp(amount)}* di TOKO DIGITAL JOJO.\n\n` +
    `🔑 *KODE PROMO ANDA:*\n\`${code}\`\n\n` +
    `_Ketuk kode di atas untuk menyalin._`
  );

  if (CHANNEL_ID) postToChannel(orderId, amount, chatId);
  return true;
}

function postToChannel(orderId, amount, chatId) {
  const masked = String(chatId).substring(0, 4) + "****";
  const time = Utilities.formatDate(new Date(), "Asia/Jakarta", "dd MMM yyyy, HH:mm") + " WIB";
  sendMessage(CHANNEL_ID,
    `🎉 *TRANSAKSI BERHASIL!*\n\n` +
    `🆔 Order: \`${orderId}\`\n` +
    `🛍️ Produk: *Kode Promo*\n` +
    `💰 Total: *${formatRp(amount)}*\n` +
    `👤 Pembeli: \`${masked}\`\n` +
    `🕒 ${time}\n\n` +
    `✅ Kode terkirim otomatis!\n` +
    `🛒 Order via ${BOT_USERNAME}`
  );
}

// =========================================================================
// ORDER KEDALUWARSA → kembalikan stok
// =========================================================================
function releaseExpiredOrders() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const txSheet = getOrCreateSheet(ss, "Transactions");
  const voucherSheet = getOrCreateSheet(ss, "Vouchers");
  const rows = txSheet.getDataRange().getValues();
  const now = Date.now();

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][T.STATUS] !== "PENDING") continue;
    const created = new Date(rows[i][T.TIME]).getTime();
    if (now - created > ORDER_EXPIRE_MINUTES * 60000) {
      txSheet.getRange(i + 1, T.STATUS + 1).setValue("EXPIRED");
      setVoucherStatus(voucherSheet, rows[i][T.CODE], "AVAILABLE", "");
    }
  }
}

// =========================================================================
// HELPER GOOGLE SHEETS
// =========================================================================
function getOrCreateSheet(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (name === "Vouchers") {
      sheet.appendRow(["ID", "Code", "Price", "Status", "Buyer_Telegram_ID", "Sold_At"]);
    } else if (name === "Transactions") {
      sheet.appendRow(["Timestamp", "Order_ID", "Telegram_ID", "Voucher_Code", "Amount", "Status"]);
    }
  }
  return sheet;
}

function normStatus(v) {
  return String(v || "").trim().toUpperCase();
}

function countAvailable(sheet) {
  const rows = sheet.getDataRange().getValues();
  let n = 0;
  for (let i = 1; i < rows.length; i++) if (normStatus(rows[i][V.STATUS]) === "AVAILABLE") n++;
  return n;
}

function getCurrentPrice(sheet) {
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (normStatus(rows[i][V.STATUS]) === "AVAILABLE") return parseInt(rows[i][V.PRICE]) || 0;
  }
  return 0;
}

function reserveVoucher(sheet, chatId) {
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (normStatus(rows[i][V.STATUS]) === "AVAILABLE") {
      sheet.getRange(i + 1, V.STATUS + 1).setValue("RESERVED");
      sheet.getRange(i + 1, V.BUYER + 1).setValue(chatId);
      return { code: String(rows[i][V.CODE]).trim(), price: parseInt(rows[i][V.PRICE]) || 15000 };
    }
  }
  return null;
}

function setVoucherStatus(sheet, code, status, chatId) {
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][V.CODE]).trim() === String(code).trim()) {
      sheet.getRange(i + 1, V.STATUS + 1).setValue(status);
      sheet.getRange(i + 1, V.BUYER + 1).setValue(chatId);
      sheet.getRange(i + 1, V.SOLD_AT + 1).setValue(status === "SOLD" ? new Date() : "");
      return;
    }
  }
}

function findPendingOrderByChat(sheet, chatId) {
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][T.CHAT]) === String(chatId) && rows[i][T.STATUS] === "PENDING") {
      return rows[i][T.ORDER];
    }
  }
  return null;
}

// =========================================================================
// QRIS STATIS → DINAMIS + CRC16
// =========================================================================
function convertToDynamicQRIS(staticQris, amount) {
  let base = staticQris.substring(0, staticQris.length - 8); // buang "6304XXXX"
  base = base.replace("010211", "010212");                   // statis → dinamis
  const amt = String(amount);
  const tag54 = "54" + String(amt.length).padStart(2, "0") + amt;
  const idx = base.indexOf("5802ID");
  const payload = base.slice(0, idx) + tag54 + base.slice(idx) + "6304";
  return payload + crc16(payload);
}

function crc16(str) {
  let crc = 0xFFFF;
  for (let c = 0; c < str.length; c++) {
    crc ^= str.charCodeAt(c) << 8;
    for (let i = 0; i < 8; i++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

// =========================================================================
// TELEGRAM API
// =========================================================================
function formatRp(n) {
  return "Rp " + Number(n).toLocaleString("id-ID");
}

function tg(method, payload) {
  const res = UrlFetchApp.fetch("https://api.telegram.org/bot" + BOT_TOKEN + "/" + method, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) console.error(method + " gagal: " + res.getContentText());
  return res;
}

function sendMessage(chatId, text) {
  return tg("sendMessage", { chat_id: chatId, text: text, parse_mode: "Markdown" });
}

function sendPhoto(chatId, photoUrl, caption) {
  return tg("sendPhoto", { chat_id: chatId, photo: photoUrl, caption: caption, parse_mode: "Markdown" });
}

// =========================================================================
// UTILITAS
// =========================================================================
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  getOrCreateSheet(ss, "Vouchers");
  getOrCreateSheet(ss, "Transactions");
}

function resetWebhook() {
  const url = ScriptApp.getService().getUrl();
  const res = UrlFetchApp.fetch("https://api.telegram.org/bot" + BOT_TOKEN +
    "/setWebhook?drop_pending_updates=true&url=" + encodeURIComponent(url));
  console.log(res.getContentText());
}
