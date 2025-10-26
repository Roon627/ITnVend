import PDFDocument from 'pdfkit';

export function generateInvoicePdf(invoice, dataCallback, endCallback) {
    const doc = new PDFDocument({ margin: 50 });

    doc.on('data', dataCallback);
    doc.on('end', endCallback);

    // outlet may be passed as invoice.outlet
    const outlet = invoice.outlet || {};
    const outletName = outlet.name || invoice.outlet_name || 'My Outlet';
    const currency = outlet.currency || invoice.currency || 'MVR';
    const currencySymbol = currency === 'USD' ? '$' : 'MVR';

    // Header
    doc.fontSize(18).text(outletName, { align: 'left' });
    doc.fontSize(16).text('INVOICE', { align: 'right' });
    doc.moveDown();

    // Outlet address if exists
    if (outlet.store_address) {
        doc.fontSize(10).text(outlet.store_address, { align: 'left' });
        doc.moveDown();
    }

    // Info
    doc.fontSize(12).text(`Invoice Number: ${invoice.id}`);
    doc.text(`Date: ${new Date(invoice.created_at).toLocaleDateString()}`);
    doc.text(`Customer: ${invoice.customer?.name || ''}`);
    doc.text(`Currency: ${currency}`);
    doc.moveDown(1);

    // Table Header
    const tableTop = doc.y;
    doc.fontSize(10);
    doc.text('Item', 50, tableTop);
    doc.text('Quantity', 250, tableTop, { width: 100, align: 'right' });
    doc.text('Unit Price', 350, tableTop, { width: 100, align: 'right' });
    doc.text('Total', 450, tableTop, { width: 100, align: 'right' });
    doc.moveTo(50, doc.y + 5).lineTo(550, doc.y + 5).stroke();
    doc.moveDown();

    // Table Rows
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

    // Totals: subtotal, tax, total
    const subtotal = invoice.subtotal ?? invoice.total ?? invoice.items.reduce((s, it) => s + (it.price * it.quantity), 0);
    const tax = invoice.tax_amount ?? 0;
    const total = invoice.total ?? (subtotal + tax);

    doc.fontSize(12).text(`Subtotal: ${currencySymbol}${subtotal.toFixed(2)}`, { align: 'right' });
    doc.moveDown(0.2);
    doc.fontSize(12).text(`Tax: ${currencySymbol}${tax.toFixed(2)}`, { align: 'right' });
    doc.moveDown(0.2);
    doc.fontSize(14).text(`Total: ${currencySymbol}${total.toFixed(2)}`, { align: 'right' });

    // If outlet has an invoice_template text, append as footer (simple raw text)
    if (outlet.invoice_template) {
        doc.moveDown(2);
        doc.fontSize(10).text('--- Invoice Note ---', { align: 'left' });
        doc.fontSize(10).text(outlet.invoice_template, { align: 'left' });
    }

    doc.end();
}
