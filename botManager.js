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
// INFORMASI RESMI DETAIL SABLON STUDIO
// -------------------------------------------------------------
const STUDIO = {
    name: "DETAIL SABLON STUDIO",
    company: "PT DETAIL AKSARA INDONESIA",
    slogan: "Percayakan Kebutuhan Produksi Apparel Anda Kepada Kami",
    description: "Industri kreatif di Indonesia harus terus bertumbuh dan menjadi tuan rumah di dalam negeri sendiri! Detail Sablon Studio bergerak di bidang Sablon & Konveksi berkomitmen memberikan kemudahan, pelayanan ramah, dan produk apparel berkualitas tinggi.",
    address: "Jl Taman Heliconia 1 C5-06 Grand Greenwood Sadeng Gunungpati Kota Semarang 50222",
    whatsapp: "081326035889",
    waUrl: "https://wa.me/6281326035889?text=Hallo,%20Saya%20ingin%20menanyakan%20tentang%20informasi%20pemesanan%20di%20Detail%20Sablon%20Studio",
    email: "detailsablonstudio@gmail.com",
    website: "https://detailsablonstudio.com",
    orderInfoUrl: "https://detailsablonstudio.com/informasi-pemesanan",
    instagram: "https://instagram.com/detailsablonstudio",
    tiktok: "https://tiktok.com/@detailsablonstudio",
    maps: "https://share.google/RaQ6zdEy2y1l9WpAF",
    productName: "Voucher Promo Detail Sablon Studio"
};

// -------------------------------------------------------------
// VALIDASI SUBSCRIPTION CHANNEL
// -------------------------------------------------------------

async function isUserSubscribed(userId) {
    if (!CHANNEL_ID) return true;
    if (String(userId) === String(ADMIN_CHAT_ID)) return true;
    try {
        const res = await callTelegram('getChatMember', {
            chat_id: CHANNEL_ID,
            user_id: userId
        });
        if (res && res.ok && res.result) {
            const status = res.result.status;
            return ['creator', 'administrator', 'member', 'restricted'].includes(status);
        }
        return false;
    } catch (err) {
        console.error('[BotManager] Error checking subscription:', err.message);
        return true; // Jika ada error API Telegram, tidak mengunci user
    }
}

async function sendSubscriptionRequired(chatId) {
    const channelName = String(CHANNEL_ID).replace('@', '');
    const channelUrl = `https://t.me/${channelName}`;
    const text =
        `🔒 <b>WAJIB GABUNG CHANNEL DETAIL SABLON STUDIO</b>\n\n` +
        `Halo kak! Untuk berbelanja atau menggunakan bot resmi <b>${STUDIO.name}</b>, Anda wajib bergabung ke channel resmi kami terlebih dahulu:\n\n` +
        `📢 <b>Channel Resmi:</b> <a href="${channelUrl}">${CHANNEL_ID}</a>\n\n` +
        `<i>Dapatkan info update promo, diskon produksi sablon &amp; konveksi, serta bukti transaksi terpercaya di channel kami.</i>\n\n` +
        `Setelah bergabung ke channel, silakan klik tombol <b>✅ Saya Sudah Join (Verifikasi)</b> di bawah ini:`;

    const keyboard = {
        inline_keyboard: [
            [{ text: `📢 Gabung Channel ${CHANNEL_ID}`, url: channelUrl }],
            [{ text: `✅ Saya Sudah Join (Verifikasi)`, callback_data: `check_subscription` }]
        ]
    };

    return sendMessage(chatId, text, keyboard);
}

// -------------------------------------------------------------
// MENU DAN TAMPILAN
// -------------------------------------------------------------

async function sendMainMenu(chatId) {
    storeManager.releaseExpiredOrders();
    const count = storeManager.countAvailable();
    const price = storeManager.getCurrentPrice();

    const text =
        `👋 <b>Selamat Datang di ${STUDIO.name}!</b>\n` +
        `🏢 <i>${STUDIO.company}</i>\n\n` +
        `✨ <i>"${STUDIO.slogan}"</i>\n\n` +
        `Vendor Sablon &amp; Konveksi Resmi di Kota Semarang.\n` +
        `Melayani:\n` +
        `• 👕 <b>Kaos Custom (Sablon)</b> &amp; <b>Kaos Polos</b>\n` +
        `• ⚽ <b>Jersey Printing</b> &amp; 🧥 <b>Hoodie / Crewneck</b>\n` +
        `• 👜 <b>Totebag Custom</b> &amp; 🖨️ <b>Cetak DTF Meteran</b>\n\n` +
        `🎟️ <b>Stok Voucher Promo Produksi:</b> <code>${count} Pcs</code>\n` +
        (price ? `💰 <b>Harga Voucher:</b> <code>${formatRp(price)} / Pcs</code>\n\n` : `\n`) +
        `Silakan pilih menu di bawah ini:`;

    const keyboard = {
        inline_keyboard: [
            [
                { text: "🛍️ Beli Voucher Promo", callback_data: "menu_buy" },
                { text: "📦 Katalog Layanan", callback_data: "menu_catalog" }
            ],
            [
                { text: "🏢 Profil & Lokasi Studio", callback_data: "menu_about" },
                { text: "💬 Hubungi CS / WhatsApp", callback_data: "menu_contact" }
            ],
            [
                { text: "📋 Pesanan Saya", callback_data: "menu_my_order" },
                { text: "ℹ️ Panduan Pemesanan", callback_data: "menu_help" }
            ]
        ]
    };

    return sendMessage(chatId, text, keyboard);
}

async function sendCatalog(chatId) {
    const text =
        `📦 <b>KATALOG PRODUK &amp; LAYANAN ${STUDIO.name}</b>\n\n` +
        `1️⃣ <b>Kaos Custom (Sablon)</b>\n` +
        `• Sablon: Plastisol, Discharge, Rubber, High Density, DTF\n` +
        `• Bahan: Cotton Combed 24s &amp; 30s Premium standard distro\n` +
        `• Jahitan rantai rapi, presisi &amp; tahan lama\n\n` +
        `2️⃣ <b>Kaos Polos</b>\n` +
        `• Bahan 100% Cotton Combed reaktif kualitas premium, adem &amp; nyaman\n` +
        `• Pilihan warna lengkap &amp; ukuran S s/d XXL\n\n` +
        `3️⃣ <b>Jersey Custom (Sublim)</b>\n` +
        `• Bahan: Dry-Fit Milano, Benzema, Pique\n` +
        `• Full print sublimasi warna tajam untuk jersey olahraga, futsal, e-sport, gowes\n\n` +
        `4️⃣ <b>Hoodie &amp; Crewneck</b>\n` +
        `• Bahan Cotton Fleece tebal, lembut &amp; hangat\n` +
        `• Custom sablon/bordir untuk brand, instansi, atau komunitas\n\n` +
        `5️⃣ <b>Totebag Custom</b>\n` +
        `• Bahan Kanvas &amp; Blacu kuat dengan cetak custom\n` +
        `• Cocok untuk merchandise event, seminar, &amp; fashion\n\n` +
        `6️⃣ <b>Cetak DTF (Direct to Film)</b>\n` +
        `• Siap press meteran maupun satuan, warna cerah, elastis &amp; tidak mudah retak\n\n` +
        `🌐 <i>Website: <a href="${STUDIO.website}">${STUDIO.website}</a></i>`;

    const keyboard = {
        inline_keyboard: [
            [
                { text: "💬 Konsultasi Desain & Order (WA)", url: STUDIO.waUrl }
            ],
            [
                { text: "🛍️ Beli Voucher Promo Diskon", callback_data: "menu_buy" },
                { text: "🌐 Kunjungi Website Resmi", url: STUDIO.website }
            ],
            [
                { text: "🔙 Menu Utama", callback_data: "menu_main" }
            ]
        ]
    };

    return sendMessage(chatId, text, keyboard);
}

async function sendStudioProfile(chatId) {
    const text =
        `🏢 <b>TENTANG ${STUDIO.name}</b>\n` +
        `<i>Under legal entity: ${STUDIO.company}</i>\n\n` +
        `✨ <i>"${STUDIO.slogan}"</i>\n\n` +
        `Industri kreatif di Indonesia harus terus bertumbuh dan menjadi tuan rumah di dalam negeri sendiri! ` +
        `Kami ${STUDIO.name} yang bergerak pada bidang Sablon &amp; Konveksi berkomitmen untuk memberikan kualitas produk dan pelayanan terbaik.\n\n` +
        `📍 <b>Alamat Workshop / Studio:</b>\n` +
        `<code>${STUDIO.address}</code>\n\n` +
        `📞 <b>Kontak Resmi:</b>\n` +
        `• WhatsApp: <code>${STUDIO.whatsapp}</code>\n` +
        `• Email: <code>${STUDIO.email}</code>\n` +
        `• Website: <a href="${STUDIO.website}">detailsablonstudio.com</a>\n` +
        `• Instagram: <a href="${STUDIO.instagram}">@detailsablonstudio</a>\n` +
        `• TikTok: <a href="${STUDIO.tiktok}">@detailsablonstudio</a>\n\n` +
        `🤝 <b>Kolaborasi:</b> AKSARA Clothing`;

    const keyboard = {
        inline_keyboard: [
            [
                { text: "📍 Buka Lokasi di Google Maps", url: STUDIO.maps },
                { text: "📸 Instagram", url: STUDIO.instagram }
            ],
            [
                { text: "🌐 Buka Website", url: STUDIO.website },
                { text: "💬 WhatsApp CS", url: STUDIO.waUrl }
            ],
            [
                { text: "🔙 Menu Utama", callback_data: "menu_main" }
            ]
        ]
    };

    return sendMessage(chatId, text, keyboard);
}

async function sendContactInfo(chatId) {
    const text =
        `💬 <b>KONTAK &amp; LAYANAN PELANGGAN</b>\n\n` +
        `Butuh bantuan konsultasi bahan, ukuran, jumlah pesanan, atau request mockup sablon gratis?\n\n` +
        `Silakan hubungi Admin &amp; CS kami melalui kontak resmi berikut:\n\n` +
        `📱 <b>WhatsApp:</b> <a href="${STUDIO.waUrl}">${STUDIO.whatsapp}</a> (Fast Response)\n` +
        `📞 <b>Telepon:</b> <code>${STUDIO.whatsapp}</code>\n` +
        `📧 <b>Email:</b> <code>${STUDIO.email}</code>\n` +
        `🏠 <b>Workshop:</b> ${STUDIO.address}\n\n` +
        `Jam Operasional: Setiap Hari (Layanan Bot 24 Jam &amp; CS Fast Response).`;

    const keyboard = {
        inline_keyboard: [
            [
                { text: "🟢 Chat CS via WhatsApp", url: STUDIO.waUrl },
                { text: "📞 Hubungi Telepon", url: `tel:${STUDIO.whatsapp}` }
            ],
            [
                { text: "ℹ️ Informasi Pemesanan di Web", url: STUDIO.orderInfoUrl }
            ],
            [
                { text: "🔙 Menu Utama", callback_data: "menu_main" }
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
        `📦 <b>INFORMASI STOK &amp; HARGA VOUCHER PROMO</b>\n\n` +
        `🛍️ Produk: <b>${STUDIO.productName}</b>\n` +
        `🏢 Merchant: <b>${STUDIO.name}</b>\n` +
        `📦 Stok Tersedia: <b>${count} Pcs</b>\n` +
        `💰 Harga Satuan: <b>${formatRp(price)}</b>\n` +
        `⚡ Pengiriman: <b>Otomatis Instan 24 Jam via Bot</b>\n` +
        `💳 Pembayaran: <b>QRIS (GoPay, BCA, DANA, OVO, ShopeePay, Livin, dll)</b>\n\n` +
        `<i>Kode voucher promo dapat digunakan untuk potongan langsung biaya produksi sablon &amp; konveksi di Detail Sablon Studio.</i>\n\n` +
        (count > 0 ? `Siap untuk memesan? Klik tombol beli di bawah:` : `<i>Maaf, stok voucher saat ini sedang habis.</i>`);

    const keyboard = {
        inline_keyboard: [
            count > 0 ? [{ text: "🛍️ Beli Voucher Promo", callback_data: "menu_buy" }] : [],
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
            `🛍️ Produk: <b>${STUDIO.productName}</b>\n` +
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
        return sendMessage(chatId, `❌ <b>Maaf, stok ${STUDIO.productName} sedang HABIS.</b> Silakan cek kembali nanti.`, {
            inline_keyboard: [[{ text: "🔙 Menu Utama", callback_data: "menu_main" }]]
        });
    }

    const text =
        `🛍️ <b>PILIH JUMLAH PEMBELIAN VOUCHER</b>\n\n` +
        `🛍️ Produk: <b>${STUDIO.productName}</b>\n` +
        `📦 Stok Tersedia: <b>${count} Pcs</b>\n` +
        `💰 Harga Satuan: <b>${formatRp(price)}</b>\n\n` +
        `Pilih berapa banyak voucher yang ingin Anda beli:`;

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
        `ℹ️ <b>PANDUAN PEMBELIAN VOUCHER ${STUDIO.name}</b>\n\n` +
        `1. Klik menu <b>🛍️ Beli Voucher Promo</b>.\n` +
        `2. Pilih jumlah voucher yang ingin Anda beli (1 Pcs, 2 Pcs, dst).\n` +
        `3. Bot akan mengirimkan gambar <b>QRIS Dinamis</b> dengan nominal total persis.\n` +
        `4. Buka aplikasi m-Banking atau E-Wallet Anda (GoPay, BCA, DANA, OVO, ShopeePay, Livin', dll).\n` +
        `5. Scan QR code tersebut. Nominal akan terisi secara otomatis.\n` +
        `6. Begitu pembayaran Anda selesai, <b>Kode Voucher Promo akan dikirim detik itu juga secara otomatis!</b>\n` +
        `7. Tunjukkan kode voucher ini ke CS WhatsApp <b>${STUDIO.whatsapp}</b> saat order apparel untuk menikmati potongan diskon.\n\n` +
        `Jika ada kendala, hubungi CS kami: <a href="${STUDIO.waUrl}">${STUDIO.whatsapp}</a> atau @prasojotrii`;

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
        `📲 <b>TAGIHAN VOUCHER PROMO ${STUDIO.name}</b>\n\n` +
        `🆔 Order ID: <code>${orderId}</code>\n` +
        `🛍️ Produk: <b>${STUDIO.productName}</b>\n` +
        `📦 Jumlah: <b>${qty} Pcs</b>\n` +
        `💰 Harga Barang: ${formatRp(basePrice)}\n` +
        `🔢 Kode Unik: +${formatRp(uniqueCode)}\n` +
        `💳 <b>TOTAL BAYAR: ${formatRp(totalPayment)}</b>\n` +
        `📌 Merchant: <b>Mas Mas IT, SIDOREJO (${STUDIO.name})</b>\n` +
        `⏳ Batas Waktu: <b>${ORDER_EXPIRE_MINUTES} Menit</b>\n\n` +
        `Scan QR di atas dengan GoPay, BCA, DANA, OVO, ShopeePay, atau m-Banking.\n` +
        `<i>(Nominal ${formatRp(totalPayment)} sudah otomatis terisi saat scan QR)</i>\n\n` +
        `⚡ <b>${qty} Kode voucher promo akan dikirim detik itu juga secara otomatis!</b>`;

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
            `🛎 <b>Order Baru Masuk - ${STUDIO.name}</b>\n` +
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
            inline_keyboard: [[{ text: "🛍️ Beli Voucher Promo", callback_data: "menu_buy" }]]
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
    try {
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
    } catch (err) {
        console.error('[BotManager] checkOrder error:', err);
        return sendMessage(chatId, `⚠️ Terjadi kendala saat memeriksa pesanan: ${err.message}`);
    }
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
        `Terima kasih telah berbelanja <b>${qty} Pcs Voucher Promo</b> (${formatRp(updated.amount)}) di <b>${STUDIO.name}</b>.\n\n` +
        `🔑 <b>KODE VOUCHER PROMO ANDA:</b>\n${codesFormatted}\n\n` +
        `<i>Ketuk kode di atas untuk menyalin. Tunjukkan kode ini kepada CS saat memesan apparel untuk klaim potongan diskon!</i>\n\n` +
        `📲 Chat CS WhatsApp: <a href="${STUDIO.waUrl}">${STUDIO.whatsapp}</a>\n` +
        `🌐 Website: <a href="${STUDIO.website}">${STUDIO.website}</a>`;

    await sendMessage(updated.chatId, messageText, {
        inline_keyboard: [
            [{ text: "🛍️ Beli Voucher Lagi", callback_data: "menu_buy" }],
            [{ text: "📦 Katalog Layanan", callback_data: "menu_catalog" }],
            [{ text: "🏠 Menu Utama", callback_data: "menu_main" }]
        ]
    });

    if (CHANNEL_ID) {
        postPaymentSuccessToChannel(orderId, updated.amount, qty, updated.chatId).catch(() => {});
    }

    if (ADMIN_CHAT_ID && String(ADMIN_CHAT_ID) !== String(updated.chatId)) {
        sendMessage(ADMIN_CHAT_ID,
            `✅ <b>Pembayaran Selesai - ${STUDIO.name}</b>\n` +
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
        `🏢 Merchant: <b>${STUDIO.name}</b>\n` +
        `🆔 Order: <code>${orderId}</code>\n` +
        `🛍️ Produk: <b>${STUDIO.productName} (${qty} Pcs)</b>\n` +
        `💰 Total: <b>${formatRp(amount)}</b>\n` +
        `👤 Pembeli: <code>${masked}</code>\n` +
        `🕒 ${time}\n` +
        `⏳ Status: <b>Menunggu Pembayaran</b>\n\n` +
        `🛒 Order via @tokojojo_bot | ${STUDIO.website}`;

    return sendMessage(CHANNEL_ID, text);
}

async function postPaymentSuccessToChannel(orderId, amount, qty, chatId) {
    const masked = String(chatId).substring(0, 4) + '****';
    const time = formatDateWib();
    const text =
        `🎉 <b>TRANSAKSI BERHASIL / LUNAS!</b>\n\n` +
        `🏢 Merchant: <b>${STUDIO.name}</b>\n` +
        `🆔 Order: <code>${orderId}</code>\n` +
        `🛍️ Produk: <b>${STUDIO.productName} (${qty} Pcs)</b>\n` +
        `💰 Total: <b>${formatRp(amount)}</b>\n` +
        `👤 Pembeli: <code>${masked}</code>\n` +
        `🕒 ${time}\n\n` +
        `✅ <b>${qty} Kode voucher promo terkirim otomatis!</b>\n` +
        `🛒 Order via @tokojojo_bot | ${STUDIO.website}`;

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
        const userId = msg.from?.id || chatId;
        const text = (msg.text || '').trim();
        const parts = text.split(/\s+/);
        const cmd = parts[0].toLowerCase().replace(/@\w+/, '');

        // Validasi wajib langganan channel untuk pengguna (kecuali admin & /myid)
        if (cmd !== '/myid' && String(chatId) !== String(ADMIN_CHAT_ID)) {
            const isSub = await isUserSubscribed(userId);
            if (!isSub) {
                await sendSubscriptionRequired(chatId);
                return;
            }
        }

        switch (cmd) {
            case '/start':
            case '/menu':
                await sendMainMenu(chatId);
                break;

            case '/katalog':
            case '/produk':
            case '/layanan':
                await sendCatalog(chatId);
                break;

            case '/tentang':
            case '/about':
            case '/lokasi':
                await sendStudioProfile(chatId);
                break;

            case '/kontak':
            case '/wa':
            case '/cs':
                await sendContactInfo(chatId);
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
                        inline_keyboard: [[{ text: "🛍️ Beli Voucher Promo", callback_data: "menu_buy" }]]
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
                await sendMessage(chatId, `✅ Berhasil menambahkan <b>${added.length}</b> voucher ke stok! Total stok sekarang: <b>${storeManager.countAvailable()} Pcs</b>.`);
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
                    ? `✅ Order <code>${targetOrder}</code> berhasil dikonfirmasi dan kode voucher telah dikirimkan ke pembeli!`
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
        const userId = cq.from?.id || chatId;
        const data = cq.data || '';

        // Penanganan tombol verifikasi langganan channel
        if (data === 'check_subscription') {
            const isSub = await isUserSubscribed(userId);
            if (isSub) {
                await answerCallbackQuery(cqId, '✅ Verifikasi berhasil! Selamat datang.', false);
                await sendMessage(chatId, `🎉 <b>Verifikasi Berhasil!</b> Terima kasih telah bergabung ke channel kami.`);
                await sendMainMenu(chatId);
            } else {
                await answerCallbackQuery(cqId, '❌ Anda belum terdeteksi bergabung ke channel!', false);
                await sendSubscriptionRequired(chatId);
            }
            return;
        }

        // Validasi wajib join channel untuk aksi tombol (kecuali admin)
        if (String(chatId) !== String(ADMIN_CHAT_ID)) {
            const isSub = await isUserSubscribed(userId);
            if (!isSub) {
                await answerCallbackQuery(cqId, '🔒 Wajib gabung channel terlebih dahulu!', false);
                await sendSubscriptionRequired(chatId);
                return;
            }
        }

        if (data.startsWith('check_order:')) {
            const orderId = data.replace('check_order:', '');
            await answerCallbackQuery(cqId, '🔍 Memeriksa mutasi pembayaran GoPay...', false);
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
            } else if (data === 'menu_catalog') {
                await sendCatalog(chatId);
            } else if (data === 'menu_about') {
                await sendStudioProfile(chatId);
            } else if (data === 'menu_contact') {
                await sendContactInfo(chatId);
            } else if (data === 'menu_stock') {
                await sendStockInfo(chatId);
            } else if (data === 'menu_buy') {
                await showQuantitySelector(chatId);
            } else if (data === 'menu_my_order') {
                const pending = storeManager.findPendingOrderByChat(chatId);
                if (!pending) {
                    await sendMessage(chatId, `ℹ️ Anda tidak memiliki pesanan yang sedang aktif saat ini.`, {
                        inline_keyboard: [[{ text: "🛍️ Beli Voucher Promo", callback_data: "menu_buy" }]]
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
