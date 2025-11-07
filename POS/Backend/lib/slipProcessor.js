import sharp from 'sharp';
import Tesseract from 'tesseract.js';

function sanitizeText(value) {
  if (!value) return '';
  return value.toString().replace(/[^0-9a-z]/gi, '').toUpperCase();
}

function levenshteinDistance(a, b) {
  const lenA = a.length;
  const lenB = b.length;
  if (lenA === 0) return lenB;
  if (lenB === 0) return lenA;
  const matrix = Array.from({ length: lenA + 1 }, () => new Array(lenB + 1).fill(0));
  for (let i = 0; i <= lenA; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= lenB; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= lenA; i += 1) {
    for (let j = 1; j <= lenB; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    }
  }
  return matrix[lenA][lenB];
}

function bestWindowDistance(needle, haystack) {
  if (!needle.length) return 0;
  if (!haystack.length) return needle.length;
  if (haystack.length <= needle.length) return levenshteinDistance(needle, haystack);
  let minDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i <= haystack.length - needle.length; i += 1) {
    const slice = haystack.slice(i, i + needle.length);
    const distance = levenshteinDistance(needle, slice);
    if (distance === 0) return 0;
    if (distance < minDistance) minDistance = distance;
  }
  return minDistance;
}

async function preprocessBuffer(buffer, mimetype) {
  try {
    const sharpOptions = mimetype === 'application/pdf' ? { density: 300, pages: 1 } : undefined;
    const pipeline = sharpOptions ? sharp(buffer, sharpOptions) : sharp(buffer);
    const processed = await pipeline.resize({ width: 1000, withoutEnlargement: true }).grayscale().normalize().toFormat('png').toBuffer();
    return processed;
  } catch (err) {
    // if preprocessing fails, return original buffer
    return buffer;
  }
}

async function runOcr(buffer) {
  const result = await Tesseract.recognize(buffer, 'eng', { logger: () => {} });
  const extractedText = result?.data?.text || '';
  const confidence = Number(result?.data?.confidence || 0);
  return { extractedText, confidence };
}

function parseDetectedAmountFromText(cleanedText) {
  const text = cleanedText.toLowerCase();
  
  const highConfidenceCandidates = [];

  // Pass 1: High-confidence extraction (currency and keywords)
  // Regex for "MVR 53.00" or "53.00 USD"
  const currencyRegex = /((?:mvr|usd|rf|\$)\s*(\d{1,3}(?:,?\d{3})*(?:\.\d{2})?))|((\d{1,3}(?:,?\d{3})*(?:\.\d{2})?)\s*(?:mvr|usd|rf))/g;
  let match;
  while ((match = currencyRegex.exec(text)) !== null) {
    const amountStr = match[2] || match[4];
    if (amountStr) {
      const amount = parseFloat(amountStr.replace(/,/g, ''));
      if (!isNaN(amount) && amount > 0) {
        highConfidenceCandidates.push(amount);
      }
    }
  }

  // Regex for "Total: 53.00" or "Amoun 53.00"
  const keywordRegex = /(?:total|amount|amoun|due)\s*:?\s*(\d{1,3}(?:,?\d{3})*(?:\.\d{2})?)/g;
  while ((match = keywordRegex.exec(text)) !== null) {
    const amountStr = match[1];
    if (amountStr) {
      const amount = parseFloat(amountStr.replace(/,/g, ''));
      if (!isNaN(amount) && amount > 0) {
        highConfidenceCandidates.push(amount);
      }
    }
  }

  // Decision 1: If we have high-confidence matches, return the largest one.
  // This handles cases with subtotal and total, correctly picking the total.
  if (highConfidenceCandidates.length > 0) {
    return Math.max(...highConfidenceCandidates);
  }

  // Pass 2: Low-confidence fallback if Pass 1 failed
  // Find all numbers, but be very careful.
  const allNumbersRegex = /(\d{1,3}(?:,?\d{3})*(?:\.\d{2})?)/g;
  const allNumbers = text.match(allNumbersRegex) || [];
  
  const lowConfidenceCandidates = allNumbers
    .map(n => parseFloat(n.replace(/,/g, '')))
    .filter(n => {
      if (isNaN(n) || n <= 0) return false;
      // Exclude numbers that are clearly not monetary values
      if (n > 999999) return false; // Exclude very large reference numbers
      if (n > 1900 && n < 2100) return false; // Exclude years
      return true;
    });

  // Decision 2: If we have any candidates left, return the largest one.
  if (lowConfidenceCandidates.length > 0) {
    return Math.max(...lowConfidenceCandidates);
  }

  return null;
}

function parseExpectedAmount(expectedAmount) {
  if (expectedAmount === undefined || expectedAmount === null || expectedAmount === '') return null;
  const normalized = expectedAmount.toString().replace(/[^0-9.,-]/g, '').replace(/,/g, '');
  const numeric = Number.parseFloat(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

export async function processSlip({ buffer, mimetype = null, transactionId = '', expectedAmount = null }) {
  const processedBuffer = await preprocessBuffer(buffer, mimetype);
  const ocrResult = await runOcr(processedBuffer);
  const cleanedText = (ocrResult.extractedText || '').replace(/\s+/g, ' ').trim();
  const normalizedExtracted = sanitizeText(cleanedText);
  const rawTx = transactionId ? String(transactionId).trim() : '';
  const normalizedTransactionId = sanitizeText(rawTx);
  const includes = normalizedTransactionId ? normalizedExtracted.includes(normalizedTransactionId) : false;
  const distance = includes ? 0 : (normalizedTransactionId ? bestWindowDistance(normalizedTransactionId, normalizedExtracted) : null);
  const match = normalizedTransactionId ? (includes || distance <= 1) : null;

  const detectedAmount = parseDetectedAmountFromText(cleanedText);
  const parsedExpectedAmount = parseExpectedAmount(expectedAmount);
  let amountMatch = null;
  if (parsedExpectedAmount !== null && detectedAmount !== null) {
    amountMatch = Math.abs(detectedAmount - parsedExpectedAmount) <= 1;
  }

  return {
    match,
    confidence: ocrResult.confidence,
    extractedText: cleanedText,
    detectedAmount,
    expectedAmount: parsedExpectedAmount,
    amountMatch,
    distance,
  };
}

export default { processSlip };
