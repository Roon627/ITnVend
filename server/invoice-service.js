import PDFDocument from 'pdfkit';

const CURRENCY_SYMBOLS = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    MVR: 'MVR',
    JPY: '¥',
    AUD: 'A$',
    CAD: 'C$',
    SGD: 'S$',
    INR: '₹',
};

export function generateInvoicePdf(invoice, dataCallback, endCallback) {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    doc.on('data', dataCallback);
    doc.on('end', endCallback);

    const outlet = invoice.outlet || {};
    const outletName = outlet.name || invoice.outlet_name || 'My Outlet';
    const currency = outlet.currency || invoice.currency || 'MVR';
    const currencySymbol = CURRENCY_SYMBOLS[currency] || currency;
    const documentLabel = (invoice.type || 'invoice').toLowerCase() === 'quote' ? 'QUOTATION' : 'INVOICE';

    // Header: logo placeholder + company
    const startX = doc.x;
    // logo box
    doc.rect(startX, doc.y, 90, 50).stroke();
    doc.fontSize(10).text('LOGO', startX + 28, doc.y + 16);

    // Company name & address
    doc.fontSize(18).text(outletName, startX + 110, doc.y - 6);
    if (outlet.store_address) {
        doc.fontSize(10).text(outlet.store_address, startX + 110, doc.y + 8);
    }

    // Invoice label box on right
    doc.fontSize(20).fillColor('#333').text(documentLabel, { align: 'right' });
    doc.moveDown(0.5);

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

    // Optional invoice note / footer
    if (outlet.invoice_template) {
        doc.moveDown(2);
        doc.fontSize(9).fillColor('#444').text(outlet.invoice_template, 50, y + 100, { width: 500 });
    }

    doc.moveDown(2);
    doc.fontSize(9).fillColor('#666').text('Thank you for your business!', 50, doc.y + 20);

    doc.end();
}
