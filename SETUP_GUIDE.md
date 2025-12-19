# 🛠️ KanjiLens Service Setup Guide

This guide explains how to set up the credentials and services required for KanjiLens to function completely.

## 1. Environment Variables

Create a `.env.local` file in the root directory of the project. Copy the template below:

```bash
# Supabase (Required for Auth & Database)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Google Cloud Vision (Required for OCR / Camera Scan)
# This must be a minified JSON string of your Service Account Key
GOOGLE_VISION_CREDENTIALS_JSON=

# OpenAI (Optional - for generating real AI lessons)
# If missing, the app uses Mock Data for lessons.
OPENAI_API_KEY=
```

---

## 2. Supabase Setup (Required)

Supabase handles Authentication, Database, and Storage (for images).

1.  **Create Project**: Go to [supabase.com](https://supabase.com) and create a new project.
2.  **Get Keys**:
    *   Go to **Project Settings** -> **API**.
    *   Copy `Project URL` to `NEXT_PUBLIC_SUPABASE_URL`.
    *   Copy `anon` public key to `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3.  **Authentication**:
    *   Go to **Authentication** -> **Providers**.
    *   Enable **Email** (with "Email/Password" enabled).
    *   (Optional) Enable **Google** if you want social login.
4.  **Database**:
    *   The database tables (`profiles`, `captures`, `vocabulary_items`) are initialized via SQL migrations. (Ensure you have run the migrations or set up the schema).
5.  **Storage**:
    *   Go to **Storage** -> **Buckets**.
    *   Create a new public bucket named `captures`.
    *   Ensure "Public Access" is enabled.

---

## 3. Google Cloud Vision Setup (Required for OCR)

Google Cloud Vision API is used to detect Japanese text from the images you capture.

1.  **Create Project**: Go to [Google Cloud Console](https://console.cloud.google.com).
2.  **Enable API**: Search for **"Cloud Vision API"** and enable it for your project.
3.  **Create Credentials**:
    *   Go to **IAM & Admin** -> **Service Accounts**.
    *   Create a New Service Account (e.g., "kanjilens-ocr").
    *   Grant it the role **"Cloud Vision API User"**.
    *   Click on the new Service Account -> **Keys** -> **Add Key** -> **Create new key (JSON)**.
    *   A `.json` file will download.
4.  **Format for Env**:
    *   Open the `.json` file in a text editor.
    *   You need to "minify" it (remove newlines) to pass it as a single environment variable string.
    *   You can use a tool like [JSON Minifier](https://jsonformatter.org/json-minifier) or just delete newlines manually.
    *   Paste the string into `GOOGLE_VISION_CREDENTIALS_JSON` in `.env.local`.

---

## 4. OpenAI Setup (Optional)

Used to generate "Lessons" (explanations, meanings, readings) for the scanned words.

1.   **Get Key**: Go to [platform.openai.com](https://platform.openai.com).
2.  Create a fresh API Key.
3.  Paste it into `OPENAI_API_KEY` in `.env.local`.

> **Note**: If you skip this, the app will run in "Mock Mode", returning preset explanations for every scan to save money during development.
