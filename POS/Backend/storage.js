import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Simple storage abstraction. Default: local disk under ./uploads/slips.
// If AWS_S3_BUCKET and AWS_REGION are provided AND @aws-sdk/client-s3 is installed,
// files will be uploaded to S3. The code dynamically imports the S3 client so
// the dependency remains optional for local-only development.

const UPLOADS_DIR = process.env.SLIPS_UPLOAD_DIR || path.join(process.cwd(), 'uploads', 'slips');

async function ensureUploadsDir() {
  try {
    await fs.promises.mkdir(UPLOADS_DIR, { recursive: true });
  } catch (err) {
    // ignore
  }
}

function safeFilename(name) {
  const ts = Date.now();
  const base = path.basename(name || 'slip');
  const clean = base.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${ts}-${clean}`;
}

export async function saveSlip(buffer, originalName) {
  // If S3 is configured, try to upload. Otherwise fallback to local disk.
  const bucket = process.env.AWS_S3_BUCKET;
  const region = process.env.AWS_REGION;

  const filename = safeFilename(originalName || 'slip.png');

  if (bucket && region) {
    try {
      // dynamic import so local dev doesn't need aws sdk
      const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
      const s3 = new S3Client({ region });
      const key = `slips/${filename}`;
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer }));
      // Public URL shape may vary; leave key for lookup and return a presigned-like path if needed
      const url = `s3://${bucket}/${key}`;
      return { storage: 's3', key, url };
    } catch (err) {
      console.warn('S3 upload failed or @aws-sdk/client-s3 not installed, falling back to local disk:', err?.message || err);
      // fallthrough to local disk
    }
  }

  await ensureUploadsDir();
  const filePath = path.join(UPLOADS_DIR, filename);
  await fs.promises.writeFile(filePath, buffer);

  // Expose path relative to uploads root; the server will serve /uploads
  const url = `/uploads/slips/${filename}`;
  return { storage: 'local', path: filePath, url };
}

export default { saveSlip };
