import fs from 'fs';
import path from 'path';
import { generateInvoicePdf } from '../../POS/Backend/invoice-service.js';

async function run() {
  const outPath = path.join(process.cwd(), 'sample-invoice.pdf');
  const file = fs.createWriteStream(outPath);

  const sampleInvoice = {
    id: 1234,
    created_at: new Date().toISOString(),
    type: 'invoice',
    status: 'paid',
    items: [
      { name: 'Test Product', quantity: 2, price: 9.99 }
    ],
    subtotal: 19.98,
    tax_amount: 0,
    total: 19.98,
    outlet: {
      name: 'Demo Outlet',
      store_address: '123 Demo St\nCity, Country',
      invoice_template: 'Thank you for shopping with us!<br/>Contact: demo@example.com',
      payment_instructions: 'Please pay via bank transfer 🏦 or card 💳. Thank you!'
    }
  };

  console.log('Generating sample PDF:', outPath);

  await generateInvoicePdf(sampleInvoice, (chunk) => file.write(chunk), () => file.end());

  // Wait for file to finish writing
  await new Promise((resolve) => file.on('finish', resolve));
  console.log('Sample PDF written to', outPath);
}

run().catch((err) => { console.error(err); process.exitCode = 1; });
