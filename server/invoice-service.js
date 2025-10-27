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
    const doc = new PDFDocument({ margin: 50 });

    doc.on('data', dataCallback);
    doc.on('end', endCallback);

    const outlet = invoice.outlet || {};
    const outletName = outlet.name || invoice.outlet_name || 'My Outlet';
    const currency = outlet.currency || invoice.currency || 'MVR';
    const currencySymbol = CURRENCY_SYMBOLS[currency] || currency;
    const documentLabel = (invoice.type || 'invoice').toLowerCase() === 'quote' ? 'QUOTE' : 'INVOICE';

    // Header
    doc.fontSize(18).text(outletName, { align: 'left' });
    doc.fontSize(16).text(documentLabel, { align: 'right' });
    doc.moveDown();

    if (outlet.store_address) {
        doc.fontSize(10).text(outlet.store_address, { align: 'left' });
        doc.moveDown();
    }

    doc.fontSize(12).text(`Invoice Number: ${invoice.id}`);
    doc.text(`Date: ${new Date(invoice.created_at).toLocaleDateString()}`);
    doc.text(`Customer: ${invoice.customer?.name || ''}`);
    doc.text(`Currency: ${currency}`);
    if (invoice.status) {
        doc.text(`Status: ${invoice.status}`);
    }
    doc.moveDown(1);

    const tableTop = doc.y;
    doc.fontSize(10);
    doc.text('Item', 50, tableTop);
    doc.text('Quantity', 250, tableTop, { width: 100, align: 'right' });
    doc.text('Unit Price', 350, tableTop, { width: 100, align: 'right' });
    doc.text('Total', 450, tableTop, { width: 100, align: 'right' });
    doc.moveTo(50, doc.y + 5).lineTo(550, doc.y + 5).stroke();
    doc.moveDown();

    let y = doc.y;
    invoice.items.forEach(item => {
        doc.text(item.name, 50, y);
        doc.text(item.quantity.toString(), 250, y, { width: 100, align: 'right' });
        doc.text(`${currencySymbol}${item.price.toFixed(2)}`, 350, y, { width: 100, align: 'right' });
        doc.text(`${currencySymbol}${(item.quantity * item.price).toFixed(2)}`, 450, y, { width: 100, align: 'right' });
        y += 20;
    });
    doc.y = y;
    doc.moveTo(50, doc.y + 5).lineTo(550, doc.y + 5).stroke();
    doc.moveDown();

    const subtotal = invoice.subtotal ?? invoice.total ?? invoice.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const tax = invoice.tax_amount ?? 0;
    const total = invoice.total ?? (subtotal + tax);

    doc.fontSize(12).text(`Subtotal: ${currencySymbol}${subtotal.toFixed(2)}`, { align: 'right' });
    doc.moveDown(0.2);
    doc.fontSize(12).text(`Tax: ${currencySymbol}${tax.toFixed(2)}`, { align: 'right' });
    doc.moveDown(0.2);
    doc.fontSize(14).text(`Total: ${currencySymbol}${total.toFixed(2)}`, { align: 'right' });

    if (outlet.invoice_template) {
        doc.moveDown(2);
        doc.fontSize(10).text('--- Invoice Note ---', { align: 'left' });
        doc.fontSize(10).text(outlet.invoice_template, { align: 'left' });
    }

    doc.end();
}
