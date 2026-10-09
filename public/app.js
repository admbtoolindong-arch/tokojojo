// ============================================================
// DETAIL SABLON STUDIO - INTERACTIVE APPLICATION LOGIC
// PT DETAIL AKSARA INDONESIA | detailsablonstudio.com
// ============================================================

const DSS_CONFIG = {
    whatsapp: '6281326035889',
    pollIntervalMs: 5000,
    activeOrder: null,
    pollTimer: null,
    countdownTimer: null
};

// Base pricing data for estimation
const PRICING_MATRIX = {
    'kaos-custom': {
        name: 'Kaos Custom Sablon',
        basePrice: 55000,
        options: {
            'combed-30s': 0,
            'combed-24s': 5000,
            'combed-20s': 9000,
            'heavyweight-16s': 18000
        },
        methods: {
            'plastisol': 5000,
            'dtf': 8000,
            'discharge': 7000,
            'rubber': 0
        },
        unit: 'Pcs',
        minQty: 12
    },
    'kaos-polos': {
        name: 'Kaos Polos Premium',
        basePrice: 35000,
        options: {
            'combed-30s': 0,
            'combed-24s': 4000,
            'combed-20s': 7000,
            'heavyweight-16s': 15000
        },
        methods: {
            'none': 0
        },
        unit: 'Pcs',
        minQty: 6
    },
    'jersey': {
        name: 'Jersey Printing Sublim',
        basePrice: 85000,
        options: {
            'dryfit-milano': 0,
            'dryfit-brazil': 5000,
            'dryfit-bintik': 3000
        },
        methods: {
            'full-sublim': 0
        },
        unit: 'Pcs',
        minQty: 12
    },
    'hoodie': {
        name: 'Hoodie & Crewneck Fleece',
        basePrice: 110000,
        options: {
            'cotton-fleece': 0,
            'fleece-tebal': 15000,
            'baby-terry': -5000
        },
        methods: {
            'bordir': 15000,
            'dtf': 12000,
            'plastisol': 10000
        },
        unit: 'Pcs',
        minQty: 12
    },
    'totebag': {
        name: 'Totebag Kanvas / Blacu',
        basePrice: 20000,
        options: {
            'blacu': 0,
            'kanvas-premium': 10000,
            'drill': 6000
        },
        methods: {
            'sablon-manual': 0,
            'dtf': 4000
        },
        unit: 'Pcs',
        minQty: 24
    },
    'dtf-meteran': {
        name: 'Cetak DTF High-Res Meteran',
        basePrice: 45000,
        options: {
            'lebar-58cm': 0
        },
        methods: {
            'pet-film-highres': 0
        },
        unit: 'Meter',
        minQty: 1
    }
};

let currentVoucherQty = 1;

// ------------------------------------------------------------
// INITIALIZATION ON DOM LOAD
// ------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initCalculator();
    fetchStoreInfo();
    initSalesToast();
});

// ------------------------------------------------------------
// NAVIGATION & UI
// ------------------------------------------------------------
function initNavigation() {
    const hamburger = document.getElementById('hamburger-btn');
    const navLinks = document.getElementById('nav-links');

    if (hamburger && navLinks) {
        hamburger.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            hamburger.classList.toggle('open');
        });

        // Close on link click
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('active');
                hamburger.classList.remove('open');
            });
        });
    }

    // Header scroll background effect
    const navbar = document.querySelector('.navbar');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 40) {
            navbar.style.background = 'rgba(10, 16, 26, 0.95)';
            navbar.style.boxShadow = '0 10px 30px rgba(0,0,0,0.4)';
        } else {
            navbar.style.background = 'rgba(10, 16, 26, 0.85)';
            navbar.style.boxShadow = 'none';
        }
    });
}

// ------------------------------------------------------------
// PRICE ESTIMATOR CALCULATOR
// ------------------------------------------------------------
function initCalculator() {
    const categorySelect = document.getElementById('calc-category');
    const fabricSelect = document.getElementById('calc-fabric');
    const methodSelect = document.getElementById('calc-method');
    const qtyInput = document.getElementById('calc-qty');

    if (!categorySelect || !qtyInput) return;

    // Populate fabric and print methods based on category
    function updateOptions() {
        const catKey = categorySelect.value;
        const config = PRICING_MATRIX[catKey] || PRICING_MATRIX['kaos-custom'];

        // Update fabric
        fabricSelect.innerHTML = '';
        Object.keys(config.options).forEach(key => {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = formatOptionLabel(key);
            fabricSelect.appendChild(opt);
        });

        // Update method
        methodSelect.innerHTML = '';
        Object.keys(config.methods).forEach(key => {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = formatOptionLabel(key);
            methodSelect.appendChild(opt);
        });

        // Min qty
        if (parseInt(qtyInput.value, 10) < config.minQty) {
            qtyInput.value = config.minQty;
        }

        calculateEstimate();
    }

    categorySelect.addEventListener('change', updateOptions);
    fabricSelect.addEventListener('change', calculateEstimate);
    methodSelect.addEventListener('change', calculateEstimate);
    qtyInput.addEventListener('input', calculateEstimate);

    updateOptions();
}

function formatOptionLabel(str) {
    return str
        .split('-')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

function calculateEstimate() {
    const category = document.getElementById('calc-category').value;
    const fabric = document.getElementById('calc-fabric').value;
    const method = document.getElementById('calc-method').value;
    let qty = parseInt(document.getElementById('calc-qty').value, 10) || 12;

    const config = PRICING_MATRIX[category] || PRICING_MATRIX['kaos-custom'];
    if (qty < 1) qty = 1;

    let unit = config.basePrice;
    if (config.options[fabric] !== undefined) unit += config.options[fabric];
    if (config.methods[method] !== undefined) unit += config.methods[method];

    // Bulk discount tiers
    let discountPct = 0;
    if (qty >= 100) discountPct = 0.12;      // 12% off for 100+
    else if (qty >= 50) discountPct = 0.08;  // 8% off for 50+
    else if (qty >= 24) discountPct = 0.04;  // 4% off for 24+

    const discountedUnit = Math.round(unit * (1 - discountPct));
    const totalPrice = discountedUnit * qty;

    // Production time estimate
    let prodTime = '5 - 7 Hari Kerja';
    if (qty >= 100) prodTime = '7 - 12 Hari Kerja';
    if (category === 'dtf-meteran') prodTime = '1 - 2 Hari Kerja (Bisa Sameday)';

    document.getElementById('calc-unit-price').textContent = formatRp(discountedUnit);
    document.getElementById('calc-total-price').textContent = formatRp(totalPrice);
    document.getElementById('calc-prod-time').textContent = prodTime;

    const discountTag = document.getElementById('calc-discount-tag');
    if (discountTag) {
        if (discountPct > 0) {
            discountTag.style.display = 'inline-block';
            discountTag.textContent = `Diskon Qty: ${(discountPct * 100)}% Hemat!`;
        } else {
            discountTag.style.display = 'none';
        }
    }
}

function sendEstimateToWA() {
    const category = document.getElementById('calc-category').options[document.getElementById('calc-category').selectedIndex].text;
    const fabric = document.getElementById('calc-fabric').options[document.getElementById('calc-fabric').selectedIndex].text;
    const method = document.getElementById('calc-method').options[document.getElementById('calc-method').selectedIndex].text;
    const qty = document.getElementById('calc-qty').value;
    const unitPrice = document.getElementById('calc-unit-price').textContent;
    const totalPrice = document.getElementById('calc-total-price').textContent;

    const message = 
        `Halo Detail Sablon Studio! 👋\n` +
        `Saya tertarik untuk konsultasi produksi apparel dengan detail estimasi berikut:\n\n` +
        `👕 Produk: *${category}*\n` +
        `🧵 Bahan: *${fabric}*\n` +
        `🎨 Sablon/Aplikasi: *${method}*\n` +
        `📦 Jumlah: *${qty} Pcs/Meter*\n` +
        `💰 Estimasi Harga Satuan: *${unitPrice}*\n` +
        `💵 Estimasi Total: *${totalPrice}*\n\n` +
        `Mohon info ketersediaan slot produksi dan panduan pengiriman file desain. Terima kasih!`;

    const url = `https://wa.me/${DSS_CONFIG.whatsapp}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
}

// ------------------------------------------------------------
// STORE INFO & VOUCHER SECTION
// ------------------------------------------------------------
async function fetchStoreInfo() {
    try {
        const res = await fetch('/api/store-info');
        const data = await res.json();
        if (data.success) {
            const stockBadge = document.getElementById('voucher-stock-badge');
            if (stockBadge) {
                stockBadge.textContent = `${data.stock} Voucher Tersedia`;
            }
            const priceEl = document.getElementById('voucher-unit-price');
            if (priceEl && data.price) {
                priceEl.textContent = formatRp(data.price);
            }
        }
    } catch (e) {
        console.warn('Could not fetch store info:', e.message);
    }
}

function selectVoucherQty(qty) {
    currentVoucherQty = qty;
    document.querySelectorAll('.qty-btn').forEach(btn => {
        if (parseInt(btn.getAttribute('data-qty'), 10) === qty) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    const price = 1000;
    const total = price * qty;
    const totalEl = document.getElementById('voucher-total-display');
    if (totalEl) {
        totalEl.textContent = formatRp(total);
    }
}

// ------------------------------------------------------------
// DIRECT QRIS WEB CHECKOUT
// ------------------------------------------------------------
async function openDirectQrisCheckout() {
    const modal = document.getElementById('qris-modal');
    const loadingState = document.getElementById('qris-loading-state');
    const contentState = document.getElementById('qris-content-state');
    const errorState = document.getElementById('qris-error-state');

    modal.classList.add('active');
    loadingState.style.display = 'flex';
    contentState.style.display = 'none';
    errorState.style.display = 'none';

    try {
        const res = await fetch('/api/create-web-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ qty: currentVoucherQty })
        });

        const data = await res.json();

        if (!data.success) {
            throw new Error(data.message || 'Gagal membuat QRIS pembayaran.');
        }

        DSS_CONFIG.activeOrder = data.data;

        // Render QRIS Info
        document.getElementById('modal-order-id').textContent = data.data.order_id;
        document.getElementById('modal-amount').textContent = formatRp(data.data.amount);
        document.getElementById('modal-qty-text').textContent = `${data.data.qty} Pcs Voucher Promo`;
        document.getElementById('modal-qr-img').src = data.data.qr_image_url;

        // Reset status badge
        const badge = document.getElementById('modal-status-badge');
        badge.className = 'status-badge status-pending';
        badge.innerHTML = '<span>🟡 Menunggu Pembayaran GoPay / QRIS</span>';

        document.getElementById('modal-success-box').style.display = 'none';
        document.getElementById('modal-btn-check').disabled = false;
        document.getElementById('modal-btn-check').style.display = 'flex';

        loadingState.style.display = 'none';
        contentState.style.display = 'block';

        // Start Countdown & Auto-poll
        startCountdown(data.data.expires_at);
        startAutoPoll(data.data.order_id);

    } catch (err) {
        loadingState.style.display = 'none';
        errorState.style.display = 'block';
        document.getElementById('qris-error-msg').textContent = err.message || 'Koneksi ke gateway pembayaran terputus.';
    }
}

function closeQrisModal() {
    const modal = document.getElementById('qris-modal');
    modal.classList.remove('active');
    stopAutoPoll();
    stopCountdown();
    DSS_CONFIG.activeOrder = null;
}

// ------------------------------------------------------------
// COUNTDOWN TIMER (30 MENIT)
// ------------------------------------------------------------
function startCountdown(expiresAtIso) {
    stopCountdown();
    const target = new Date(expiresAtIso).getTime();

    function update() {
        const now = Date.now();
        const diff = target - now;

        if (diff <= 0) {
            document.getElementById('modal-timer').textContent = '00:00 (Kedaluwarsa)';
            const badge = document.getElementById('modal-status-badge');
            badge.className = 'status-badge status-expired';
            badge.innerHTML = '<span>🔴 Waktu Pembayaran Habis</span>';
            stopAutoPoll();
            stopCountdown();
            return;
        }

        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        document.getElementById('modal-timer').textContent = 
            `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    update();
    DSS_CONFIG.countdownTimer = setInterval(update, 1000);
}

function stopCountdown() {
    if (DSS_CONFIG.countdownTimer) {
        clearInterval(DSS_CONFIG.countdownTimer);
        DSS_CONFIG.countdownTimer = null;
    }
}

// ------------------------------------------------------------
// AUTO-POLLING STATUS ORDER
// ------------------------------------------------------------
function startAutoPoll(orderId) {
    stopAutoPoll();
    DSS_CONFIG.pollTimer = setInterval(async () => {
        await checkPaymentStatus(orderId, false);
    }, DSS_CONFIG.pollIntervalMs);
}

function stopAutoPoll() {
    if (DSS_CONFIG.pollTimer) {
        clearInterval(DSS_CONFIG.pollTimer);
        DSS_CONFIG.pollTimer = null;
    }
}

async function checkPaymentStatusManual() {
    if (!DSS_CONFIG.activeOrder) return;
    const btn = document.getElementById('modal-btn-check');
    const spinner = document.getElementById('modal-btn-spinner');
    const label = document.getElementById('modal-btn-label');

    btn.disabled = true;
    spinner.style.display = 'inline-block';
    label.textContent = 'Memeriksa Mutasi GoPay...';

    await checkPaymentStatus(DSS_CONFIG.activeOrder.order_id, true);

    btn.disabled = false;
    spinner.style.display = 'none';
    label.textContent = '🔄 Cek Status Pembayaran';
}

async function checkPaymentStatus(orderId, isManual = false) {
    try {
        const res = await fetch(`/api/check-web-order/${encodeURIComponent(orderId)}`);
        const result = await res.json();

        if (result.success && result.status === 'PAID') {
            stopAutoPoll();
            stopCountdown();
            handlePaymentSuccess(result);
        } else if (isManual && result.status === 'PENDING') {
            showToast('⏳ Pembayaran belum terdeteksi. Pastikan scan QRIS telah selesai di aplikasi e-wallet Anda.');
        } else if (result.status === 'EXPIRED') {
            stopAutoPoll();
            stopCountdown();
            const badge = document.getElementById('modal-status-badge');
            badge.className = 'status-badge status-expired';
            badge.innerHTML = '<span>🔴 Transaksi Kedaluwarsa</span>';
        }
    } catch (e) {
        if (isManual) {
            showToast('⚠️ Gagal terhubung ke server pemeriksaan: ' + e.message);
        }
    }
}

function handlePaymentSuccess(data) {
    const badge = document.getElementById('modal-status-badge');
    badge.className = 'status-badge status-paid';
    badge.innerHTML = '<span>✅ Pembayaran Terverifikasi Lunas!</span>';

    const btn = document.getElementById('modal-btn-check');
    btn.style.display = 'none';

    // Show voucher codes list
    const box = document.getElementById('modal-success-box');
    const list = document.getElementById('modal-voucher-codes');
    list.innerHTML = '';

    if (data.codes && data.codes.length > 0) {
        data.codes.forEach(code => {
            const item = document.createElement('div');
            item.className = 'voucher-code-chip';
            item.innerHTML = `
                <code>${code}</code>
                <button onclick="copyToClipboard('${code}', this)" title="Salin Kode">📋 Salin</button>
            `;
            list.appendChild(item);
        });
    }

    box.style.display = 'block';

    // Update WhatsApp claim button
    const claimBtn = document.getElementById('modal-wa-claim-btn');
    if (claimBtn) {
        const waMsg = 
            `Halo Admin Detail Sablon Studio! 🙌\n` +
            `Saya telah berhasil menyelesaikan pembayaran voucher promo di web:\n` +
            `🆔 Order ID: ${data.order_id}\n` +
            `🎟️ Kode Voucher: ${data.codes ? data.codes.join(', ') : '-'}\n\n` +
            `Mohon dibantu konfirmasi dan proses order apparel saya. Terima kasih!`;
        claimBtn.href = `https://wa.me/${DSS_CONFIG.whatsapp}?text=${encodeURIComponent(waMsg)}`;
    }

    // Refresh stock counter
    fetchStoreInfo();
}

function copyToClipboard(text, btnEl) {
    navigator.clipboard.writeText(text).then(() => {
        const oldText = btnEl.textContent;
        btnEl.textContent = '✅ Tersalin!';
        setTimeout(() => {
            btnEl.textContent = oldText;
        }, 2000);
    }).catch(() => {
        prompt('Salin kode voucher Anda:', text);
    });
}

// ------------------------------------------------------------
// MANUAL ORDER CHECK MODAL
// ------------------------------------------------------------
function openCheckOrderModal() {
    const modal = document.getElementById('check-order-modal');
    modal.classList.add('active');
    document.getElementById('input-order-query').value = '';
    document.getElementById('order-query-result').style.display = 'none';
}

function closeCheckOrderModal() {
    const modal = document.getElementById('check-order-modal');
    modal.classList.remove('active');
}

async function queryOrderStatus() {
    const input = document.getElementById('input-order-query');
    const query = input.value.trim();
    if (!query) {
        showToast('Silakan masukkan nomor Order ID (contoh: DSS-WEB-...)');
        return;
    }

    const resBox = document.getElementById('order-query-result');
    resBox.style.display = 'block';
    resBox.innerHTML = '<div style="text-align:center; padding:16px;">🔍 Memeriksa database pesanan...</div>';

    try {
        const res = await fetch(`/api/check-web-order/${encodeURIComponent(query)}`);
        const data = await res.json();

        if (!data.success) {
            resBox.innerHTML = `
                <div class="result-alert result-error">
                    <strong>❌ Pesanan Tidak Ditemukan</strong>
                    <p>Order ID "${query}" tidak terdaftar dalam sistem atau telah kadaluwarsa.</p>
                </div>
            `;
            return;
        }

        if (data.status === 'PAID') {
            const codesHtml = (data.codes || []).map(c => `
                <div class="voucher-code-chip">
                    <code>${c}</code>
                    <button onclick="copyToClipboard('${c}', this)">📋 Salin</button>
                </div>
            `).join('');

            resBox.innerHTML = `
                <div class="result-alert result-success">
                    <div style="font-weight:700; font-size:16px; margin-bottom:6px;">✅ Pesanan Lunas & Aktif!</div>
                    <div style="font-size:13px; color:#cbd5e1; margin-bottom:12px;">Order ID: <b>${data.order_id}</b> | Total: <b>${formatRp(data.amount)}</b></div>
                    <div style="font-size:13px; font-weight:600; margin-bottom:8px;">Kode Voucher Anda:</div>
                    <div style="display:flex; flex-direction:column; gap:8px;">${codesHtml}</div>
                    <div style="margin-top:16px;">
                        <a href="https://wa.me/${DSS_CONFIG.whatsapp}?text=Halo%20Admin,%20saya%20sudah%20punya%20voucher%20${encodeURIComponent((data.codes||[]).join(','))}" target="_blank" class="btn btn-primary" style="width:100%; text-align:center;">
                            💬 Gunakan ke WhatsApp CS
                        </a>
                    </div>
                </div>
            `;
        } else if (data.status === 'PENDING') {
            resBox.innerHTML = `
                <div class="result-alert result-warning">
                    <div style="font-weight:700; font-size:16px; margin-bottom:6px;">⏳ Menunggu Pembayaran</div>
                    <div style="font-size:13px; color:#cbd5e1; margin-bottom:12px;">Order ID: <b>${data.order_id}</b> | Total: <b>${formatRp(data.amount)}</b></div>
                    <p style="font-size:13px; color:#94a3b8; margin-bottom:12px;">Pembayaran belum terdeteksi. Silakan transfer/scan QRIS tepat sesuai nominal.</p>
                    <button class="btn btn-primary" style="width:100%;" onclick="resumeOrderCheckout('${data.order_id}', ${data.amount})">
                        💳 Lanjutkan Pembayaran QRIS
                    </button>
                </div>
            `;
        } else {
            resBox.innerHTML = `
                <div class="result-alert result-error">
                    <strong>⚠️ Status Pesanan: ${data.status}</strong>
                    <p>Pesanan telah melewati batas waktu atau dibatalkan.</p>
                </div>
            `;
        }
    } catch (err) {
        resBox.innerHTML = `
            <div class="result-alert result-error">
                <strong>Gagal memuat status:</strong> ${err.message}
            </div>
        `;
    }
}

// ------------------------------------------------------------
// LIVE SALES SOCIAL PROOF TOAST
// ------------------------------------------------------------
const RECENT_CUSTOMERS = [
    { name: 'Aji Bramantya', city: 'Semarang', product: '2 Pcs Voucher Promo DSS', type: 'voucher' },
    { name: 'Fahmi', city: 'Solo', product: '36 Pcs Kaos Custom Combed 24s', type: 'apparel' },
    { name: 'Prasojo Tri', city: 'Semarang', product: '50 Pcs Jersey Sublim Dryfit', type: 'apparel' },
    { name: 'Nindy', city: 'Salatiga', product: '1 Pcs Voucher Promo DSS', type: 'voucher' },
    { name: 'Dea', city: 'Bandung', product: '24 Pcs Hoodie Cotton Fleece', type: 'apparel' },
    { name: 'Agus W.', city: 'Jakarta', product: '5 Meter Cetak DTF High-Res', type: 'apparel' },
    { name: 'Reyhan', city: 'Kudus', product: '5 Pcs Voucher Promo DSS', type: 'voucher' },
    { name: 'Dinar', city: 'Yogyakarta', product: '100 Pcs Kaos Event Combed 30s', type: 'apparel' },
    { name: 'AKSARA Clothing', city: 'Semarang', product: '80 Pcs Heavyweight T-Shirt', type: 'apparel' }
];

function initSalesToast() {
    const container = document.getElementById('sales-toast-container');
    if (!container) return;

    function showRandomSale() {
        const item = RECENT_CUSTOMERS[Math.floor(Math.random() * RECENT_CUSTOMERS.length)];
        const timeAgo = Math.floor(Math.random() * 8) + 1;

        const toast = document.createElement('div');
        toast.className = 'sales-toast';
        toast.innerHTML = `
            <div class="toast-icon">⚡</div>
            <div class="toast-content">
                <div class="toast-title"><b>${item.name}</b> (${item.city})</div>
                <div class="toast-desc">Baru saja memesan <b>${item.product}</b></div>
                <div class="toast-time">${timeAgo} menit yang lalu • Terverifikasi</div>
            </div>
        `;

        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('hide');
            setTimeout(() => toast.remove(), 400);
        }, 5500);
    }

    // First appearance after 6 seconds, then periodic interval
    setTimeout(() => {
        showRandomSale();
        setInterval(showRandomSale, 24000);
    }, 6000);
}

// ------------------------------------------------------------
// UTILITY HELPERS
// ------------------------------------------------------------
function formatRp(num) {
    return 'Rp ' + Number(num).toLocaleString('id-ID');
}

function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'global-toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('visible'), 50);
    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}
