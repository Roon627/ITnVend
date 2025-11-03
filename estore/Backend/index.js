import express from "express";
import morgan from "morgan";
import cors from "cors";
import fetch from "node-fetch";
import https from "https";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const PORT = process.env.PORT || 4100;
const POS_API_BASE = process.env.POS_API_BASE || "https://pos.itnvend.com:4000";
const POS_API_TOKEN = process.env.POS_API_TOKEN || null;
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
    if (POS_API_TOKEN) {
      headers["x-api-key"] = POS_API_TOKEN;
    }
    if (options.extraHeaders) {
      Object.assign(headers, options.extraHeaders);
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
      res.type("application/json");
      res.send(text ? JSON.parse(text) : {});
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