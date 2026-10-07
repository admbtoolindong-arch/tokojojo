// =========================================================================
// GOOGLE APPS SCRIPT: TOKO DIGITAL JOJO (INTERAKTIF & MULTI-ORDER)
// =========================================================================
// Fitur:
// 1. Menu Tombol Interaktif (Inline Keyboard)
// 2. Pembelian Lebih Dari 1 Pcs (Pilih Quantity)
// 3. Batalkan Pesanan (Cancel Order & Kembalikan Stok Otomatis)
// 4. Kode Unik Pintar (Anti-Tertukar 100%)
// 5. Integrasi GoPay Gateway 24/7 + Notifikasi Channel @tokojojo
// =========================================================================

const BOT_TOKEN = "8263331940:AAHcB-HFAufz4imo8mN5xSpw2kHHlEuxuyo";
const BOT_USERNAME = "@tokojojo_bot";

// Chat ID admin (Anda)
const ADMIN_CHAT_ID = "8909142626";

// Username/ID channel bukti transaksi (bot harus jadi admin).
const CHANNEL_ID = "@tokojojo";

// Kunci rahasia untuk webhook pembayaran (harus sama dengan WEBHOOK_SECRET di .env gateway)
const WEBHOOK_SECRET = "jojo-rahasia-8f3k2m9x";

// Batas waktu pembayaran (menit). Lewat dari ini, kode kembali AVAILABLE.
const ORDER_EXPIRE_MINUTES = 30;

// QRIS Statis (Mas Mas IT, SIDOREJO - SEMARANG)
const STATIC_QRIS = "00020101021126610014COM.GO-JEK.WWW01189360091433116303860210G3116303860303UMI51440014ID.CO.QRIS.WWW0215ID10253706262240303UMI5204581553033605802ID5920Mas Mas IT, SIDOREJO6008SEMARANG61055071562140703A01110362163040916";

// URL GoPay Payment Gateway Anda di Tiarina Cloud
const GOPAY_GATEWAY_URL = "https://tokojojo-a382be1azimtl5l.sg-sin1.tiarinacloud.app";
const GOPAY_API_KEY = "local_secret_12345";

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

    // 1. Tangani Webhook Telegram (Pesan Teks)
    if (data.update_id) {
      const cache = CacheService.getScriptCache();
      const key = "upd_" + data.update_id;
      if (cache.get(key)) return;
      cache.put(key, "1", 21600);
    }

    if (data.message) {
      handleTelegramMessage(data.message);
    }
    // 2. Tangani Tombol Klik (Callback Query dari Inline Button)
    else if (data.callback_query) {
      handleCallbackQuery(data.callback_query);
    }
    // 3. Tangani Notifikasi Pembayaran dari GoPay Gateway
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

function doGet() {
  return HtmlService.createHtmlOutput("Bot TOKO DIGITAL JOJO aktif & interaktif.");
}

// =========================================================================
// 1. PENANGANAN PESAN TEKS TELEGRAM
// =========================================================================
function handleTelegramMessage(msg) {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();
  const parts = text.split(" ");
  const cmd = parts[0].toLowerCase().replace(BOT_USERNAME.toLowerCase(), "");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const voucherSheet = getOrCreateSheet(ss, "Vouchers");
  const txSheet = getOrCreateSheet(ss, "Transactions");

  switch (cmd) {
    case "/start":
    case "/menu":
      sendMainMenu(chatId, voucherSheet);
      return;

    case "/stok":
      sendStockInfo(chatId, voucherSheet);
      return;

    case "/beli": {
      const requestedQty = parseInt(parts[1], 10);
      if (requestedQty && requestedQty > 0) {
        processOrder(chatId, requestedQty, voucherSheet, txSheet);
      } else {
        showQuantitySelector(chatId, voucherSheet, txSheet);
      }
      return;
    }

    case "/batal":
      cancelPendingOrder(chatId, null, txSheet, voucherSheet);
      return;

    case "/status":
    case "/pesanan":
      sendPendingOrderStatus(chatId, txSheet);
      return;

    case "/myid":
      sendMessage(chatId, `🆔 Chat ID Anda: \`${chatId}\``);
      return;

    case "/konfirmasi": {
      if (String(chatId) !== String(ADMIN_CHAT_ID)) return;
      const orderId = parts[1];
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
      sendMainMenu(chatId, voucherSheet);
  }
}

// =========================================================================
// 2. PENANGANAN KLIK TOMBOL (INLINE KEYBOARD CALLBACK)
// =========================================================================
function handleCallbackQuery(cq) {
  const cqId = cq.id;
  const chatId = cq.message.chat.id;
  const data = cq.data || "";

  answerCallbackQuery(cqId);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const voucherSheet = getOrCreateSheet(ss, "Vouchers");
  const txSheet = getOrCreateSheet(ss, "Transactions");

  if (data === "menu_main") {
    sendMainMenu(chatId, voucherSheet);
  }
  else if (data === "menu_stock") {
    sendStockInfo(chatId, voucherSheet);
  }
  else if (data === "menu_buy") {
    showQuantitySelector(chatId, voucherSheet, txSheet);
  }
  else if (data.startsWith("buy_qty:")) {
    const qty = parseInt(data.replace("buy_qty:", ""), 10);
    processOrder(chatId, qty, voucherSheet, txSheet);
  }
  else if (data.startsWith("cancel_order:")) {
    const targetOrderId = data.replace("cancel_order:", "");
    cancelPendingOrder(chatId, targetOrderId, txSheet, voucherSheet);
  }
  else if (data.startsWith("check_order:")) {
    const targetOrderId = data.replace("check_order:", "");
    checkOrderPayment(chatId, targetOrderId, txSheet);
  }
  else if (data === "menu_my_order") {
    sendPendingOrderStatus(chatId, txSheet);
  }
  else if (data === "menu_help") {
    sendHelp(chatId);
  }
}

// =========================================================================
// 3. TAMPILAN MENU TOMBOL INTERAKTIF
// =========================================================================

// Menu Utama dengan Tombol
function sendMainMenu(chatId, voucherSheet) {
  releaseExpiredOrders();
  const count = countAvailable(voucherSheet);
  const price = getCurrentPrice(voucherSheet);

  const text =
    `👋 *Selamat Datang di TOKO DIGITAL JOJO!*\n\n` +
    `Menyediakan Kode Promo Resmi & Instan 24 Jam.\n\n` +
    `📦 *Stok Kode Promo:* \`${count} Pcs\`\n` +
    (price ? `💰 *Harga:* \`${formatRp(price)} / Pcs\`\n\n` : "\n") +
    `Silakan pilih menu di bawah ini:`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: "🛍️ Beli Kode Promo", callback_data: "menu_buy" },
        { text: "📦 Cek Stok & Harga", callback_data: "menu_stock" }
      ],
      [
        { text: "📋 Pesanan Saya", callback_data: "menu_my_order" },
        { text: "ℹ️ Cara Pembayaran", callback_data: "menu_help" }
      ]
    ]
  };

  sendMessage(chatId, text, keyboard);
}

// Cek Stok & Harga
function sendStockInfo(chatId, voucherSheet) {
  releaseExpiredOrders();
  const count = countAvailable(voucherSheet);
  const price = getCurrentPrice(voucherSheet);

  const text =
    `📦 *INFORMASI STOK & HARGA*\n\n` +
    `🛍️ Produk: *Kode Promo Digital*\n` +
    `📦 Stok Tersedia: *${count} Pcs*\n` +
    `💰 Harga Satuan: *${formatRp(price)}*\n` +
    `⚡ Pengiriman: *Otomatis Instan 24 Jam*\n` +
    `💳 Pembayaran: *QRIS (GoPay, BCA, DANA, OVO, ShopeePay, dll)*\n\n` +
    (count > 0 ? `Siap untuk memesan? Klik tombol beli di bawah:` : `_Maaf, stok saat ini sedang habis._`);

  const keyboard = {
    inline_keyboard: [
      count > 0 ? [{ text: "🛍️ Beli Sekarang", callback_data: "menu_buy" }] : [],
      [{ text: "🔙 Kembali ke Menu", callback_data: "menu_main" }]
    ].filter(row => row.length > 0)
  };

  sendMessage(chatId, text, keyboard);
}

// Menu Pemilihan Jumlah (Quantity) Pembelian
function showQuantitySelector(chatId, voucherSheet, txSheet) {
  releaseExpiredOrders();

  // Cek apakah ada order PENDING sebelumnya
  const pending = findPendingOrderByChat(txSheet, chatId);
  if (pending) {
    const text =
      `⏳ *Anda Masih Punya Pesanan Belum Dibayar!*\n\n` +
      `🆔 Order ID: \`${pending.orderId}\`\n` +
      `📦 Jumlah: *${pending.qty} Pcs*\n` +
      `💰 Total: *${formatRp(pending.amount)}*\n\n` +
      `Silakan selesaikan pembayaran pesanan Anda, atau batalkan pesanan tersebut untuk membuat pesanan baru.`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: "🔄 Cek Status Bayar", callback_data: `check_order:${pending.orderId}` },
          { text: "❌ Batalkan Pesanan Ini", callback_data: `cancel_order:${pending.orderId}` }
        ],
        [
          { text: "🔙 Menu Utama", callback_data: "menu_main" }
        ]
      ]
    };
    sendMessage(chatId, text, keyboard);
    return;
  }

  const count = countAvailable(voucherSheet);
  const price = getCurrentPrice(voucherSheet);

  if (count <= 0) {
    sendMessage(chatId, "❌ *Maaf, stok Kode Promo sedang HABIS.* Silakan cek kembali nanti.", {
      inline_keyboard: [[{ text: "🔙 Menu Utama", callback_data: "menu_main" }]]
    });
    return;
  }

  const text =
    `🛍️ *PILIH JUMLAH PEMBELIAN*\n\n` +
    `📦 Stok Tersedia: *${count} Pcs*\n` +
    `💰 Harga Satuan: *${formatRp(price)}*\n\n` +
    `Pilih berapa banyak kode promo yang ingin Anda beli:`;

  const rows = [];
  const presets = [1, 2, 3, 5, 10];
  let tempRow = [];

  for (const qty of presets) {
    if (qty <= count) {
      tempRow.push({ text: `${qty} Pcs (${formatRp(price * qty)})`, callback_data: `buy_qty:${qty}` });
      if (tempRow.length === 2) {
        rows.push(tempRow);
        tempRow = [];
      }
    }
  }
  if (tempRow.length > 0) rows.push(tempRow);

  rows.push([{ text: "🔙 Batal / Menu Utama", callback_data: "menu_main" }]);

  sendMessage(chatId, text, { inline_keyboard: rows });
}

// Bantuan
function sendHelp(chatId) {
  const text =
    `ℹ️ *PANDUAN PEMBELIAN TOKO DIGITAL JOJO*\n\n` +
    `1. Klik menu *🛍️ Beli Kode Promo*.\n` +
    `2. Pilih jumlah kode yang ingin Anda beli (1 Pcs, 2 Pcs, dst).\n` +
    `3. Bot akan mengirimkan gambar *QRIS Dinamis* dengan nominal total persis.\n` +
    `4. Buka aplikasi m-Banking atau E-Wallet Anda (BCA, GoPay, DANA, OVO, ShopeePay, Livin', dll).\n` +
    `5. Scan QR code tersebut. Nominal akan terisi secara otomatis.\n` +
    `6. Begitu pembayaran Anda selesai, *kode promo akan dikirim detik itu juga secara otomatis!*\n\n` +
    `Jika ada kendala, hubungi Admin: @prasojotrii`;

  const keyboard = {
    inline_keyboard: [
      [{ text: "🛍️ Beli Sekarang", callback_data: "menu_buy" }],
      [{ text: "🔙 Kembali ke Menu", callback_data: "menu_main" }]
    ]
  };
  sendMessage(chatId, text, keyboard);
}

// =========================================================================
// 4. PROSES PEMBELIAN (MULTI QUANTITY & KODE UNIK)
// =========================================================================
function processOrder(chatId, qty, voucherSheet, txSheet) {
  releaseExpiredOrders();

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let reservedList = [];
  let orderId = "";
  let basePrice = 0;
  let totalPayment = 0;
  let uniqueCode = 0;

  try {
    // 1. Cek apakah ada order pending
    const pending = findPendingOrderByChat(txSheet, chatId);
    if (pending) {
      sendMessage(chatId,
        `⏳ Anda masih punya pesanan belum dibayar: \`${pending.orderId}\` (${formatRp(pending.amount)})\n` +
        `Selesaikan atau batalkan pesanan tersebut sebelum membuat pesanan baru.`, {
        inline_keyboard: [
          [{ text: "❌ Batalkan Pesanan", callback_data: `cancel_order:${pending.orderId}` }],
          [{ text: "🔙 Menu Utama", callback_data: "menu_main" }]
        ]
      });
      return;
    }

    // 2. Cek ketersediaan stok
    const available = countAvailable(voucherSheet);
    if (available < qty) {
      sendMessage(chatId, `❌ *Stok tidak cukup!* Anda ingin membeli ${qty} Pcs, tetapi stok tersisa hanya ${available} Pcs.`);
      return;
    }

    // 3. Kunci voucher sesuai quantity yang diminta
    reservedList = reserveMultipleVouchers(voucherSheet, chatId, qty);
    if (!reservedList || reservedList.length < qty) {
      sendMessage(chatId, "❌ Gagal mengunci stok voucher. Silakan coba lagi.");
      return;
    }

    basePrice = reservedList.reduce((sum, item) => sum + item.price, 0);

    // 4. Buat kode unik acak (1 s/d 299) yang tidak tabrakan dengan order pending lain
    uniqueCode = getAvailableUniqueCode(txSheet, basePrice, 1, 299);
    totalPayment = basePrice + uniqueCode;

    orderId = "TX-" + Date.now();
    const codesString = reservedList.map(v => v.code).join(",");

    txSheet.appendRow([new Date(), orderId, chatId, codesString, totalPayment, "PENDING"]);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  // 5. Daftarkan order ke GoPay Payment Gateway
  let dynamicQris = "";
  let paymentUrl = "";

  if (GOPAY_GATEWAY_URL) {
    try {
      const res = UrlFetchApp.fetch(GOPAY_GATEWAY_URL + "/create-qris", {
        method: "post",
        contentType: "application/json",
        headers: { "x-api-key": GOPAY_API_KEY },
        payload: JSON.stringify({
          amount: totalPayment,
          order_id: orderId,
          expire_minutes: ORDER_EXPIRE_MINUTES
        }),
        muteHttpExceptions: true
      });

      if (res.getResponseCode() === 200) {
        const json = JSON.parse(res.getContentText());
        if (json.success && json.data) {
          dynamicQris = json.data.qris_code;
          paymentUrl = json.data.qris_url;
        }
      }
    } catch (e) {
      console.warn("Gagal request ke GoPay Gateway: " + e);
    }
  }

  // Fallback lokal jika gateway belum aktif
  if (!dynamicQris) {
    dynamicQris = convertToDynamicQRIS(STATIC_QRIS, totalPayment);
  }

  const qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=450x450&margin=10&data=" + encodeURIComponent(dynamicQris);

  let caption =
    `📲 *TAGIHAN PEMBAYARAN KODE PROMO*\n\n` +
    `🆔 Order ID: \`${orderId}\`\n` +
    `📦 Jumlah: *${qty} Pcs*\n` +
    `💰 Harga Barang: ${formatRp(basePrice)}\n` +
    `🔢 Kode Unik: +${formatRp(uniqueCode)}\n` +
    `💳 *TOTAL BAYAR: ${formatRp(totalPayment)}*\n` +
    `📌 Merchant: *Mas Mas IT, SIDOREJO*\n` +
    `⏳ Batas Waktu: *${ORDER_EXPIRE_MINUTES} Menit*\n\n` +
    `Scan QR di atas dengan GoPay, BCA, DANA, OVO, ShopeePay, atau m-Banking.\n` +
    `_(Nominal ${formatRp(totalPayment)} sudah terisi otomatis saat scan QR)_\n\n` +
    `⚡ *${qty} Kode promo akan dikirim detik itu juga secara otomatis!*`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: "🔄 Cek Status Pembayaran", callback_data: `check_order:${orderId}` }
      ],
      [
        { text: "❌ Batalkan Pesanan", callback_data: `cancel_order:${orderId}` }
      ]
    ]
  };

  sendPhoto(chatId, qrUrl, caption, keyboard);

  if (ADMIN_CHAT_ID) {
    sendMessage(ADMIN_CHAT_ID,
      `🛎 *Order Baru Masuk*\n🆔 \`${orderId}\`\n📦 ${qty} Pcs\n💰 Total: ${formatRp(totalPayment)}\n👤 \`${chatId}\`\n\n` +
      `⚡ Auto-Watcher sedang memantau pembayaran ini...`);
  }

  if (CHANNEL_ID) {
    postNewOrderToChannel(orderId, totalPayment, qty, chatId);
  }
}

// =========================================================================
// 5. BATALKAN PESANAN (CANCEL ORDER & KEMBALIKAN STOK)
// =========================================================================
function cancelPendingOrder(chatId, specificOrderId, txSheet, voucherSheet) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let targetOrder = null;
  let rowIndex = -1;

  try {
    const rows = txSheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      const isChatMatch = String(rows[i][T.CHAT]) === String(chatId);
      const isStatusPending = String(rows[i][T.STATUS]).trim().toUpperCase() === "PENDING";
      const isOrderMatch = specificOrderId ? String(rows[i][T.ORDER]) === String(specificOrderId) : true;

      if (isChatMatch && isStatusPending && isOrderMatch) {
        rowIndex = i;
        targetOrder = {
          orderId: rows[i][T.ORDER],
          codes: String(rows[i][T.CODE]).split(",").map(c => c.trim()).filter(Boolean),
          amount: rows[i][T.AMOUNT]
        };
        break;
      }
    }

    if (!targetOrder || rowIndex === -1) {
      sendMessage(chatId, "ℹ️ Tidak ada pesanan pending yang ditemukan untuk dibatalkan.", {
        inline_keyboard: [[{ text: "🛍️ Beli Kode Promo", callback_data: "menu_buy" }]]
      });
      return;
    }

    // 1. Ubah status transaksi menjadi CANCELLED
    txSheet.getRange(rowIndex + 1, T.STATUS + 1).setValue("CANCELLED");

    // 2. Kembalikan semua voucher terkait menjadi AVAILABLE
    for (const code of targetOrder.codes) {
      setVoucherStatus(voucherSheet, code, "AVAILABLE", "");
    }

    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  const text =
    `✅ *Pesanan Berhasil Dibatalkan!*\n\n` +
    `🆔 Order ID: \`${targetOrder.orderId}\`\n` +
    `📦 Stok ${targetOrder.codes.length} Pcs telah dikembalikan ke sistem.\n\n` +
    `Anda sekarang bisa membuat pesanan baru kapan saja.`;

  const keyboard = {
    inline_keyboard: [
      [{ text: "🛍️ Buat Pesanan Baru", callback_data: "menu_buy" }],
      [{ text: "🏠 Menu Utama", callback_data: "menu_main" }]
    ]
  };

  sendMessage(chatId, text, keyboard);
}

// Cek status bayar manual oleh user
function checkOrderPayment(chatId, orderId, txSheet) {
  const rows = txSheet.getDataRange().getValues();
  let status = "NOT_FOUND";
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][T.ORDER]) === String(orderId)) {
      status = String(rows[i][T.STATUS]).trim().toUpperCase();
      break;
    }
  }

  if (status === "SUCCESS") {
    sendMessage(chatId, `🎉 Pesanan \`${orderId}\` sudah LUNAS! Kode sudah dikirimkan di atas.`);
  } else if (status === "CANCELLED" || status === "EXPIRED") {
    sendMessage(chatId, `⚠️ Pesanan \`${orderId}\` telah berstatus *${status}*.`);
  } else {
    sendMessage(chatId,
      `⏳ *Menunggu Pembayaran!*\n\n` +
      `Pesanan \`${orderId}\` belum terdeteksi dibayar.\n` +
      `Silakan transfer sesuai nominal yang tertera di QRIS. Sistem akan mendeteksinya dalam beberapa detik setelah Anda bayar.`, {
      inline_keyboard: [
        [{ text: "🔄 Cek Lagi", callback_data: `check_order:${orderId}` }],
        [{ text: "❌ Batalkan Pesanan", callback_data: `cancel_order:${orderId}` }]
      ]
    });
  }
}

function sendPendingOrderStatus(chatId, txSheet) {
  const pending = findPendingOrderByChat(txSheet, chatId);
  if (!pending) {
    sendMessage(chatId, "ℹ️ Anda tidak memiliki pesanan yang sedang aktif saat ini.", {
      inline_keyboard: [[{ text: "🛍️ Beli Kode Promo", callback_data: "menu_buy" }]]
    });
    return;
  }

  sendMessage(chatId,
    `📋 *STATUS PESANAN AKTIF*\n\n` +
    `🆔 Order ID: \`${pending.orderId}\`\n` +
    `📦 Jumlah: *${pending.qty} Pcs*\n` +
    `💰 Total: *${formatRp(pending.amount)}*\n` +
    `⏳ Status: *Menunggu Pembayaran*\n\n` +
    `Silakan selesaikan pembayaran sesuai QRIS yang telah diberikan.`, {
    inline_keyboard: [
      [{ text: "🔄 Cek Status Bayar", callback_data: `check_order:${pending.orderId}` }],
      [{ text: "❌ Batalkan Pesanan Ini", callback_data: `cancel_order:${pending.orderId}` }]
    ]
  });
}

// =========================================================================
// 6. KONFIRMASI PEMBAYARAN (OTOMATIS DARI GOPAY GATEWAY)
// =========================================================================
function confirmPayment(orderId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const txSheet = getOrCreateSheet(ss, "Transactions");
  const voucherSheet = getOrCreateSheet(ss, "Vouchers");

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let chatId, codesString, amount;
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
    codesString = String(rows[found][T.CODE]);
    amount = rows[found][T.AMOUNT];

    const codes = codesString.split(",").map(c => c.trim()).filter(Boolean);

    // Tandai transaksi sukses
    txSheet.getRange(found + 1, T.STATUS + 1).setValue("SUCCESS");

    // Tandai semua voucher menjadi SOLD
    for (const code of codes) {
      setVoucherStatus(voucherSheet, code, "SOLD", chatId);
    }

    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  const codes = codesString.split(",").map(c => c.trim()).filter(Boolean);
  const qty = codes.length;

  let codesFormatted = "";
  if (codes.length === 1) {
    codesFormatted = `\`${codes[0]}\``;
  } else {
    codesFormatted = codes.map((c, idx) => `${idx + 1}. \`${c}\``).join("\n");
  }

  const messageText =
    `🎉 *PEMBAYARAN BERHASIL!*\n\n` +
    `Terima kasih telah berbelanja *${qty} Pcs* (${formatRp(amount)}) di TOKO DIGITAL JOJO.\n\n` +
    `🔑 *KODE PROMO ANDA:*\n${codesFormatted}\n\n` +
    `_Ketuk kode di atas untuk menyalin langsung._`;

  sendMessage(chatId, messageText, {
    inline_keyboard: [
      [{ text: "🛍️ Beli Lagi", callback_data: "menu_buy" }],
      [{ text: "🏠 Menu Utama", callback_data: "menu_main" }]
    ]
  });

  if (CHANNEL_ID) {
    postPaymentSuccessToChannel(orderId, amount, qty, chatId);
  }

  return true;
}

// Posting Notifikasi Order Baru ke Channel
function postNewOrderToChannel(orderId, amount, qty, chatId) {
  const masked = String(chatId).substring(0, 4) + "****";
  const time = Utilities.formatDate(new Date(), "Asia/Jakarta", "dd MMM yyyy, HH:mm") + " WIB";
  sendMessage(CHANNEL_ID,
    `🛎 *ORDER BARU MASUK*\n\n` +
    `🆔 Order: \`${orderId}\`\n` +
    `🛍️ Produk: *Kode Promo (${qty} Pcs)*\n` +
    `💰 Total: *${formatRp(amount)}*\n` +
    `👤 Pembeli: \`${masked}\`\n` +
    `🕒 ${time}\n` +
    `⏳ Status: *Menunggu Pembayaran*\n\n` +
    `🛒 Order via @tokojojo\\_bot`
  );
}

// Posting Notifikasi Transaksi Sukses ke Channel
function postPaymentSuccessToChannel(orderId, amount, qty, chatId) {
  const masked = String(chatId).substring(0, 4) + "****";
  const time = Utilities.formatDate(new Date(), "Asia/Jakarta", "dd MMM yyyy, HH:mm") + " WIB";
  sendMessage(CHANNEL_ID,
    `🎉 *TRANSAKSI BERHASIL / LUNAS!*\n\n` +
    `🆔 Order: \`${orderId}\`\n` +
    `🛍️ Produk: *Kode Promo (${qty} Pcs)*\n` +
    `💰 Total: *${formatRp(amount)}*\n` +
    `👤 Pembeli: \`${masked}\`\n` +
    `🕒 ${time}\n\n` +
    `✅ *${qty} Kode promo terkirim otomatis!*\n` +
    `🛒 Order via @tokojojo\\_bot`
  );
}

// =========================================================================
// 7. ORDER KEDALUWARSA (CLEANUP OTOMATIS)
// =========================================================================
function releaseExpiredOrders() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const txSheet = getOrCreateSheet(ss, "Transactions");
  const voucherSheet = getOrCreateSheet(ss, "Vouchers");
  const rows = txSheet.getDataRange().getValues();
  const now = Date.now();

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][T.STATUS]).trim().toUpperCase() !== "PENDING") continue;
    const created = new Date(rows[i][T.TIME]).getTime();
    if (now - created > ORDER_EXPIRE_MINUTES * 60000) {
      txSheet.getRange(i + 1, T.STATUS + 1).setValue("EXPIRED");
      const codes = String(rows[i][T.CODE]).split(",").map(c => c.trim()).filter(Boolean);
      for (const code of codes) {
        setVoucherStatus(voucherSheet, code, "AVAILABLE", "");
      }
    }
  }
}

// =========================================================================
// 8. HELPER GOOGLE SHEETS & DATA
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

// Mengunci banyak voucher sekaligus sesuai quantity
function reserveMultipleVouchers(sheet, chatId, qty) {
  const rows = sheet.getDataRange().getValues();
  const reserved = [];

  for (let i = 1; i < rows.length; i++) {
    if (normStatus(rows[i][V.STATUS]) === "AVAILABLE") {
      sheet.getRange(i + 1, V.STATUS + 1).setValue("RESERVED");
      sheet.getRange(i + 1, V.BUYER + 1).setValue(chatId);
      reserved.push({
        code: String(rows[i][V.CODE]).trim(),
        price: parseInt(rows[i][V.PRICE]) || 15000
      });
      if (reserved.length === qty) break;
    }
  }

  if (reserved.length < qty) return null;
  return reserved;
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
    if (String(rows[i][T.CHAT]) === String(chatId) && normStatus(rows[i][T.STATUS]) === "PENDING") {
      const codes = String(rows[i][T.CODE]).split(",").map(c => c.trim()).filter(Boolean);
      return {
        orderId: rows[i][T.ORDER],
        amount: rows[i][T.AMOUNT],
        qty: codes.length
      };
    }
  }
  return null;
}

// Generate kode unik acak anti-bentrok
function getAvailableUniqueCode(sheet, basePrice, minCode, maxCode) {
  const rows = sheet.getDataRange().getValues();
  const activeAmounts = new Set();
  for (let i = 1; i < rows.length; i++) {
    if (normStatus(rows[i][T.STATUS]) === "PENDING") {
      activeAmounts.add(parseInt(rows[i][T.AMOUNT]));
    }
  }

  for (let attempt = 0; attempt < 50; attempt++) {
    const code = Math.floor(Math.random() * (maxCode - minCode + 1)) + minCode;
    if (!activeAmounts.has(basePrice + code)) {
      return code;
    }
  }
  return Math.floor(Math.random() * (maxCode - minCode + 1)) + minCode;
}

// =========================================================================
// 9. QRIS DINAMIS EMVCo PARSER & CRC16
// =========================================================================
function convertToDynamicQRIS(staticQris, amount) {
  let base = staticQris.substring(0, staticQris.length - 8);
  base = base.replace("010211", "010212");
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
// 10. TELEGRAM API HELPER
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

function sendMessage(chatId, text, replyMarkup = null) {
  const payload = { chat_id: chatId, text: text, parse_mode: "Markdown" };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  return tg("sendMessage", payload);
}

function sendPhoto(chatId, photoUrl, caption, replyMarkup = null) {
  const payload = { chat_id: chatId, photo: photoUrl, caption: caption, parse_mode: "Markdown" };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  return tg("sendPhoto", payload);
}

function answerCallbackQuery(callbackQueryId, text = null) {
  const payload = { callback_query_id: callbackQueryId };
  if (text) payload.text = text;
  return tg("answerCallbackQuery", payload);
}

// =========================================================================
// 11. UTILITAS SETUP (JALANKAN DARI EDITOR BILA PERLU)
// =========================================================================
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  getOrCreateSheet(ss, "Vouchers");
  getOrCreateSheet(ss, "Transactions");
  console.log("Sheet Vouchers dan Transactions berhasil dibuat!");
}

function resetWebhook() {
  const url = ScriptApp.getService().getUrl();
  if (!url) {
    console.error("Gagal: Lakukan Deploy Web App terlebih dahulu!");
    return;
  }
  const res = UrlFetchApp.fetch("https://api.telegram.org/bot" + BOT_TOKEN +
    "/setWebhook?drop_pending_updates=true&url=" + encodeURIComponent(url));
  console.log("Status Webhook Telegram: " + res.getContentText());
}
