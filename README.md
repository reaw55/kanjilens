# KanjiLens 📸🇯🇵

**KanjiLens** is a modern web application that helps users learn Japanese Kanji from the real world. By taking photos of Japanese text, users can extract Kanji using OCR, get AI-powered explanations, and build a localized vocabulary map of their discoveries.

## 🚀 Key Features

-   **📸 Real-time Capture**: Snap photos or upload images to detect Japanese text.
-   **🤖 Smart OCR**: Integrated **Google Cloud Vision API** to extract text with Japanese language optimizations.
-   **🧠 AI Learning**: Uses **OpenAI (GPT-4o)** to generate instant mini-lessons (meanings, readings, context sentences) for selected words.
-   **🗺️ Discovery Map**: Automatically tags captures with GPS location (via EXIF) and displays them on an interactive map.
    -   *Tech*: Leaflet (React-Leaflet) + CartoDB Dark Matter tiles.
    -   *Feature*: "Fail-open" logic ensures uploads work even without location data.
-   **📚 Vocabulary Tracker**: Spaced Repetition System (SRS) style tracking for learned words.
-   **🔐 Authentication**: Secure Email/Password login via **Supabase Auth**.

---

## 🛠️ Tech Stack

-   **Framework**: Next.js 16 (App Router + Server Actions)
-   **Styling**: Tailwind CSS v4 + shadcn/ui
-   **Backend / DB**: Supabase (PostgreSQL + Auth + Storage)
-   **AI / ML**:
    -   Google Cloud Vision API (OCR)
    -   OpenAI API (Lesson Generation)
-   **Maps**: Leaflet + OpenStreetMap/CartoDB

---

## ⚙️ Setup Guide

### 1. Installation
```bash
npm install
```

### 2. Environment Variables
Create a `.env.local` file in the root directory:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# OpenAI
OPENAI_API_KEY=sk-...

# Google Cloud Vision (JSON String)
GOOGLE_VISION_CREDENTIALS_JSON={"type":"service_account",...}
```

### 3. Database Setup (Supabase)
Run the SQL found in [`supabase_schema.sql`](./supabase_schema.sql) in your Supabase SQL Editor to sets up:
-   `profiles`, `captures`, `vocabulary_items` tables.
-   Row Level Security (RLS) policies.

### 4. ⚠️ CRITICAL: Storage Setup
**You must configure the Storage Bucket manually:**
1.  Create a bucket named **`captures`**.
2.  **IMPORTANT:** Go to Bucket Settings and toggle **"Public"** to **ON**.
    *   *Why?* The Map component relies on public URLs to render marker icons. If private, the map pins will show broken images.
3.  Ensure RLS policies allow authenticated uploads (included in schema).

---

## 🏃‍♂️ Running the App

```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000).

---

## 🐛 Troubleshooting & Gotchas

### 1. Images on Map not showing?
*   **Check Bucket Privacy**: The `captures` bucket MUST be Public.
*   **Check Domain Config**: `next.config.ts` must allow `*.supabase.co` images (already configured).

### 2. "Upload Failed" or RLS Errors?
*   Ensure you ran the **Storage RLS Policies** from the schema file. By default, Supabase blocks uploads.

### 3. Location not saving?
*   The app extracts GPS from **Image EXIF data**. Use original photos.
*   Screenshots or downloaded images often lack GPS tags.
*   The system "fails open" (saves without location) if no data is found, so it won't break the app.

### 4. OCR returning weird characters?
*   We force `languageHints: ['ja']` in the API call. Ensure your image has clear, horizontal (or vertical) Japanese text.

---

## 📂 Project Structure

-   `src/app`: Next.js App Router pages.
-   `src/actions`: Server Actions (Backend logic: Upload, OCR, OpenAI).
-   `src/components`: UI Components (Camera, Map, Recent Captures).
-   `src/utils`: Helpers (Supabase client, OCR wrapper).
