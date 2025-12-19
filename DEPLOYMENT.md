# 🚀 Deployment Guide (Vercel)

The easiest way to deploy KanjiLens is with **Vercel**, the creators of Next.js.

## 1. Push to GitHub
Ensure your latest code is committed and pushed to your GitHub repository.

## 2. Deploy to Vercel
1.  Go to [Vercel Dashboard](https://vercel.com/dashboard).
2.  Click **"Add New..."** -> **"Project"**.
3.  Import your `kanjilens` repository.

## 3. ⚠️ CRITICAL: Environment Variables
Before clicking "Deploy", expand the **"Environment Variables"** section. You must copy these from your `.env.local`:

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | *Your Supabase Project URL* |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | *Your Supabase Anon Key* |
| `OPENAI_API_KEY` | *Your OpenAI Key (sk-...)* |
| `GOOGLE_VISION_CREDENTIALS_JSON` | *The entire JSON string from your service account file* |

> **Note on Google Credentials:** ensure you paste the entire JSON object string. If you have issues, some developers prefer to Base64 encode it, but usually pasting the raw JSON string works fine in Vercel.

## 4. 🔗 Final Step: Supabase Auth Settings
Once your site is deployed, you will get a URL like `https://kanjilens-xyz.vercel.app`. **Auth will fail** until you tell Supabase about this URL.

1.  Go to **Supabase Dashboard** -> **Authentication** -> **URL Configuration**.
2.  **Site URL**: Change `http://localhost:3000` to your new Vercel URL (e.g., `https://kanjilens-xyz.vercel.app`).
3.  **Redirect URLs**: Add the following to the list:
    *   `https://kanjilens-xyz.vercel.app/**`
    *   `https://kanjilens-xyz.vercel.app/auth/callback`

## 5. Redeploy (If needed)
If you missed any variables, add them in Vercel settings and go to **Deployments** -> **Redeploy**.
