/* eslint-env node */

import express from "express";
import morgan from "morgan";
import cors from "cors";
import fetch from "node-fetch";
import https from "https";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const PORT = process.env.PORT || 4100;
const POS_API_BASE = process.env.POS_API_BASE || "https://pos.itnvend.com:4000";
const POS_API_TOKEN = process.env.POS_API_TOKEN || null;
const POS_API_SECRET = process.env.POS_API_SECRET || null;
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || "*")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const CERT_DIR = process.env.CERT_DIR || path.join(process.cwd(), "certs");
const CERT_PATH = process.env.CERT_PATH || path.join(CERT_DIR, "estore-itnvend-com.pem");
const KEY_PATH = process.env.KEY_PATH || path.join(CERT_DIR, "estore-itnvend-com-key.pem");
const POS_API_CA_PATH = process.env.POS_API_CA_PATH || null;
const POS_API_REJECT_UNAUTHORIZED = process.env.POS_API_REJECT_UNAUTHORIZED === "true";

function loadHttpsOptions() {
  try {
    return {
      cert: fs.readFileSync(CERT_PATH),
      key: fs.readFileSync(KEY_PATH),
    };
  } catch (error) {
    console.error("Failed to load HTTPS credentials:", error.message || error);
    throw error;
  }
}

function createPosAgent() {
  if (!POS_API_BASE.toLowerCase().startsWith("https://")) return undefined;
  try {
    if (POS_API_CA_PATH) {
      const caBundle = fs.readFileSync(POS_API_CA_PATH);
      return new https.Agent({ ca: caBundle });
    }
  } catch (error) {
    console.warn("Failed to read POS_API_CA_PATH; falling back to relaxed TLS.", error.message || error);
  }
  if (POS_API_REJECT_UNAUTHORIZED) {
    return new https.Agent();
  }
  console.warn(
    "Using relaxed TLS verification for POS_API_BASE. Provide POS_API_CA_PATH or set POS_API_REJECT_UNAUTHORIZED=true once a trusted certificate is available."
  );
  return new https.Agent({ rejectUnauthorized: false });
}

const posAgent = createPosAgent();

const app = express();

app.use(
  cors({
    origin: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : true,
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));

// Proxy uploads from POS so the frontend can load media from same origin without TLS issues
app.get('/uploads/*', async (req, res) => {
  const target = `${POS_API_BASE}${req.originalUrl}`;
  try {
    const headers = {};
    if (POS_API_TOKEN) headers['x-storefront-key'] = POS_API_TOKEN;
    const upstream = await fetch(target, { method: 'GET', headers, agent: posAgent });
    res.status(upstream.status);
    // copy headers (content-type mainly)
    upstream.headers.forEach((v, k) => {
      res.set(k, v);
    });
    const buffer = await upstream.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('Failed to proxy upload', target, err?.message || err);
    res.status(502).send('Upstream unavailable');
  }
});

function buildTargetUrl(req) {
  const base = POS_API_BASE.endsWith("/") ? POS_API_BASE.slice(0, -1) : POS_API_BASE;
  return `${base}${req.originalUrl}`;
}

async function forwardJson(req, res, options = {}) {
  const targetUrl = options.url || buildTargetUrl(req);
    try {
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    // Forward storefront key using POS expected header name
    if (POS_API_TOKEN) {
      headers["x-storefront-key"] = POS_API_TOKEN;
    }
    if (options.extraHeaders) {
      Object.assign(headers, options.extraHeaders);
    }

    // If a secret is configured, compute a signature for the outbound request so POS can validate it
    try {
      const method = (options.method || req.method || 'GET').toUpperCase();
      if (POS_API_SECRET && method !== 'GET' && method !== 'HEAD') {
        const rawBody = typeof (options.body ?? req.body) === 'string'
          ? (options.body ?? req.body)
          : JSON.stringify(options.body ?? req.body ?? {});
        const timestamp = String(Date.now());
        const signature = crypto.createHmac('sha256', POS_API_SECRET).update(`${timestamp}.${rawBody}`).digest('hex');
        headers['x-storefront-timestamp'] = timestamp;
        headers['x-storefront-signature'] = signature;
      }
    } catch (sigErr) {
      console.warn('Failed to compute storefront signature for proxied request', sigErr?.message || sigErr);
    }

    const fetchOptions = {
      method: options.method || req.method,
      headers,
      agent: posAgent,
    };

    if (fetchOptions.method !== "GET" && fetchOptions.method !== "HEAD") {
      fetchOptions.body = JSON.stringify(options.body ?? req.body ?? {});
    }

    const response = await fetch(targetUrl, fetchOptions);
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();

    res.status(response.status);
    if (contentType.includes("application/json")) {
      // Parse JSON so we can optionally rewrite any POS absolute URLs to origin-relative paths
      let parsed = text ? JSON.parse(text) : {};
      try {
        const rewritePosUrl = (val) => {
          if (!val || typeof val !== 'string') return val;
          const posBase = POS_API_BASE.endsWith('/') ? POS_API_BASE.slice(0, -1) : POS_API_BASE;
          if (val.startsWith(posBase)) {
            return val.slice(posBase.length);
          }
          return val;
        };

        const walk = (obj) => {
          if (!obj || typeof obj !== 'object') return obj;
          if (Array.isArray(obj)) return obj.map(walk);
          const out = {};
          for (const k of Object.keys(obj)) {
            const v = obj[k];
            if (typeof v === 'string') {
              out[k] = rewritePosUrl(v);
            } else if (Array.isArray(v)) {
              out[k] = v.map((entry) => (typeof entry === 'string' ? rewritePosUrl(entry) : walk(entry)));
            } else if (v && typeof v === 'object') {
              out[k] = walk(v);
            } else {
              out[k] = v;
            }
          }
          return out;
        };

        parsed = walk(parsed);
      } catch (e) {
        // ignore rewrite errors and send original parsed
      }

      res.type("application/json");
      res.send(parsed);
    } else {
      res.send(text);
    }
  } catch (error) {
    console.error(`Failed to forward ${req.method} ${targetUrl}`, error);
    res.status(502).json({ error: "Upstream service unavailable" });
  }
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, upstream: POS_API_BASE });
});

app.get("/api/settings", (req, res) => forwardJson(req, res));
app.get("/api/products", (req, res) => forwardJson(req, res));
app.get("/api/products/categories", (req, res) => forwardJson(req, res));
app.get("/api/products/:id", (req, res) => forwardJson(req, res));

app.post("/api/quotes", (req, res) => forwardJson(req, res));
app.post("/api/orders", (req, res) => forwardJson(req, res));
app.post("/api/vendors", (req, res) => forwardJson(req, res));

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

const server = https.createServer(loadHttpsOptions(), app);

server.listen(PORT, () => {
  console.log(`[estore-backend] HTTPS server listening on https://estore.itnvend.com:${PORT}`);
  console.log(`[estore-backend] forwarding to ${POS_API_BASE}`);
});