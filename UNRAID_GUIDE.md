# 🐳 Unraid Deployment Guide

This guide will help you self-host KanjiLens on your Unraid server using Docker and make it accessible from outside your network.

## 1. Build the Docker Image
Since this is a custom app, you need to build the image yourself (or push to Docker Hub).
**Simplest method (if you have Docker on your PC):**

1.  Open terminal in this project folder.
2.  Login to Docker Hub (if you want to push there): `docker login`
3.  Build and tag:
    ```bash
    docker build -t your-username/kanjilens:latest .
    ```
4.  Push:
    ```bash
    docker push your-username/kanjilens:latest
    ```

*(Alternatively, you can use Unraid's built-in docker build tools if you are advanced, but pushing to Hub is easier).*

## 2. Add Container in Unraid
1.  Go to **Docker** tab > **Add Container**.
2.  **Name:** `KanjiLens`
3.  **Repository:** `your-username/kanjilens:latest` (use the one you pushed above).
4.  **Network Type:** `Bridge`
5.  **Console shell command:** `Shell`
6.  **Privileged:** `Off`

### 3. Configure Variables & Ports
You MUST add these manually in the Unraid template:

**A. Port Mapping**
*   Click **"Add another Path, Port, Variable..."**
*   **Config Type:** `Port`
*   **Container Port:** `3000`
*   **Host Port:** `3000` (or any free port like 3005)

**B. Environment Variables** (Click "Add..." -> Config Type: `Variable` for each)
| Key | Value (Copy from your .env.local) |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | *Your URL* |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | *Your Key* |
| `OPENAI_API_KEY` | *sk-...* |
| `GOOGLE_VISION_CREDENTIALS_JSON` | *Paste the full JSON string* |

## 4. Accessing from Outside (Remote Access)
**⚠️ DO NOT OPEN PORTS ON YOUR ROUTER IF POSSIBLE.**

### Recommended: Cloudflare Tunnel (Free & Secure)
1.  Install the **"cloudflared"** container on Unraid (from Community Apps).
2.  Go to [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/).
3.  Create a Tunnel -> Connect it to your `cloudflared` container.
4.  Add a **Public Hostname** in the Tunnel settings:
    *   **Subdomain:** `kanji.your-domain.com`
    *   **Service:** `http://[UNRAID-IP]:3000`
5.  **Done!** Access `https://kanjilens.your-domain.com` from anywhere.

### Important: Supabase Redirect
Don't forget to add your new domain (`https://kanjilens.your-domain.com`) to **Supabase Dashboard -> Auth -> Redirect URLs**, otherwise login will error out!
