import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

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

export function generateInvoicePdf(invoice, dataCallback, endCallback) {
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
    if (outlet.invoice_template) {
        try {
            const raw = String(outlet.invoice_template || '');
            // find image srcs
            const imgSrcs = [];
            let m;
            const imgRe = /<img[^>]*src=["']?([^"' >]+)["']?[^>]*>/gi;
            while ((m = imgRe.exec(raw)) !== null) {
                imgSrcs.push(m[1]);
            }

            // strip html but preserve line breaks
            const text = raw.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
            doc.moveDown(2);
            doc.fontSize(9).fillColor('#444').text(text, 50, y + 100, { width: 500 });

            // render any inline images referenced (attempt to resolve local /images paths)
            if (imgSrcs.length) {
                let imgX = 60;
                const imgY = doc.y + 8;
                for (const src of imgSrcs) {
                    try {
                        const imgPath = resolveLocalImagePath(src);
                        if (imgPath) {
                            doc.image(imgPath, imgX, imgY, { width: 24, height: 24, fit: [24, 24] });
                            imgX += 34;
                        }
                    } catch (err) {
                        // ignore image rendering errors
                    }
                }
            }
        } catch (err) {
            // safe fallback: print raw text
            doc.moveDown(2);
            doc.fontSize(9).fillColor('#444').text(String(outlet.invoice_template), 50, y + 100, { width: 500 });
        }
    }

    doc.moveDown(2);
    doc.fontSize(9).fillColor('#666').text('Thank you for your business!', 50, doc.y + 20);

    doc.end();
}
