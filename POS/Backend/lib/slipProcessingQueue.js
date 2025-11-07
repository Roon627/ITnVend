import slipProcessor from './slipProcessor.js';

function safeNumber(value, fallback = null) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function createSlipProcessingQueue({ db, notify } = {}) {
  const queue = [];
  let working = 0;
  const concurrency = 1;

  async function processJob(job) {
    const nowIso = new Date().toISOString();
    try {
      const proc = await slipProcessor.processSlip({
        buffer: job.buffer,
        mimetype: job.mimetype,
        transactionId: job.transactionId,
        expectedAmount: job.expectedAmount,
      });

      const autoStatus = proc.match === true || proc.amountMatch === true ? 'validated' : 'pending';
      const result = {
        transactionId: job.transactionId || null,
        match: proc.match,
        confidence: proc.confidence,
        distance: proc.distance,
        detectedAmount: proc.detectedAmount,
        expectedAmount: proc.expectedAmount,
        amountMatch: proc.amountMatch,
        processedAt: nowIso,
      };

      await db.run(
        `UPDATE slips SET ocr_text = ?, ocr_confidence = ?, validation_result = ?, status = ?, updated_at = ? WHERE id = ?`,
        [
          proc.extractedText,
          safeNumber(proc.confidence, 0) ?? 0,
          JSON.stringify(result),
          autoStatus,
          nowIso,
          job.id,
        ]
      );

      if (typeof notify === 'function') {
        try {
          notify({ id: job.id, status: autoStatus, result: proc });
        } catch (notifyErr) {
          console.warn('Slip processing notify error', notifyErr);
        }
      }
    } catch (err) {
      console.error('Slip processing failed', err);
      const failure = {
        transactionId: job.transactionId || null,
        error: err?.message || String(err),
        failedAt: nowIso,
      };
      await db.run(
        `UPDATE slips SET validation_result = ?, status = ?, updated_at = ? WHERE id = ?`,
        [JSON.stringify(failure), 'failed', nowIso, job.id]
      );
      if (typeof notify === 'function') {
        try {
          notify({ id: job.id, status: 'failed', error: err });
        } catch (notifyErr) {
          console.warn('Slip processing notify error', notifyErr);
        }
      }
    }
  }

  function schedule() {
    if (!queue.length) return;
    if (working >= concurrency) return;
    const job = queue.shift();
    working += 1;
    (async () => {
      try {
        await processJob(job);
      } finally {
        working -= 1;
        setImmediate(schedule);
      }
    })();
  }

  function enqueue(job) {
    if (!job || !job.id) throw new Error('Job payload with id required');
    queue.push(job);
    setImmediate(schedule);
  }

  return {
    enqueue,
    size() {
      return queue.length + working;
    },
    isIdle() {
      return queue.length === 0 && working === 0;
    },
  };
}

export default { createSlipProcessingQueue };
