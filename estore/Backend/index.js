import express from "express";
import morgan from "morgan";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const PORT = process.env.PORT || 4100;
const POS_API_BASE = process.env.POS_API_BASE || "http://localhost:4000";
const POS_API_TOKEN = process.env.POS_API_TOKEN || null;
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || "*")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

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
  return `${POS_API_BASE}${req.originalUrl}`;
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

app.listen(PORT, () => {
  console.log(`[estore-backend] listening on port ${PORT}`);
  console.log(`[estore-backend] forwarding to ${POS_API_BASE}`);
});