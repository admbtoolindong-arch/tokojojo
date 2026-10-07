const axios = require('axios');
const storeManager = require('./storeManager');

const BOT_TOKEN = process.env.BOT_TOKEN || '8263331940:AAHcB-HFAufz4imo8mN5xSpw2kHHlEuxuyo';
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '8909142626';
const CHANNEL_ID = process.env.CHANNEL_ID || '@tokojojo';
const ORDER_EXPIRE_MINUTES = parseInt(process.env.ORDER_EXPIRE_MINUTES, 10) || 30;

let qrisStoreRef = null;
let generateDynamicQRISRef = null;
let verifyPaymentRef = null;

function setServerReferences(qrisStore, generateDynamicQRIS, verifyPayment = null) {
    qrisStoreRef = qrisStore;
    generateDynamicQRISRef = generateDynamicQRIS;
    verifyPaymentRef = verifyPayment;
}

function formatRp(number) {
    return 'Rp ' + Number(number || 0).toLocaleString('id-ID');
}

function formatDateWib(date = new Date()) {
    return new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date) + ' WIB';
}

async function callTelegram(method, data) {
    if (!BOT_TOKEN) return null;
    try {
        const res = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, data, {
            timeout: 10000
        });
        return res.data;
    } catch (err) {
        console.error(`[BotManager] Telegram API error (${method}):`, err.response?.data || err.message);
        return null;
    }
}

async function sendMessage(chatId, text, replyMarkup = null) {
    const payload = {
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML'
    };
    if (replyMarkup) {
        payload.reply_markup = replyMarkup;
    }
    return callTelegram('sendMessage', payload);
}

async function sendPhoto(chatId, photoUrl, caption, replyMarkup = null) {
    const payload = {
        chat_id: chatId,
        photo: photoUrl,
        caption: caption,
        parse_mode: 'HTML'
    };
    if (replyMarkup) {
        payload.reply_markup = replyMarkup;
    }
    return callTelegram('sendPhoto', payload);
}

async function answerCallbackQuery(callbackQueryId, text = null, showAlert = false) {
    const payload = { callback_query_id: callbackQueryId };
    if (text) {
        payload.text = text;
        if (showAlert) payload.show_alert = true;
    }
    return callTelegram('answerCallbackQuery', payload);
}

// -------------------------------------------------------------
// MENU DAN TAMPILAN
// -------------------------------------------------------------

async function sendMainMenu(chatId) {
    storeManager.releaseExpiredOrders();
    const count = storeManager.countAvailable();
    const price = storeManager.getCurrentPrice();

    const text =
        `👋 <b>Selamat Datang di TOKO DIGITAL JOJO!</b>\n\n` +
        `Menyediakan Kode Promo Google Drive Resmi &amp; Instan 24 Jam.\n\n` +
        `📦 <b>Stok Kode Promo:</b> <code>${count} Pcs</code>\n` +
        (price ? `💰 <b>Harga:</b> <code>${formatRp(price)} / Pcs</code>\n\n` : `\n`) +
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

    return sendMessage(chatId, text, keyboard);
}

async function sendStockInfo(chatId) {
    storeManager.releaseExpiredOrders();
    const count = storeManager.countAvailable();
    const price = storeManager.getCurrentPrice();

    const text =
        `📦 <b>INFORMASI STOK &amp; HARGA</b>\n\n` +
        `🛍️ Produk: <b>Kode Promo Google Drive</b>\n` +
        `📦 Stok Tersedia: <b>${count} Pcs</b>\n` +
        `💰 Harga Satuan: <b>${formatRp(price)}</b>\n` +
        `⚡ Pengiriman: <b>Otomatis Instan 24 Jam</b>\n` +
        `💳 Pembayaran: <b>QRIS (GoPay, BCA, DANA, OVO, ShopeePay, Livin, dll)</b>\n\n` +
        (count > 0 ? `Siap untuk memesan? Klik tombol beli di bawah:` : `<i>Maaf, stok saat ini sedang habis.</i>`);

    const keyboard = {
        inline_keyboard: [
            count > 0 ? [{ text: "🛍️ Beli Sekarang", callback_data: "menu_buy" }] : [],
            [{ text: "🔙 Kembali ke Menu", callback_data: "menu_main" }]
        ].filter(r => r.length > 0)
    };

    return sendMessage(chatId, text, keyboard);
}

async function showQuantitySelector(chatId) {
    storeManager.releaseExpiredOrders();

    const pending = storeManager.findPendingOrderByChat(chatId);
    if (pending) {
        const text =
            `⏳ <b>Anda Masih Punya Pesanan Belum Dibayar!</b>\n\n` +
            `🆔 Order ID: <code>${pending.orderId}</code>\n` +
            `📦 Jumlah: <b>${pending.codes.length} Pcs</b>\n` +
            `💰 Total: <b>${formatRp(pending.amount)}</b>\n\n` +
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
        return sendMessage(chatId, text, keyboard);
    }

    const count = storeManager.countAvailable();
    const price = storeManager.getCurrentPrice();

    if (count <= 0) {
        return sendMessage(chatId, `❌ <b>Maaf, stok Kode Promo sedang HABIS.</b> Silakan cek kembali nanti.`, {
            inline_keyboard: [[{ text: "🔙 Menu Utama", callback_data: "menu_main" }]]
        });
    }

    const text =
        `🛍️ <b>PILIH JUMLAH PEMBELIAN</b>\n\n` +
        `📦 Stok Tersedia: <b>${count} Pcs</b>\n` +
        `💰 Harga Satuan: <b>${formatRp(price)}</b>\n\n` +
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

    return sendMessage(chatId, text, { inline_keyboard: rows });
}

async function sendHelp(chatId) {
    const text =
        `ℹ️ <b>PANDUAN PEMBELIAN TOKO DIGITAL JOJO</b>\n\n` +
        `1. Klik menu <b>🛍️ Beli Kode Promo</b>.\n` +
        `2. Pilih jumlah kode yang ingin Anda beli (1 Pcs, 2 Pcs, dst).\n` +
        `3. Bot akan mengirimkan gambar <b>QRIS Dinamis</b> dengan nominal total persis.\n` +
        `4. Buka aplikasi m-Banking atau E-Wallet Anda (BCA, GoPay, DANA, OVO, ShopeePay, Livin', dll).\n` +
        `5. Scan QR code tersebut. Nominal akan terisi secara otomatis.\n` +
        `6. Begitu pembayaran Anda selesai, <b>kode promo akan dikirim detik itu juga secara otomatis!</b>\n\n` +
        `Jika ada kendala, hubungi Admin: @prasojotrii`;

    const keyboard = {
        inline_keyboard: [
            [{ text: "🛍️ Beli Sekarang", callback_data: "menu_buy" }],
            [{ text: "🔙 Kembali ke Menu", callback_data: "menu_main" }]
        ]
    };
    return sendMessage(chatId, text, keyboard);
}

// -------------------------------------------------------------
// PROSES ORDER BARU
// -------------------------------------------------------------

async function processOrder(chatId, qty) {
    storeManager.releaseExpiredOrders();

    const pending = storeManager.findPendingOrderByChat(chatId);
    if (pending) {
        return sendMessage(chatId,
            `⏳ Anda masih punya pesanan belum dibayar: <code>${pending.orderId}</code> (${formatRp(pending.amount)})\n` +
            `Selesaikan atau batalkan pesanan tersebut sebelum membuat pesanan baru.`, {
                inline_keyboard: [
                    [{ text: "🔄 Cek Status Bayar", callback_data: `check_order:${pending.orderId}` }],
                    [{ text: "❌ Batalkan Pesanan", callback_data: `cancel_order:${pending.orderId}` }],
                    [{ text: "🔙 Menu Utama", callback_data: "menu_main" }]
                ]
            });
    }

    const available = storeManager.countAvailable();
    if (available < qty) {
        return sendMessage(chatId, `❌ <b>Stok tidak cukup!</b> Anda ingin membeli ${qty} Pcs, tetapi stok tersisa hanya ${available} Pcs.`);
    }

    const reserved = storeManager.reserveVouchers(chatId, qty);
    if (!reserved || reserved.length < qty) {
        return sendMessage(chatId, `❌ Gagal mengunci stok kode promo. Silakan coba lagi.`);
    }

    const basePrice = reserved.reduce((sum, v) => sum + v.price, 0);
    const uniqueCode = storeManager.getAvailableUniqueCode(basePrice, 1, 299);
    const totalPayment = basePrice + uniqueCode;
    const orderId = `TX-${Date.now()}`;

    // Simpan ke transactions
    storeManager.createOrder(chatId, orderId, reserved, totalPayment);

    // Generate Dynamic QRIS
    const staticTemplate = process.env.QRIS_STATIC || '';
    let dynamicQris = '';
    if (generateDynamicQRISRef && staticTemplate) {
        dynamicQris = generateDynamicQRISRef(staticTemplate, totalPayment);
    }

    // Register ke qrisStore agar auto-watcher memeriksa transaksi GoPay
    const expiresAt = new Date(Date.now() + ORDER_EXPIRE_MINUTES * 60 * 1000);
    if (qrisStoreRef) {
        const qrisId = Math.random().toString(36).substring(2, 10);
        qrisStoreRef.set(qrisId, {
            data: dynamicQris,
            amount: totalPayment,
            trxId: orderId,
            orderId: orderId,
            chatId: String(chatId),
            qty: qty,
            webhookNotified: false,
            expiresAt: expiresAt,
            createdAt: new Date(),
            status: 'PENDING'
        });
    }

    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=450x450&margin=10&data=${encodeURIComponent(dynamicQris || 'QRIS_GATEWAY')}`;

    const caption =
        `📲 <b>TAGIHAN PEMBAYARAN KODE PROMO GOOGLE DRIVE</b>\n\n` +
        `🆔 Order ID: <code>${orderId}</code>\n` +
        `🛍️ Produk: <b>Kode Promo Google Drive</b>\n` +
        `📦 Jumlah: <b>${qty} Pcs</b>\n` +
        `💰 Harga Barang: ${formatRp(basePrice)}\n` +
        `🔢 Kode Unik: +${formatRp(uniqueCode)}\n` +
        `💳 <b>TOTAL BAYAR: ${formatRp(totalPayment)}</b>\n` +
        `📌 Merchant: <b>Mas Mas IT, SIDOREJO</b>\n` +
        `⏳ Batas Waktu: <b>${ORDER_EXPIRE_MINUTES} Menit</b>\n\n` +
        `Scan QR di atas dengan GoPay, BCA, DANA, OVO, ShopeePay, atau m-Banking.\n` +
        `<i>(Nominal ${formatRp(totalPayment)} sudah otomatis terisi saat scan QR)</i>\n\n` +
        `⚡ <b>${qty} Kode promo akan dikirim detik itu juga secara otomatis!</b>`;

    const keyboard = {
        inline_keyboard: [
            [{ text: "🔄 Cek Status Pembayaran", callback_data: `check_order:${orderId}` }],
            [{ text: "❌ Batalkan Pesanan", callback_data: `cancel_order:${orderId}` }]
        ]
    };

    await sendPhoto(chatId, qrUrl, caption, keyboard);

    // Notifikasi Admin (Hanya dikirim jika pembeli bukan admin itu sendiri, agar user tidak menerima pesan order masuk)
    if (ADMIN_CHAT_ID && String(ADMIN_CHAT_ID) !== String(chatId)) {
        sendMessage(ADMIN_CHAT_ID,
            `🛎 <b>Order Baru Masuk</b>\n` +
            `🆔 <code>${orderId}</code>\n` +
            `📦 ${qty} Pcs\n` +
            `💰 Total: ${formatRp(totalPayment)}\n` +
            `👤 <code>${chatId}</code>\n\n` +
            `⚡ Auto-Watcher sedang memantau pembayaran ini...`).catch(() => {});
    }

    // Notifikasi Channel
    if (CHANNEL_ID) {
        postNewOrderToChannel(orderId, totalPayment, qty, chatId).catch(() => {});
    }
}

// -------------------------------------------------------------
// BATALKAN PESANAN
// -------------------------------------------------------------

async function cancelOrder(chatId, specificOrderId = null) {
    const target = storeManager.cancelOrder(chatId, specificOrderId);
    if (!target) {
        return sendMessage(chatId, `ℹ️ Tidak ada pesanan pending yang ditemukan untuk dibatalkan.`, {
            inline_keyboard: [[{ text: "🛍️ Beli Kode Promo", callback_data: "menu_buy" }]]
        });
    }

    // Update status di qrisStore jika ada
    if (qrisStoreRef) {
        for (const [k, v] of qrisStoreRef.entries()) {
            if (v.orderId === target.orderId) {
                v.status = 'CANCELLED';
                break;
            }
        }
    }

    const text =
        `✅ <b>Pesanan Berhasil Dibatalkan!</b>\n\n` +
        `🆔 Order ID: <code>${target.orderId}</code>\n` +
        `📦 Stok ${target.codes.length} Pcs telah dikembalikan ke sistem.\n\n` +
        `Anda sekarang bisa membuat pesanan baru kapan saja.`;

    const keyboard = {
        inline_keyboard: [
            [{ text: "🛍️ Buat Pesanan Baru", callback_data: "menu_buy" }],
            [{ text: "🏠 Menu Utama", callback_data: "menu_main" }]
        ]
    };

    return sendMessage(chatId, text, keyboard);
}

// -------------------------------------------------------------
// CEK STATUS ORDER MANUAL
// -------------------------------------------------------------

async function checkOrder(chatId, orderId) {
    const txs = storeManager.getTransactions();
    const order = txs.find(t => t.orderId === orderId);

    if (!order) {
        return sendMessage(chatId, `⚠️ Order <code>${orderId}</code> tidak ditemukan.`);
    }

    if (order.status === 'SUCCESS') {
        return sendMessage(chatId, `🎉 Pesanan <code>${orderId}</code> sudah LUNAS! Kode promo telah dikirimkan ke Anda.`);
    }

    if (order.status === 'CANCELLED' || order.status === 'EXPIRED') {
        return sendMessage(chatId, `⚠️ Pesanan <code>${orderId}</code> telah berstatus <b>${order.status}</b>.`);
    }

    // Pengecekan aktif ke API GoPay secara langsung
    if (verifyPaymentRef) {
        try {
            const matched = await verifyPaymentRef(order.amount, order.createdAt, null, 'Bot-CheckOrder', orderId);
            if (matched) {
                await confirmPayment(orderId);
                return;
            }
        } catch (e) {
            console.error('[BotManager] checkOrder verifyPayment error:', e.message);
        }
    }

    const checkTime = new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    }).format(new Date()) + ' WIB';

    return sendMessage(chatId,
        `⏳ <b>STATUS: MENUNGGU PEMBAYARAN</b>\n\n` +
        `🆔 Order ID: <code>${orderId}</code>\n` +
        `💰 Nominal Persis: <b>${formatRp(order.amount)}</b>\n` +
        `🕒 Terakhir Dicek: <code>${checkTime}</code>\n\n` +
        `Mutasi pembayaran belum terdeteksi di GoPay. Jika baru saja transfer, mohon tunggu 5-10 detik lalu klik tombol di bawah untuk mengecek kembali.`, {
            inline_keyboard: [
                [{ text: "🔄 Cek Status Bayar Lagi", callback_data: `check_order:${orderId}` }],
                [{ text: "❌ Batalkan Pesanan", callback_data: `cancel_order:${orderId}` }]
            ]
        });
}

// -------------------------------------------------------------
// KONFIRMASI PEMBAYARAN (DIPANGGIL AUTO-WATCHER)
// -------------------------------------------------------------

async function confirmPayment(orderId) {
    const updated = storeManager.confirmOrderPayment(orderId);
    if (!updated) return false;

    const qty = updated.codes.length;
    let codesFormatted = "";
    if (qty === 1) {
        codesFormatted = `<code>${updated.codes[0]}</code>`;
    } else {
        codesFormatted = updated.codes.map((c, i) => `${i + 1}. <code>${c}</code>`).join('\n');
    }

    const messageText =
        `🎉 <b>PEMBAYARAN BERHASIL!</b>\n\n` +
        `Terima kasih telah berbelanja <b>${qty} Pcs</b> (${formatRp(updated.amount)}) di TOKO DIGITAL JOJO.\n\n` +
        `🔑 <b>KODE PROMO ANDA:</b>\n${codesFormatted}\n\n` +
        `<i>Ketuk kode di atas untuk menyalin langsung.</i>`;

    await sendMessage(updated.chatId, messageText, {
        inline_keyboard: [
            [{ text: "🛍️ Beli Lagi", callback_data: "menu_buy" }],
            [{ text: "🏠 Menu Utama", callback_data: "menu_main" }]
        ]
    });

    if (CHANNEL_ID) {
        postPaymentSuccessToChannel(orderId, updated.amount, qty, updated.chatId).catch(() => {});
    }

    if (ADMIN_CHAT_ID && String(ADMIN_CHAT_ID) !== String(updated.chatId)) {
        sendMessage(ADMIN_CHAT_ID,
            `✅ <b>Pembayaran Order Selesai</b>\n` +
            `🆔 <code>${orderId}</code>\n` +
            `💰 ${formatRp(updated.amount)} (${qty} Pcs)\n` +
            `👤 Pembeli: <code>${updated.chatId}</code>\n` +
            `🔑 Kode: ${updated.codes.join(', ')}`).catch(() => {});
    }

    return true;
}

// -------------------------------------------------------------
// NOTIFIKASI CHANNEL
// -------------------------------------------------------------

async function postNewOrderToChannel(orderId, amount, qty, chatId) {
    const masked = String(chatId).substring(0, 4) + '****';
    const time = formatDateWib();
    const text =
        `🛎 <b>ORDER BARU MASUK</b>\n\n` +
        `🆔 Order: <code>${orderId}</code>\n` +
        `🛍️ Produk: <b>Kode Promo Google Drive (${qty} Pcs)</b>\n` +
        `💰 Total: <b>${formatRp(amount)}</b>\n` +
        `👤 Pembeli: <code>${masked}</code>\n` +
        `🕒 ${time}\n` +
        `⏳ Status: <b>Menunggu Pembayaran</b>\n\n` +
        `🛒 Order via @tokojojo_bot`;

    return sendMessage(CHANNEL_ID, text);
}

async function postPaymentSuccessToChannel(orderId, amount, qty, chatId) {
    const masked = String(chatId).substring(0, 4) + '****';
    const time = formatDateWib();
    const text =
        `🎉 <b>TRANSAKSI BERHASIL / LUNAS!</b>\n\n` +
        `🆔 Order: <code>${orderId}</code>\n` +
        `🛍️ Produk: <b>Kode Promo Google Drive (${qty} Pcs)</b>\n` +
        `💰 Total: <b>${formatRp(amount)}</b>\n` +
        `👤 Pembeli: <code>${masked}</code>\n` +
        `🕒 ${time}\n\n` +
        `✅ <b>${qty} Kode promo terkirim otomatis!</b>\n` +
        `🛒 Order via @tokojojo_bot`;

    return sendMessage(CHANNEL_ID, text);
}

// -------------------------------------------------------------
// PENANGANAN TELEGRAM UPDATE
// -------------------------------------------------------------

async function handleTelegramUpdate(update) {
    if (!update) return;

    if (update.message) {
        const msg = update.message;
        const chatId = msg.chat?.id;
        const text = (msg.text || '').trim();
        const parts = text.split(/\s+/);
        const cmd = parts[0].toLowerCase().replace(/@\w+/, '');

        switch (cmd) {
            case '/start':
            case '/menu':
                await sendMainMenu(chatId);
                break;

            case '/stok':
                await sendStockInfo(chatId);
                break;

            case '/beli': {
                const qty = parseInt(parts[1], 10);
                if (qty && qty > 0) {
                    await processOrder(chatId, qty);
                } else {
                    await showQuantitySelector(chatId);
                }
                break;
            }

            case '/batal':
                await cancelOrder(chatId);
                break;

            case '/reset': {
                storeManager.cancelOrder(chatId);
                await sendMessage(chatId, `🔄 <b>Percakapan &amp; Pesanan Berhasil Direset!</b>\n\nStatus pesanan Anda telah dibersihkan.`);
                await sendMainMenu(chatId);
                break;
            }

            case '/status':
            case '/pesanan': {
                const pending = storeManager.findPendingOrderByChat(chatId);
                if (!pending) {
                    await sendMessage(chatId, `ℹ️ Anda tidak memiliki pesanan yang sedang aktif saat ini.`, {
                        inline_keyboard: [[{ text: "🛍️ Beli Kode Promo", callback_data: "menu_buy" }]]
                    });
                } else {
                    await checkOrder(chatId, pending.orderId);
                }
                break;
            }

            case '/myid':
                await sendMessage(chatId, `🆔 Chat ID Anda: <code>${chatId}</code>`);
                break;

            case '/tambah': {
                if (String(chatId) !== String(ADMIN_CHAT_ID)) return;
                const codesInput = parts[1];
                const price = parseInt(parts[2], 10) || 1000;
                if (!codesInput) {
                    await sendMessage(chatId, `Format: <code>/tambah KODE1,KODE2 1000</code>`);
                    return;
                }
                const list = codesInput.split(',').map(s => s.trim()).filter(Boolean);
                const added = storeManager.addVouchers(list, price);
                await sendMessage(chatId, `✅ Berhasil menambahkan <b>${added.length}</b> kode promo ke stok! Total stok sekarang: <b>${storeManager.countAvailable()} Pcs</b>.`);
                break;
            }

            case '/konfirmasi': {
                if (String(chatId) !== String(ADMIN_CHAT_ID)) return;
                const targetOrder = parts[1];
                if (!targetOrder) {
                    await sendMessage(chatId, `Format: <code>/konfirmasi TX-1234567890</code>`);
                    return;
                }
                const ok = await confirmPayment(targetOrder);
                await sendMessage(chatId, ok
                    ? `✅ Order <code>${targetOrder}</code> berhasil dikonfirmasi dan kode promo telah dikirimkan ke pembeli!`
                    : `❌ Order <code>${targetOrder}</code> tidak ditemukan atau sudah bukan status PENDING.`);
                break;
            }

            default:
                await sendMainMenu(chatId);
                break;
        }
    } else if (update.callback_query) {
        const cq = update.callback_query;
        const cqId = cq.id;
        const chatId = cq.message?.chat?.id;
        const data = cq.data || '';

        if (data.startsWith('check_order:')) {
            const orderId = data.replace('check_order:', '');
            await answerCallbackQuery(cqId, '🔍 Memeriksa mutasi pembayaran GoPay...', true);
            await checkOrder(chatId, orderId);
        } else if (data.startsWith('cancel_order:')) {
            const orderId = data.replace('cancel_order:', '');
            await answerCallbackQuery(cqId, '❌ Membatalkan pesanan...', false);
            await cancelOrder(chatId, orderId);
        } else if (data.startsWith('buy_qty:')) {
            const qty = parseInt(data.replace('buy_qty:', ''), 10);
            await answerCallbackQuery(cqId, '⏳ Menyiapkan tagihan QRIS...', false);
            await processOrder(chatId, qty);
        } else {
            await answerCallbackQuery(cqId);
            if (data === 'menu_main') {
                await sendMainMenu(chatId);
            } else if (data === 'menu_stock') {
                await sendStockInfo(chatId);
            } else if (data === 'menu_buy') {
                await showQuantitySelector(chatId);
            } else if (data === 'menu_my_order') {
                const pending = storeManager.findPendingOrderByChat(chatId);
                if (!pending) {
                    await sendMessage(chatId, `ℹ️ Anda tidak memiliki pesanan yang sedang aktif saat ini.`, {
                        inline_keyboard: [[{ text: "🛍️ Beli Kode Promo", callback_data: "menu_buy" }]]
                    });
                } else {
                    await checkOrder(chatId, pending.orderId);
                }
            } else if (data === 'menu_help') {
                await sendHelp(chatId);
            }
        }
    }
}

// -------------------------------------------------------------
// POLLING ENGINE (Untuk mode tanpa webhook publik atau local dev)
// -------------------------------------------------------------
let pollingActive = false;
let lastUpdateId = 0;

async function startPolling() {
    if (pollingActive) return;
    pollingActive = true;
    console.log('[BotManager] Telegram Long Polling dimulai...');

    // Pastikan webhook dihapus agar Telegram mengizinkan getUpdates (polling)
    try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook`, { drop_pending_updates: false });
    } catch (e) {}

    while (pollingActive) {
        try {
            const res = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`, {
                params: {
                    offset: lastUpdateId + 1,
                    timeout: 20
                },
                timeout: 25000
            });

            if (res.data?.ok && Array.isArray(res.data.result)) {
                for (const upd of res.data.result) {
                    lastUpdateId = upd.update_id;
                    await handleTelegramUpdate(upd);
                }
            }
        } catch (err) {
            // Jeda sejenak jika terjadi network timeout / error
            await new Promise(r => setTimeout(r, 3000));
        }
    }
}

function stopPolling() {
    pollingActive = false;
}

module.exports = {
    setServerReferences,
    handleTelegramUpdate,
    confirmPayment,
    startPolling,
    stopPolling,
    sendMessage
};
