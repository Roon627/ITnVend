import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import Tesseract from 'tesseract.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 16 * 1024 * 1024,
  },
});

function sanitizeText(value) {
  if (!value) return '';
  return value
    .toString()
    .replace(/[^0-9a-z]/gi, '')
    .toUpperCase();
}

function levenshteinDistance(a, b) {
  const lenA = a.length;
  const lenB = b.length;
  if (lenA === 0) return lenB;
  if (lenB === 0) return lenA;

  const matrix = Array.from({ length: lenA + 1 }, () => new Array(lenB + 1).fill(0));
  for (let i = 0; i <= lenA; i += 1) {
    matrix[i][0] = i;
  }
  for (let j = 0; j <= lenB; j += 1) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= lenA; i += 1) {
    for (let j = 1; j <= lenB; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[lenA][lenB];
}

function bestWindowDistance(needle, haystack) {
  if (!needle.length) return 0;
  if (!haystack.length) return needle.length;
  if (haystack.length <= needle.length) {
    return levenshteinDistance(needle, haystack);
  }
  let minDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i <= haystack.length - needle.length; i += 1) {
    const slice = haystack.slice(i, i + needle.length);
    const distance = levenshteinDistance(needle, slice);
    if (distance === 0) return 0;
    if (distance < minDistance) {
      minDistance = distance;
    }
  }
  return minDistance;
}

async function runOcr(buffer) {
  const result = await Tesseract.recognize(buffer, 'eng', { logger: () => {} });
  const extractedText = result?.data?.text || '';
  const confidence = Number(result?.data?.confidence || 0);
  return { extractedText, confidence };
}

router.post('/', upload.single('file'), async (req, res) => {
  try {
    const { transactionId, expectedAmount } = req.body || {};
    if (!transactionId || !transactionId.toString().trim()) {
      return res.status(400).json({ error: 'transactionId is required' });
    }
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'Slip file is required' });
    }

    let parsedExpectedAmount = null;
    if (expectedAmount !== undefined && expectedAmount !== null && expectedAmount !== '') {
      const normalized = expectedAmount.toString().replace(/[^0-9.,-]/g, '').replace(/,/g, '');
      const numeric = Number.parseFloat(normalized);
      if (!Number.isFinite(numeric)) {
        return res.status(400).json({ error: 'expectedAmount must be a number' });
      }
      parsedExpectedAmount = numeric;
    }

    const rawTransactionId = transactionId.toString().trim();
    const normalizedTransactionId = sanitizeText(rawTransactionId);
    if (!normalizedTransactionId) {
      return res.status(400).json({ error: 'transactionId must contain alphanumeric characters' });
    }

    const mimetype = req.file.mimetype || '';
    if (!mimetype.startsWith('image/') && mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Unsupported file type. Upload an image or PDF.' });
    }

    let processedBuffer;
    try {
      const sharpOptions = mimetype === 'application/pdf' ? { density: 300, pages: 1 } : undefined;
      const pipeline = sharpOptions ? sharp(req.file.buffer, sharpOptions) : sharp(req.file.buffer);
      processedBuffer = await pipeline
        .resize({ width: 1000, withoutEnlargement: true })
        .grayscale()
        .normalize()
        .toFormat('png')
        .toBuffer();
    } catch (imageErr) {
      console.error('Slip preprocessing failed', imageErr);
      return res.status(500).json({ error: 'Failed to preprocess slip image' });
    }

    let ocrResult;
    try {
      ocrResult = await runOcr(processedBuffer);
    } catch (ocrErr) {
      console.error('Slip OCR failed', ocrErr);
      return res.status(500).json({ error: 'Failed to read slip text' });
    }

    const cleanedText = ocrResult.extractedText.replace(/\s+/g, ' ').trim();
    const normalizedExtracted = sanitizeText(cleanedText);
    const includes = normalizedExtracted.includes(normalizedTransactionId);
    const distance = includes ? 0 : bestWindowDistance(normalizedTransactionId, normalizedExtracted);
    const match = includes || distance <= 1;

    console.info('Slip OCR text (first 500 chars):', cleanedText.slice(0, 500));

    const amountPattern = /(\d{1,3}(,\d{3})*(\.\d{2})?)/g;
    const matches = cleanedText.match(amountPattern) || [];
    const parsedAmounts = matches
      .map((entry) => entry.replace(/,/g, ''))
      .map((entry) => Number.parseFloat(entry))
      .filter((value) => Number.isFinite(value));

    let detectedAmount = null;
    if (parsedAmounts.length > 0) {
      const highest = Math.max(...parsedAmounts);
      const lastHighestIndex = parsedAmounts.lastIndexOf(highest);
      detectedAmount = parsedAmounts[lastHighestIndex];
    }

    console.info('Slip detected amounts:', parsedAmounts);
    if (parsedExpectedAmount !== null) {
      console.info('Slip expected amount:', parsedExpectedAmount);
    }
    if (detectedAmount !== null) {
      console.info('Slip detected amount chosen:', detectedAmount);
    }

    let amountMatch = null;
    if (parsedExpectedAmount !== null && detectedAmount !== null) {
      amountMatch = Math.abs(detectedAmount - parsedExpectedAmount) <= 1;
    }

    return res.json({
      match,
      confidence: ocrResult.confidence,
      extractedText: cleanedText,
      detectedAmount: detectedAmount !== null ? Number.parseFloat(detectedAmount.toFixed(2)) : null,
      expectedAmount: parsedExpectedAmount !== null ? Number.parseFloat(parsedExpectedAmount.toFixed(2)) : null,
      amountMatch,
    });
  } catch (err) {
    console.error('Slip validation error', err);
    return res.status(500).json({ error: 'Failed to validate slip' });
  }
});

export default router;
