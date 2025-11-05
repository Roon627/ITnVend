import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import https from 'https';
import twemoji from 'twemoji';

// Twemoji cache settings
const TWEMOJI_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const TWEMOJI_CACHE_CLEAN_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
let _lastTwemojiCacheCleanup = 0;

const CURRENCY_SYMBOLS = {
    USD: '$',
    EUR: '\u20AC',
    GBP: '\u00A3',
    MVR: 'MVR',
    JPY: '\u00A5',
    AUD: 'A$',
    CAD: 'C$',
    SGD: 'S$',
    INR: '\u20B9',
};

export async function generateInvoicePdf(invoice, dataCallback, endCallback) {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    doc.on('data', dataCallback);
    doc.on('end', endCallback);

    const resolveLocalImagePath = (raw) => {
        if (!raw) return null;
        let candidate = String(raw).trim();
        if (!candidate) return null;
        if (/^https?:\/\//i.test(candidate)) {
            try {
                const parsed = new URL(candidate);
                candidate = parsed.pathname;
            } catch (err) {
                return null;
            }
        }
        candidate = candidate.replace(/^\/+/, '').replace(/\\/g, '/');
        const attempts = new Set();
        const pushAttempt = (value) => {
            if (!value) return;
            attempts.add(path.normalize(value));
        };

        pushAttempt(path.join(process.cwd(), candidate));
        pushAttempt(path.join(process.cwd(), 'public', candidate));

        if (candidate.startsWith('uploads/')) {
            pushAttempt(path.join(process.cwd(), 'public', candidate.replace(/^uploads\//, 'images/')));
        }
        if (candidate.startsWith('images/')) {
            pushAttempt(path.join(process.cwd(), 'public', candidate));
        }
        if (candidate.includes('public/images')) {
            const idx = candidate.toLowerCase().indexOf('public/images');
            const suffix = candidate.slice(idx + 'public/images'.length).replace(/^\/+/, '');
            pushAttempt(path.join(process.cwd(), 'public', 'images', suffix));
        }

        for (const attempt of attempts) {
            try {
                if (attempt && fs.existsSync(attempt)) return attempt;
            } catch (err) {
                // ignore
            }
        }
        return null;
    };

    const fetchImageBuffer = (url) => new Promise((resolve, reject) => {
        try {
            // Simple caching: store twemoji images under public/images/twemoji/<basename>
            const cacheDir = path.join(process.cwd(), 'public', 'images', 'twemoji');
            try { fs.mkdirSync(cacheDir, { recursive: true }); } catch (e) {}
            // perform periodic cleanup of old cached files
            try {
                const now = Date.now();
                if (!_lastTwemojiCacheCleanup || (now - _lastTwemojiCacheCleanup) > TWEMOJI_CACHE_CLEAN_INTERVAL_MS) {
                    _lastTwemojiCacheCleanup = now;
                    // cleanup function: remove files older than TTL
                    try {
                        const files = fs.readdirSync(cacheDir || '.');
                        for (const f of files) {
                            try {
                                const p = path.join(cacheDir, f);
                                const stat = fs.statSync(p);
                                if (Date.now() - stat.mtimeMs > TWEMOJI_CACHE_TTL_MS) {
                                    try { fs.unlinkSync(p); } catch (e) {}
                                }
                            } catch (e) { /* ignore per-file errors */ }
                        }
                    } catch (e) { /* ignore cleanup errors */ }
                }
            } catch (e) { /* ignore */ }
            let key = null;
            try {
                const u = new URL(url);
                key = path.basename(u.pathname);
            } catch (err) {
                // fallback to sanitized name
                key = url.replace(/[^a-z0-9\.\-]/gi, '_');
            }
            const cachedPath = path.join(cacheDir, key);
            try {
                if (fs.existsSync(cachedPath)) {
                    return resolve(fs.readFileSync(cachedPath));
                }
            } catch (err) {}

            const parts = new URL(url);
            const get = parts.protocol === 'https:' ? https.get : https.get;
            get(url, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    return fetchImageBuffer(res.headers.location).then(resolve).catch(reject);
                }
                if (res.statusCode !== 200) return reject(new Error(`Failed to fetch ${url}: ${res.statusCode}`));
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => {
                    const buf = Buffer.concat(chunks);
                    try { fs.writeFileSync(cachedPath, buf); } catch (err) { /* ignore write errors */ }
                    resolve(buf);
                });
            }).on('error', reject);
        } catch (err) { reject(err); }
    });

    const outlet = invoice.outlet || {};
    const outletName = outlet.name || invoice.outlet_name || 'My Outlet';
    const currency = outlet.currency || invoice.currency || 'MVR';
    const currencySymbol = CURRENCY_SYMBOLS[currency] || currency;
    const documentLabel = (invoice.type || 'invoice').toLowerCase() === 'quote' ? 'QUOTATION' : 'INVOICE';

    // Header: logo placeholder + company
    const startX = doc.x;
    // Try to render a saved logo if provided
    try {
        if (outlet.logo_url) {
            const imgPath = resolveLocalImagePath(outlet.logo_url);
            if (imgPath) {
                doc.image(imgPath, startX, doc.y, { width: 90, height: 50, fit: [90, 50] });
            } else {
                doc.rect(startX, doc.y, 90, 50).stroke();
                doc.fontSize(10).text('LOGO', startX + 28, doc.y + 16);
            }
        } else {
            doc.rect(startX, doc.y, 90, 50).stroke();
            doc.fontSize(10).text('LOGO', startX + 28, doc.y + 16);
        }
    } catch (err) {
        doc.rect(startX, doc.y, 90, 50).stroke();
        doc.fontSize(10).text('LOGO', startX + 28, doc.y + 16);
    }

    // Company name & address
    doc.fontSize(18).text(outletName, startX + 110, doc.y - 6);
    if (outlet.store_address) {
        doc.fontSize(10).text(outlet.store_address, startX + 110, doc.y + 8);
    }

    // Invoice label on right (styled)
    const labelWidth = 140;
    const labelHeight = 36;
    const pageWidth = doc.page.width - doc.page.margins.right;
    doc.save();
    doc.rect(pageWidth - labelWidth, doc.y, labelWidth, labelHeight).fill('#111827');
    doc.fillColor('#ffffff').fontSize(14).text(documentLabel, pageWidth - labelWidth + 10, doc.y + 8, { width: labelWidth - 20, align: 'center' });
    doc.restore();
    doc.moveDown(1.2);

    // Meta information row
    const metaTop = doc.y;
    doc.fontSize(10).fillColor('#000');
    doc.text(`Invoice #: ${invoice.id}`, startX, metaTop + 10);
    doc.text(`Date: ${new Date(invoice.created_at).toLocaleString()}`, startX, doc.y + 2);
    if (invoice.status) doc.text(`Status: ${invoice.status}`, startX, doc.y + 2);

    // Customer block
    const customerX = 350;
    doc.fontSize(10).text('Bill To:', customerX, metaTop + 10);
    doc.fontSize(10).text(invoice.customer?.name || '-', customerX, doc.y + 2);
    if (invoice.customer?.email) doc.fontSize(10).text(invoice.customer.email, customerX, doc.y + 2);
    if (invoice.customer?.phone) doc.fontSize(10).text(invoice.customer.phone, customerX, doc.y + 2);

    doc.moveDown(1.5);

    // Items table header
    const tableTop = doc.y;
    doc.fontSize(10).fillColor('#555');
    doc.rect(50, tableTop - 4, 500, 20).fillAndStroke('#f3f4f6', '#e5e7eb');
    doc.fillColor('#111');
    doc.text('Description', 60, tableTop);
    doc.text('Qty', 330, tableTop, { width: 50, align: 'right' });
    doc.text('Unit', 390, tableTop, { width: 80, align: 'right' });
    doc.text('Line Total', 470, tableTop, { width: 80, align: 'right' });

    let y = tableTop + 24;
    doc.fontSize(10);
    (invoice.items || []).forEach(item => {
        doc.text(item.name || '-', 60, y, { width: 260 });
        doc.text(String(item.quantity || 1), 330, y, { width: 50, align: 'right' });
        doc.text(`${currencySymbol}${(item.price || 0).toFixed(2)}`, 390, y, { width: 80, align: 'right' });
        doc.text(`${currencySymbol}${((item.quantity || 1) * (item.price || 0)).toFixed(2)}`, 470, y, { width: 80, align: 'right' });
        y += 20;
        if (y > 720) { doc.addPage(); y = 50; }
    });

    // Totals box
    const subtotal = invoice.subtotal ?? invoice.items?.reduce((s, it) => s + ((it.price || 0) * (it.quantity || 1)), 0) ?? 0;
    const tax = invoice.tax_amount ?? 0;
    const total = invoice.total ?? (subtotal + tax);

    doc.rect(350, y + 10, 200, 70).stroke();
    doc.fontSize(10).text('Subtotal:', 360, y + 18, { width: 120, align: 'left' });
    doc.text(`${currencySymbol}${subtotal.toFixed(2)}`, 470, y + 18, { width: 80, align: 'right' });
    doc.text('Tax:', 360, y + 36, { width: 120, align: 'left' });
    doc.text(`${currencySymbol}${tax.toFixed(2)}`, 470, y + 36, { width: 80, align: 'right' });
    doc.fontSize(12).text('Total:', 360, y + 54, { width: 120, align: 'left' });
    doc.fontSize(14).text(`${currencySymbol}${total.toFixed(2)}`, 470, y + 50, { width: 80, align: 'right' });

    // Optional invoice note / footer - strip HTML for PDF and attempt to render inline images
    const footerParts = [];
    if (outlet.invoice_template) footerParts.push(String(outlet.invoice_template || ''));
    if (outlet.payment_instructions) footerParts.push(String(outlet.payment_instructions || ''));

    // Append a small final footer note after payment instructions
    const finalFooterNote = outlet.footer_note || 'Please keep this invoice as proof of payment.';
    if (finalFooterNote && String(finalFooterNote).trim()) {
        footerParts.push(String(finalFooterNote));
    }

    if (footerParts.length) {
        try {
            let raw = footerParts.join('\n\n');

            // Use twemoji to convert emoji characters into <img src> tags (pointing to twemoji CDN)
            try {
                raw = twemoji.parse(raw, {
                    folder: '72x72',
                    ext: '.png',
                    base: 'https://twemoji.maxcdn.com/v/latest/'
                });
            } catch (err) {
                // if twemoji parsing fails, continue with raw
            }

            // find image srcs
            const imgSrcs = [];
            let m;
            const imgRe = /<img[^>]*src=["']?([^"' >]+)["']?[^>]*>/gi;
            while ((m = imgRe.exec(raw)) !== null) {
                imgSrcs.push(m[1]);
            }

            // strip html but preserve line breaks
            const text = raw.replace(/<br\s*\/?/gi, '\\n').replace(/<[^>]+>/g, '');

            // render text and images inline (handle wrapping)
            doc.moveDown(2);
            doc.fontSize(9).fillColor('#444');

            const renderX = 50;
            const renderYStart = y + 100;
            const maxWidth = 500;

            // Normalize various <br> forms and encoded variants to newlines for layout
            raw = raw.replace(/&lt;br\s*\/?&gt;/gi, "\n");
            raw = raw.replace(/<br\s*\/?/gi, "\n");
            // also handle stray 'br/>' or 'br>' fragments that may appear after earlier sanitization
            raw = raw.replace(/br\s*\/?\>/gi, "\n");

            // Build ordered segments from the raw HTML (either text or <img ...>)
            const segments = [];
            const segRe = /(<img[^>]*src=["']?([^"' >]+)["']?[^>]*>)|([^<]+)/gi;
            let sm;
            while ((sm = segRe.exec(raw)) !== null) {
                if (sm[1]) {
                    segments.push({ type: 'img', src: sm[2] });
                } else if (sm[3]) {
                    // text: preserve newlines
                    segments.push({ type: 'text', text: sm[3] });
                }
            }

            // Prefetch image buffers into a map
            const imgBufferMap = {};
            for (const s of segments) {
                if (s.type === 'img' && s.src) {
                    try {
                        const localPath = resolveLocalImagePath(s.src);
                        if (localPath) {
                            imgBufferMap[s.src] = fs.readFileSync(localPath);
                        } else {
                            try {
                                imgBufferMap[s.src] = await fetchImageBuffer(s.src);
                            } catch (err) {
                                imgBufferMap[s.src] = null;
                            }
                        }
                    } catch (err) {
                        imgBufferMap[s.src] = null;
                    }
                }
            }

            // Layout: render tokens inline, measuring widths to wrap as needed
            let curX = renderX;
            let curY = renderYStart;
            // emoji sizing & layout tweaks
            const imgW = 14;
            const imgH = 14;
            const gapAfterImg = 6;
            const lineHeight = 16; // increased line height for footer to avoid crowding

            for (const s of segments) {
                if (s.type === 'text') {
                    // split by lines then by words to preserve newlines
                    const lines = s.text.split('\n');
                    for (let li = 0; li < lines.length; li++) {
                        const line = lines[li];
                        const parts = line.split(/(\s+)/).filter(p => p !== '');
                        for (const part of parts) {
                            const word = part;
                            const w = doc.widthOfString(word);
                            const remaining = renderX + maxWidth - curX;
                            if (w > remaining) {
                                // move to next line
                                curY += lineHeight;
                                curX = renderX;
                            }
                            // draw the word at curX, curY
                            try {
                                doc.text(word, curX, curY, { width: Math.max(0, renderX + maxWidth - curX) });
                            } catch (err) {
                                // ignore
                            }
                            curX += w;
                            // add a space after word if not end of line
                            curX += doc.widthOfString(' ');
                        }
                        // after each explicit newline, move to next line
                        if (li < lines.length - 1) {
                            curY += lineHeight;
                            curX = renderX;
                        }
                    }
                } else if (s.type === 'img') {
                    const buf = imgBufferMap[s.src];
                    if (!buf) continue;
                    const remaining = renderX + maxWidth - curX;
                    if (imgW > remaining) {
                        curY += lineHeight;
                        curX = renderX;
                    }
                    try {
                        // draw image slightly adjusted vertically to align with text baseline
                        const imgY = curY - Math.floor(imgH / 3);
                        doc.image(buf, curX, imgY, { width: imgW, height: imgH, fit: [imgW, imgH] });
                    } catch (err) {}
                    curX += imgW + gapAfterImg;
                }
            }
        } catch (err) {
            // safe fallback: print raw text
            doc.moveDown(2);
            doc.fontSize(9).fillColor('#444').text(String(footerParts.join('\n\n')), 50, y + 100, { width: 500 });
        }
    }

    doc.moveDown(2);
    doc.fontSize(9).fillColor('#666').text('Thank you for your business!', 50, doc.y + 20);

    doc.end();
}
