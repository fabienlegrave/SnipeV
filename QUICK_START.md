# Quick Start Guide

## 5-Minute Setup

### Step 1: Clone & Install (1 min)

```bash
git clone <your-repo>
cd vinted-scrap
npm install
```

### Step 2: Supabase Setup (2 min)

1. Go to [supabase.com](https://supabase.com)
2. Create new project
3. Go to Project Settings → API
4. Copy URL and Keys

### Step 3: Environment Variables (1 min)

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...
NEXT_PUBLIC_API_SECRET=my_secure_password_123
API_SECRET=my_secure_password_123
```

### Step 4: Database Migration (30 sec)

1. Open Supabase dashboard
2. Go to SQL Editor
3. Create new query
4. Paste content from `supabase/migrations/`
5. Run query

### Step 5: Get Vinted Token (30 sec)

1. Visit vinted.fr (logged in)
2. Press F12
3. Application → Cookies → vinted.fr
4. Find `access_token_web`
5. Copy value

### Step 6: Start App (10 sec)

```bash
npm run dev
```

Open http://localhost:3000

## First Actions

1. **Go to Settings** → Paste your Vinted token
2. **Go to Search** → Search for "Nintendo Switch"
3. **Add items** to favorites
4. **Go to Items** → Click "Analyze New Items"
5. **Go to Dashboard** → See your collection overview

## Optional: AI Analysis

Add to `.env.local`:

```env
OPENAI_API_KEY=sk-proj-xxx
```

This enables:
- Computer vision analysis
- Deal detection
- Condition assessment
- Authenticity checks

## Deployment to Vercel

```bash
npm run build  # Test locally
vercel --prod  # Deploy
```

Add environment variables in Vercel dashboard.

## Common Issues

### "Token expired"
→ Get new token from Vinted cookies

### "Database error"
→ Check Supabase keys in .env.local

### "AI analysis not working"
→ Add OPENAI_API_KEY

### Build errors
→ Run `npm run build` locally first

## Next Steps

- Set up price alerts
- Export your data
- Customize filters
- Share with team

---

Need help? Check README_COMMERCIAL.md for full documentation.
