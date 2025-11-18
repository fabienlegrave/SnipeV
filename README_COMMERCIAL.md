# VintedScrap Pro

A professional Vinted scraping and analysis platform with AI-powered deal detection and smart alerts.

## Features

### Smart Search & Collection
- Advanced search with intelligent filters
- AI-powered relevance scoring
- Automatic item deduplication
- Personalized Vinted feed integration

### AI Analysis
- Computer vision for condition assessment
- Authenticity verification
- Deal scoring and recommendations
- Platform and region detection

### Price Alerts
- Real-time monitoring of your criteria
- Smart notifications for deals
- Customizable alert conditions
- Auto-save matching items

### Professional Dashboard
- Overview of your collection
- Key metrics and statistics
- Quick actions and shortcuts
- Recent activity tracking

### Collection Management
- Favorites organization
- Detailed item views
- Bulk export (CSV/JSON)
- Tag system for categorization

## Quick Start

### 1. Installation

```bash
npm install
```

### 2. Environment Setup

Create `.env.local`:

```env
# Supabase (Required)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# API Protection
NEXT_PUBLIC_API_SECRET=your_secure_secret
API_SECRET=your_secure_secret

# OpenAI (Optional - for AI analysis)
OPENAI_API_KEY=your_openai_key

# Vinted Token (Required for scraping)
VINTED_ACCESS_TOKEN=get_from_cookies
```

### 3. Database Setup

1. Create a Supabase project
2. Run the migrations in `supabase/migrations/`
3. Your database is ready!

### 4. Get Vinted Token

1. Visit https://www.vinted.fr and login
2. Open Developer Tools (F12)
3. Go to Application → Cookies
4. Copy `access_token_web` value
5. Paste in Settings page or `.env.local`

### 5. Start Application

```bash
npm run dev
```

Visit http://localhost:3000

## Usage

### Search for Items
1. Go to **Search** page
2. Enter keywords (e.g., "Nintendo Switch")
3. Set price range and filters
4. Click Search
5. Add favorites from results

### Monitor Prices
1. Go to **Alerts** page
2. Create a new price alert
3. Set game title, platform, and max price
4. System checks automatically
5. Get notified of matches

### Analyze Collection
1. Go to **Items** page
2. Click "Analyze New Items"
3. AI examines photos and details
4. View deal scores and recommendations
5. Export data if needed

### View Statistics
1. Go to **Stats** page
2. See collection overview
3. Platform distribution
4. Price trends
5. Top games

## Professional Features

### Design
- Modern, responsive UI
- Mobile-friendly navigation
- Dark mode support
- Professional color scheme
- Smooth animations

### Performance
- Optimized image loading
- Efficient data caching
- Smart pagination
- Minimal API calls

### User Experience
- Intuitive navigation
- Clear feedback
- Empty states with actions
- Loading indicators
- Error handling

### Data Management
- Supabase PostgreSQL
- Row-level security
- Efficient indexing
- Data validation

## Tech Stack

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS
- **UI**: shadcn/ui components
- **Database**: Supabase PostgreSQL
- **AI**: OpenAI GPT Vision
- **Deployment**: Vercel-ready

## Support & Documentation

- Full API documentation in `/docs`
- Database schema in `/supabase/migrations`
- Component library in `/components/ui`
- Deployment guide in `/docs/DEPLOYMENT.md`

## License

MIT License - See LICENSE file for details

---

**VintedScrap Pro** - Professional Vinted Collection Management
