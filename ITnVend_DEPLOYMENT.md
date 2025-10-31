# 🚀 ITnVend Deployment Guide
**Version:** October 2025
**Target stack:** Node.js 22 + Express, React (Vite 7) + Tailwind, SQLite + Redis
**Infrastructure:** Ubuntu 22.04 LTS droplet on DigitalOcean
**Reverse proxy:** Nginx 1.26 with Let’s Encrypt SSL and Cloudflare proxy

---

## 1️⃣  Overview

ITnVend is a full-stack POS + Inventory + Accounting web app.  
This document describes how to deploy it from GitHub to a fresh Linux server so that:

| Domain | Purpose | Default Route |
|---------|----------|---------------|
| `itnvend.com` | Main landing site | `/` |
| `pos.itnvend.com` | POS / Admin Panel | `/admin` |
| `estore.itnvend.com` | Online store | `/home` |

---

## 2️⃣  Prerequisites

| Requirement | Description |
|--------------|-------------|
| **Ubuntu 22.04+ droplet** | 1–2 GB RAM (add 2 GB swap recommended) |
| **GitHub repo** | https://github.com/Roon627/ITnVend |
| **Cloudflare DNS** | All A records → 159.89.158.40, orange-proxied |
| **Domains** | itnvend.com  ·  pos.itnvend.com  ·  estore.itnvend.com |
| **Privileges** | root or sudo access |

... (trimmed for brevity in tool call)
