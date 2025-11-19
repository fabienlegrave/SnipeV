# VintedScrap - Professional Vinted Scraping Tool

A modern, full-stack application for scraping and analyzing Vinted listings with AI-powered visual analysis. Built with Next.js 14, TypeScript, and OpenAI GPT Vision for expert-level item evaluation.

## 🚀 Features

### Core Functionality
- **🔍 Smart Search**: Fast API-based search with intelligent filtering and relevance scoring
- **📊 Comprehensive Data Extraction**: Prices, conditions, descriptions, images, engagement metrics
- **🔄 Intelligent Deduplication**: Avoid re-scraping existing items automatically
- **👁️ AI Visual Analysis**: GPT Vision analyzes photos to extract facts about condition, completeness, and authenticity
- **🤖 Smart Deal Detection**: AI-powered deal analysis based on visual facts and market comparisons
- **💾 Persistent Storage**: Supabase PostgreSQL with optimized schemas and indexing
- **🔔 Price Alerts**: Real-time monitoring with Telegram notifications for new matching items
- **🏭 Cookie Factory**: Automated cookie generation and validation for seamless Vinted authentication

### User Interface
- **📊 Professional Dashboard**: Overview of your collection with key metrics and quick actions
- **🎨 Modern Design**: Beautiful, responsive interface with shadcn/ui components
- **📱 Mobile-First**: Fully responsive design that works on all devices
- **🔄 Real-time Updates**: Live progress tracking during AI analysis
- **🔍 Advanced Search**: Filter by price, condition, availability, text search
- **📈 AI Insights**: Visual facts, deal scores, and expert recommendations
- **⚙️ System Monitoring**: Health checks and configuration status
- **🏠 Personalized Feed**: Browse Vinted homepage recommendations

### Technical Excellence
- **🏗️ Modern Architecture**: Next.js 14 with App Router and TypeScript
- **🤖 AI Integration**: OpenAI GPT-4o-mini with Vision for expert analysis
- **🔒 Secure API**: Protected endpoints with API key authentication
- **📊 Database Optimization**: Trigram search, proper indexing, efficient queries
- **🛡️ Error Handling**: Comprehensive error handling and retry logic
- **📝 Detailed Logging**: Full visibility into AI analysis operations
- **🍪 Cookie Management**: Automated cookie generation with Puppeteer for Cloudflare/Datadome bypass

## 🛠️ Technology Stack

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query
- **Backend**: Next.js API Routes, Node.js, OpenAI GPT Vision
- **Database**: Supabase PostgreSQL with trigram search
- **Authentication**: Vinted token-based authentication with automated cookie generation
- **AI**: OpenAI GPT-4o-mini for visual analysis and deal detection
- **Notifications**: Telegram Bot API for price alerts
- **Browser Automation**: Puppeteer for cookie generation
- **Styling**: Tailwind CSS with custom design system
- **Icons**: Lucide React
- **Deployment**: Vercel-ready with environment variable support

## 📋 Prerequisites

- **Node.js 18+** - Latest LTS version recommended
- **Supabase Account** - Free tier is sufficient to start
- **Vinted Account** - For obtaining access tokens
- **Telegram Bot** (Optional) - For price alert notifications
- **Modern Browser** - Chrome, Firefox, Safari, or Edge

## 🚀 Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd vinted-scrap
npm install
```

### 2. Environment Setup

Create `.env.local` file in your project root:

```env
# Frontend Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
NEXT_PUBLIC_API_SECRET=your_client_api_secret

# Backend Configuration (Server Only)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# API Protection
API_SECRET=your_secure_api_secret_here

# AI Analysis (Optional)
OPENAI_API_KEY=sk-proj-your_openai_key_here

# Vinted Authentication (Optional - can be set via UI)
VINTED_EMAIL=your_vinted_email@example.com
VINTED_PASSWORD=your_vinted_password

# Telegram Notifications (Optional)
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_telegram_chat_id

# Performance Tuning (Optional)
ENRICH_CONCURRENCY=2
SCRAPE_DELAY_MS=1200
```

### 3. Database Setup

1. **Create Supabase Project**
   - Go to [supabase.com](https://supabase.com)
   - Create a new project
   - Note your project URL and keys

2. **Run Database Migration**
   - Go to your Supabase dashboard
   - Navigate to SQL Editor
   - Copy and run the migration from `supabase/migrations/`

This creates:
- `vinted_items` table with all necessary columns
- `price_alerts` table for monitoring
- `alert_matches` table for tracking matches
- AI Vision fields for visual analysis
- Optimized indexes for fast queries
- Trigram search capabilities for text search
- Proper data types for all Vinted fields

### 4. Get Vinted Access Token

**Method 1: Cookie Factory (Recommended)**
1. Start the development server: `npm run dev`
2. Go to http://localhost:3000/settings
3. Click "Cookie Factory 🏭" button
4. The system will automatically generate fresh cookies using Puppeteer
5. Cookies are automatically saved and validated

**⚠️ Troubleshooting Cookie Factory:**
- If no cookies are retrieved, it may indicate a temporary IP block due to rate limits (429 errors)
- **Quick fix:** Share your mobile connection (hotspot) - this changes your IP and bypasses the block
- Alternative: Use a VPN to change your IP
- Wait 10-30 minutes before retrying if the issue persists

**Method 2: Manual Cookie Extraction**
1. Open https://www.vinted.fr and login to your account
2. Open Developer Tools (F12)
3. Go to **Application** → **Cookies** → **https://www.vinted.fr**
4. Copy all cookies (especially `access_token_web`, `refresh_token_web`, `datadome`, `cf_clearance`)
5. Go to http://localhost:3000/settings
6. Paste cookies in the token manager interface

**Method 3: Environment Variables**
- Set `VINTED_EMAIL` and `VINTED_PASSWORD` in `.env.local`
- The Cookie Factory will use these for automatic login

### 5. Setup Telegram Notifications (Optional)

1. **Create a Telegram Bot**
   - Open Telegram and search for [@BotFather](https://t.me/botfather)
   - Send `/newbot` and follow instructions
   - Copy the bot token to `TELEGRAM_BOT_TOKEN` in `.env.local`

2. **Get Your Chat ID**
   - Start a chat with your bot
   - Send a message to your bot
   - Visit: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
   - Find your chat ID in the response
   - Add it to `TELEGRAM_CHAT_ID` in `.env.local`

### 6. Start Development Server

```bash
npm run dev
```

Visit **http://localhost:3000** to access the application.

## 🎯 Usage Guide

### Dashboard Overview (`/dashboard`)

The dashboard provides a comprehensive overview of your collection:
- **📊 Key Metrics**: Total items, favorites, available items, average price
- **📈 Recent Activity**: Recently added items and active alerts
- **⚡ Quick Actions**: Quick links to search, alerts, and settings
- **🎯 AI Statistics**: Analysis progress and deal detection metrics

### Complete Scraping Workflow

#### 1. Configure Search (`/search` page)
- **Search Query**: Enter keywords (e.g., "nintendo gameboy", "vintage denim jacket")
- **Price Range**: Set minimum and maximum prices (optional)
- **Platform Filter**: Select specific gaming platforms (optional)
- **Result Limit**: Control how many items to scrape (default: 100)
- **Token Status**: Ensure your Vinted token is configured and valid

#### 2. Automated Processing Pipeline
The system automatically handles the complete workflow:

1. **🔍 Fast API Search**: Quickly finds items using Vinted's search API
2. **🔍 Deduplication Check**: Identifies which items are already in your database
3. **💾 Data Storage**: Saves all data to Supabase with proper formatting
4. **📈 Progress Tracking**: Real-time updates on each step

#### 3. AI Visual Analysis (`/items` page)
- **👁️ Vision Analysis**: Click "Analyze New Items" to run AI visual analysis
- **🤖 Smart Detection**: AI examines photos to determine condition, completeness, authenticity
- **📊 Deal Scoring**: Automatic deal detection based on visual facts and market data
- **🔄 Progress Tracking**: Real-time updates during AI analysis

#### 4. Browse and Filter (`/items` page)
- **🔍 Advanced Filtering**: Search by title, description, price range, availability
- **📊 Sorting Options**: Sort by date, price, popularity, or relevance
- **📱 Grid View**: Beautiful card-based layout with images and key info
- **🎯 AI Insights**: Visual facts, condition grades, and deal scores
- **🔗 Quick Actions**: View details or jump to original Vinted listing
- **🏷️ Tag Management**: Organize items with custom tags

#### 5. Detailed Item View (`/items/[id]`)
- **🖼️ Image Gallery**: All item photos with zoom capability
- **👁️ Visual Facts**: AI-extracted inventory (cartridge, box, manual, etc.)
- **💰 Complete Pricing**: Item price, shipping fees, buyer protection costs
- **🤖 AI Analysis**: Expert-level deal evaluation with reasoning
- **🔗 External Links**: Direct links to Vinted listing
- **🏷️ Tags**: View and manage item tags

#### 6. Price Alerts (`/alerts` page)
- **🔔 Create Alerts**: Set up monitoring for specific games/platforms
- **💰 Price Thresholds**: Define maximum price for automatic matching
- **📱 Telegram Notifications**: Get notified instantly when new items match
- **📊 Match History**: View all items that matched your alerts
- **⚙️ Alert Management**: Enable/disable alerts, view statistics

#### 7. Personalized Feed (`/homepage` page)
- **🏠 Vinted Recommendations**: Browse personalized homepage items
- **🔄 Real-time Updates**: Fresh recommendations from Vinted
- **💾 Auto-save**: Automatically save interesting items to your collection

### System Configuration (`/settings`)

Monitor and configure your application:
- **🔑 Token Management**: 
  - View current token status
  - Generate fresh cookies with Cookie Factory 🏭
  - Manual cookie paste and validation
  - Automatic token refresh
- **⚙️ Configuration Status**: Environment variables, API connections
- **🤖 AI Status**: OpenAI API configuration and usage
- **📊 Database Status**: Connection health and statistics
- **🔔 Telegram Status**: Bot connection and notification settings

## 🏗️ Architecture Deep Dive

### File Structure
```
├── app/
│   ├── api/v1/              # API endpoints
│   │   ├── admin/vinted/    # Admin operations
│   │   │   └── cookie-factory/  # Cookie generation
│   │   ├── alerts/          # Price alerts
│   │   ├── scrape/          # Scraping operations
│   │   ├── items/           # Item management
│   │   ├── homepage/         # Feed recommendations
│   │   └── vision/          # AI analysis
│   ├── dashboard/           # Main dashboard
│   ├── search/              # Search interface
│   ├── items/              # Browse and view items
│   ├── alerts/             # Price alerts management
│   ├── homepage/           # Personalized feed
│   ├── settings/           # System configuration
│   └── layout.tsx          # Root layout
├── components/
│   ├── ui/                  # Reusable UI components
│   ├── layout/              # Navigation and layout
│   └── TokenManager.tsx    # Token management
├── lib/
│   ├── scrape/              # Scraping modules
│   │   ├── searchCatalogWithFullSession.ts  # API search
│   │   ├── serverOnlyParser.js              # HTML parsing
│   │   ├── fullSessionManager.ts           # Session management
│   │   ├── tokenRenewer.ts                 # Token refresh
│   │   ├── concurrency.ts                  # Parallel processing
│   │   └── gemDetector.ts                  # Deal detection
│   ├── alerts/              # Alert management
│   │   └── checkAlertsStandalone.ts
│   ├── notifications/      # Notification system
│   │   └── telegram.ts
│   ├── supabase.ts         # Database clients
│   ├── types/              # TypeScript definitions
│   └── utils/              # Helper functions
├── supabase/migrations/    # Database schemas
└── scripts/                # Utility scripts
    ├── generateCookiesStandalone.js  # Cookie generation
    └── test-vinted-endpoints.js      # Endpoint testing tool
```

### Data Flow Architecture

1. **Search Phase**
   ```
   User Input → API Search → Vinted API → Raw Results
   ```

2. **Deduplication Phase**
   ```
   Raw Results → Extract IDs → Database Check → Missing/Existing Lists
   ```

3. **Enrichment Phase**
   ```
   Missing IDs → HTML Fetch → Native JS Parsing → Rich Data
   ```

4. **Storage Phase**
   ```
   Rich Data → Data Validation → Database Upsert → Success Response
   ```

5. **Alert Monitoring Phase**
   ```
   Alert Criteria → API Search → Match Detection → Telegram Notification
   ```

### Cookie Factory Architecture

The Cookie Factory system provides automated cookie generation:

1. **Puppeteer Automation**: Headless browser navigates to Vinted
2. **Cloudflare/Datadome Bypass**: Automatically handles challenges
3. **Token Extraction**: Extracts `access_token_web`, `refresh_token_web`, `datadome`, `cf_clearance`
4. **Validation**: Tests cookies against Vinted API endpoints
5. **Storage**: Saves validated cookies to database
6. **Auto-refresh**: Automatically refreshes tokens when needed

### Native JavaScript Parsing Engine

Our custom parsing engine eliminates external dependencies:

- **🎯 Regex-Based Extraction**: Optimized patterns for HTML elements
- **📊 JSON-LD Processing**: Structured data extraction
- **🖼️ Image Discovery**: Multiple sources (preload, meta tags, structured data)
- **💰 Price Parsing**: Handles multiple currencies and fee structures
- **📈 Engagement Metrics**: View counts, favorites, temporal data
- **🔍 Text Processing**: Clean descriptions, titles, conditions

## 🔧 Configuration Options

### Performance Tuning

```env
# Concurrent enrichment requests (1-5 recommended)
ENRICH_CONCURRENCY=3

# Delay between requests in milliseconds (500-2000 recommended)
SCRAPE_DELAY_MS=800
```

### Network Configuration

```env
# Use proxy for requests (optional)
HTTPS_PROXY=http://proxy.example.com:8080

# Skip SSL verification (development only)
INSECURE_FETCH=1
```

### Security Settings

```env
# Strong API secret for endpoint protection
API_SECRET=your_very_secure_random_string_here

# Supabase service role key (full database access)
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Telegram Configuration

```env
# Telegram Bot Token (from @BotFather)
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz

# Your Telegram Chat ID (get from getUpdates API)
TELEGRAM_CHAT_ID=123456789
```

## 📊 API Reference

All API endpoints require the `x-api-key` header with your `API_SECRET`.

### Search Operations

**POST** `/api/v1/scrape/search`
```json
{
  "query": "nintendo gameboy",
  "priceFrom": 10,
  "priceTo": 100,
  "limit": 50
}
```

**POST** `/api/v1/scrape/enrich`
```json
{
  "ids": [123456789, 987654321]
}
```

### Alert Operations

**POST** `/api/v1/alerts/check`
Triggers manual alert check for all active alerts.

**GET** `/api/v1/alerts/matches`
Returns all items that matched your alerts.

**POST** `/api/v1/alerts`
Create a new price alert:
```json
{
  "title": "Nintendo Switch",
  "platform": "Nintendo Switch",
  "max_price": 200,
  "is_active": true
}
```

### Cookie Management

**POST** `/api/v1/admin/vinted/cookie-factory`
Generate fresh cookies using Puppeteer (requires API key).

### Database Operations

**POST** `/api/v1/missing-ids`
```json
{
  "ids": [123456789, 987654321, 555666777]
}
```

**POST** `/api/v1/upsert`
```json
[
  {
    "id": 123456789,
    "url": "https://www.vinted.fr/items/123456789",
    "title": "Vintage Nintendo Game Boy",
    "price": { "amount": 45.00, "currency_code": "EUR" }
  }
]
```

### Item Retrieval

**GET** `/api/v1/item/123456789`

Returns complete item data in API format.

**DELETE** `/api/v1/items/123456789`

Deletes an item from the database.

## 🚢 Deployment Guide

### Vercel + Supabase (Recommended)

1. **Prepare for Deployment**
   ```bash
   npm run build  # Test build locally
   ```

2. **Deploy to Vercel**
   ```bash
   # Install Vercel CLI
   npm i -g vercel
   
   # Deploy
   vercel --prod
   ```

3. **Configure Environment Variables**
   - Go to Vercel dashboard → Project → Settings → Environment Variables
   - Add all variables from your `.env.local`
   - Use **production** Supabase keys (not development)

4. **Database Setup**
   - Ensure your Supabase project is in production mode
   - Run migrations in Supabase dashboard
   - Test database connectivity

### Manual Deployment

1. **Build Application**
   ```bash
   npm run build
   npm start
   ```

2. **Environment Setup**
   - Copy `.env.local` to `.env.production.local`
   - Update with production values
   - Ensure all required variables are set

3. **Process Management**
   ```bash
   # Using PM2
   npm install -g pm2
   pm2 start npm --name "vinted-scrap" -- start
   ```

## 🔍 Monitoring and Maintenance

### Health Checks

Visit `/settings` to monitor:
- **Database Connection**: Real-time connectivity status
- **Token Validity**: Vinted authentication status
- **API Performance**: Response times and error rates
- **Data Quality**: Completeness and freshness metrics
- **Cookie Status**: Cloudflare/Datadome cookie validity

### Logs and Debugging

The application provides comprehensive logging:

```bash
# Development logs
npm run dev

# Production logs (if using PM2)
pm2 logs vinted-scrap

# Database logs (Supabase dashboard)
# Go to Logs section in Supabase dashboard
```

### Common Maintenance Tasks

**Token Refresh**
- Tokens typically expire every few weeks
- Use the Cookie Factory in `/settings` to generate fresh cookies
- Monitor the `/settings` page for expiration warnings
- System can automatically refresh tokens using `refresh_token_web`

**Database Cleanup**
```sql
-- Remove old items (optional)
DELETE FROM vinted_items 
WHERE scraped_at < NOW() - INTERVAL '90 days';

-- Update statistics
ANALYZE vinted_items;
```

**Performance Optimization**
- Monitor concurrent request settings
- Adjust delays based on success rates
- Scale Supabase plan if needed

## 🛠️ Development Guide

### Local Development Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run type checking
npm run build

# Lint code
npm run lint
```

### Adding New Features

1. **API Endpoints**: Add to `app/api/v1/`
2. **UI Components**: Follow shadcn/ui patterns in `components/ui/`
3. **Database Changes**: Create new migration files
4. **Scraping Logic**: Extend `lib/scrape/` modules

### Testing

```bash
# Test single search
node scripts/scrape-once.js "nintendo gameboy" 10 100 20

# Test API endpoints
curl -X POST http://localhost:3000/api/v1/scrape/search \
  -H "Content-Type: application/json" \
  -H "x-api-key: your_api_secret" \
  -d '{"query": "test", "limit": 5}'

# Test all Vinted endpoints with different cookie types
npm run test:endpoints -- --cookies "your_cookie_string_here"
# Or set VINTED_COOKIES environment variable:
VINTED_COOKIES="your_cookies" npm run test:endpoints
```

#### Endpoint Testing Tool

Le script `test-vinted-endpoints.js` teste tous les endpoints Vinted connus avec différents types de cookies pour identifier quels cookies sont nécessaires pour chaque endpoint.

**Usage:**
```bash
# Avec cookies en argument
npm run test:endpoints -- --cookies "access_token_web=xxx; cf_clearance=yyy; datadome=zzz"

# Avec variable d'environnement
VINTED_COOKIES="your_cookies" npm run test:endpoints

# Sans cookies (teste seulement les endpoints publics)
npm run test:endpoints
```

**Ce que le script teste:**
- ✅ Tous les endpoints Vinted connus (catalog, homepage, auth, etc.)
- ✅ Différents types de cookies (aucun, access_token seulement, Cloudflare seulement, cookies complets)
- ✅ Détermine les exigences minimales pour chaque endpoint
- ✅ Génère un rapport détaillé avec recommandations

**Résultat:**
- Rapport console formaté avec tableau récapitulatif
- Fichier JSON détaillé (`test-endpoints-report-{timestamp}.json`)
- Identification claire des endpoints nécessitant:
  - `access_token_web` (authentification)
  - Cookies Cloudflare (`cf_clearance`, `datadome`)
  - Cookies complets (auth + Cloudflare)

### Code Quality

- **TypeScript**: Strict type checking enabled
- **ESLint**: Code quality and consistency
- **Prettier**: Automatic code formatting
- **Tailwind**: Consistent styling system

## ⚠️ Legal and Ethical Usage

### Important Guidelines

- **🚦 Respect Rate Limits**: Don't overload Vinted's servers
- **📋 Terms of Service**: Comply with Vinted's Terms of Service
- **🎓 Educational Use**: This tool is for educational and personal research
- **🔒 Data Privacy**: Handle scraped data responsibly and securely
- **©️ Intellectual Property**: Respect copyrights and trademarks
- **🤝 Fair Use**: Use data ethically and considerately

### Best Practices

- **Reasonable Delays**: Use appropriate delays between requests
- **Limited Scope**: Don't scrape entire catalogs unnecessarily
- **Data Retention**: Only keep data you actually need
- **Access Control**: Secure your API keys and database access
- **Monitoring**: Keep track of your scraping activity

## 🆘 Troubleshooting

### Common Issues and Solutions

**❌ "Authentication failed - token may be expired"**
- **Solution**: Use Cookie Factory in `/settings` to generate fresh cookies
- **Alternative**: Manually update cookies from browser
- **Prevention**: Enable automatic token refresh

**❌ "Database error" or connection issues**
- **Check**: Supabase URL and service role key in environment
- **Verify**: Database migrations have been run
- **Test**: Visit `/settings` to check connection status

**❌ "Rate limited" or "HTTP 429" errors**
- **Increase**: `SCRAPE_DELAY_MS` to 1000-2000ms
- **Decrease**: `ENRICH_CONCURRENCY` to 1-2
- **Wait**: Rate limits usually reset after 15-30 minutes

**❌ "No results found" for valid searches**
- **Verify**: Search query syntax and spelling
- **Check**: Price range isn't too restrictive
- **Test**: Try the same search on Vinted website
- **Token**: Ensure your access token is valid (use Cookie Factory)

**❌ "Cookie Factory failed" or Puppeteer errors**
- **Check**: Chrome/Chromium is installed on the server
- **Verify**: `VINTED_EMAIL` and `VINTED_PASSWORD` are set (optional)
- **If no cookies retrieved**: This often indicates a temporary IP block due to rate limits
  - **Quick fix**: Share your mobile connection (hotspot) - changes IP and works immediately ✅
  - **Alternative**: Use a VPN to change your IP
  - **Wait**: 10-30 minutes before retrying
- **Alternative**: Use manual cookie paste method
- **Note**: Cookie Factory requires more resources than manual method

**❌ Telegram notifications not working**
- **Verify**: `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are correct
- **Check**: Bot is started (send `/start` to your bot)
- **Test**: Visit `/settings` to check Telegram status

**❌ Build or deployment errors**
- **Environment**: Verify all required variables are set
- **Dependencies**: Run `npm install` to update packages
- **Build**: Test with `npm run build` locally first
- **Logs**: Check Vercel deployment logs for specific errors

### Getting Help

1. **Check System Status**: Visit `/settings` for health overview
2. **Review Logs**: Check browser console and server logs
3. **Test Components**: Use individual API endpoints to isolate issues
4. **Environment**: Verify all configuration variables are correct
5. **Documentation**: Review this README for configuration details

### Performance Optimization

**Slow Scraping**
- Reduce `ENRICH_CONCURRENCY` for stability
- Increase `SCRAPE_DELAY_MS` to avoid rate limits
- Check network connectivity and proxy settings

**Database Performance**
- Monitor query performance in Supabase dashboard
- Consider upgrading Supabase plan for larger datasets
- Use appropriate indexes (already included in migrations)

**Memory Usage**
- Limit concurrent operations for large scraping runs
- Consider processing in smaller batches
- Monitor server resources during peak usage

## 🤝 Contributing

We welcome contributions to improve VintedScrap!

### Development Process

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Commit** your changes: `git commit -m 'Add amazing feature'`
4. **Push** to the branch: `git push origin feature/amazing-feature`
5. **Open** a Pull Request with detailed description

### Contribution Guidelines

- **Code Quality**: Follow existing patterns and TypeScript conventions
- **Testing**: Test your changes thoroughly before submitting
- **Documentation**: Update README and comments for new features
- **Performance**: Consider impact on scraping speed and resource usage
- **Security**: Ensure no sensitive data is exposed or logged

### Areas for Contribution

- **🎨 UI/UX Improvements**: Better designs, mobile optimization
- **⚡ Performance**: Faster parsing, better caching strategies
- **🔍 Search Features**: Advanced filters, saved searches
- **📊 Analytics**: Better insights and data visualization
- **🔧 DevOps**: Improved deployment and monitoring tools

## 📝 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

### What this means:
- ✅ **Commercial Use**: You can use this for commercial projects
- ✅ **Modification**: You can modify and distribute changes
- ✅ **Distribution**: You can distribute the original or modified versions
- ✅ **Private Use**: You can use this privately without restrictions
- ⚠️ **Liability**: No warranty or liability from the authors
- 📋 **License Notice**: Must include license notice in distributions

## 🎉 Acknowledgments

### Technologies Used
- **Next.js Team** - For the amazing React framework
- **Vercel** - For seamless deployment platform
- **Supabase** - For the excellent PostgreSQL-as-a-Service
- **Tailwind CSS** - For the utility-first CSS framework
- **shadcn/ui** - For beautiful, accessible UI components
- **Lucide** - For the comprehensive icon library
- **Puppeteer** - For browser automation capabilities

### Community
- **Open Source Community** - For inspiration and best practices
- **Vinted Users** - For creating the marketplace we're analyzing
- **Contributors** - Everyone who helps improve this project

---

## 🚀 Ready to Start?

1. **⚡ Quick Setup**: Follow the Quick Start guide above
2. **🏭 Cookie Factory**: Generate fresh cookies in Settings
3. **🎯 First Scrape**: Try searching for "nintendo gameboy" with a limit of 10
4. **📊 Explore Data**: Browse your results in the Items section
5. **🔔 Set Alerts**: Create price alerts for items you're interested in
6. **⚙️ Monitor**: Check the Settings page for system health
7. **🔧 Customize**: Adjust settings for your specific needs

**Happy scraping!** 🛍️✨

---

*Built with ❤️ for the data analysis and e-commerce research community.*

*Last updated: January 2025*
