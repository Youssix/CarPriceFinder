# CarPriceFinder 🚗💰

An intelligent browser extension and server system that analyzes car prices on Auto1 and provides enhanced market comparisons using AI-powered option detection.

## 🎯 What It Does

**Before**: You see a "BMW 320" on Auto1 for 25,000€ but don't know if it's a good deal.

**After**: The extension detects it's actually a "BMW 320 M-Sport" with premium options, adjusts the market estimate to 27,500€, and shows you comparable cars on LeBonCoin with the same features.

## ✨ Key Features

### 🤖 AI-Powered Option Detection
- Automatically detects premium options (S-Line, AMG, M-Sport, GTI, etc.)
- Understands equipment lists and descriptions
- Adjusts price estimates based on option value
- Works in multiple languages

### ⚡ Dynamic Performance Control
- **Configurable request timeouts**: 1s to 12s intervals
- **Smart caching system**: Avoid re-analyzing same cars
- **Real-time settings**: Change speed without reloading
- **Cache statistics**: Monitor performance and savings

### 💾 Intelligent Caching
- **24-hour default cache**: Remember analyzed cars
- **Configurable duration**: 1 hour to 7 days
- **Smart cleanup**: Automatic old entry removal
- **Storage efficient**: Chrome extension storage integration

### 📊 Smart Price Analysis
- Real-time LeBonCoin market comparison
- **Smart price filtering**: Minimum 50% of Auto1 price
- Base price vs. premium-adjusted pricing
- Profit margin calculation
- Confidence scoring
- Automatic filtering of scam/parts listings

### 🔍 Enhanced Search
- Includes detected options in marketplace searches
- Better matching with similar vehicles
- Filters out parts/damaged cars automatically

### 💡 Business Intelligence
- Spot undervalued premium cars
- Calculate potential resale margins
- Make informed purchase decisions

## 🚀 Installation

### 1. Server Setup

```bash
cd server
npm install
```

Copy the environment template:
```bash
cp .env.example .env
```

**Option A: Basic Setup (No AI)**
```bash
npm start
```

**Option B: With OpenAI (Recommended)**
1. Get API key from https://openai.com/api/
2. Edit `.env` and add: `OPENAI_API_KEY=your_key_here`
3. Start server: `npm start`

**Option C: With Local AI (Privacy-focused)**
1. Install Ollama: https://ollama.ai/
2. Download model: `ollama pull llama2`
3. Edit `.env`: 
   ```
   AI_ENDPOINT=http://localhost:11434/v1/chat/completions
   AI_MODEL=llama2
   ```
4. Start server: `npm start`

### 2. Browser Extension Setup

1. Open Chrome/Edge Extensions page
2. Enable "Developer mode"  
3. Click "Load unpacked"
4. Select the CarPriceFinder root directory
5. **Click the extension icon** to configure settings:
   - **Request timeout**: How fast to analyze cars (1-12 seconds)
   - **Cache duration**: How long to remember analyses (1 hour - 7 days)
   - **Server connection**: Test if backend is running
6. Visit auto1.com and start browsing cars

### 3. Extension Configuration

**Click the CarPriceFinder icon in your browser toolbar** to access:

#### ⚡ Speed Settings
- **Ultra Fast (1s)**: High server load, instant results
- **Fast (3s)**: Recommended for good internet
- **Normal (5s)**: Default, balanced performance  
- **Slow (8s)**: For slower connections
- **Very Slow (12s)**: Economy mode, minimal load

#### 💾 Cache Settings
- **Disabled**: Always analyze (slow but fresh)
- **1 Hour**: Good for testing/development
- **24 Hours**: Recommended for production use
- **7 Days**: Maximum efficiency, less accuracy

#### 📊 Performance Monitor
- View cache hit rates
- Monitor saved requests  
- Check server connection status
- **Clear cache** when needed
- **Force refresh** to bypass cache temporarily

**Cache Management:**
- **Clear Cache**: Permanently removes all stored analyses
- **Force Refresh**: Temporarily bypasses cache (5-minute timeout)
- **Auto-cleanup**: Removes expired entries automatically
- **Smart storage**: Only keeps valid, recent analyses

## 📈 How It Works

### Detection Examples

| Car Description | Detected Options | Price Impact | Search Enhancement |
|----------------|------------------|--------------|-------------------|
| "Audi A4 S-Line" | S-Line | +8% | Searches "Audi A4 S Line" |
| "BMW 320i M Sport Paket" | M-Sport | +10% | Searches "BMW 320 M Sport" |
| "Mercedes CLA 45 AMG" | AMG | +20% | Searches "Mercedes CLA AMG" |
| "Golf GTI Performance" | GTI, Performance | +18% | Searches "Volkswagen Golf GTI" |

### AI Analysis Process

1. **Text Analysis**: Processes car title, description, equipment lists
2. **Pattern Matching**: Rule-based detection for common options
3. **AI Enhancement**: Contextual understanding of premium features
4. **Value Calculation**: Applies market-validated price adjustments
5. **Search Optimization**: Generates enhanced search terms

### Price Adjustment Examples

```
Base BMW 320i: 25,000€
+ M-Sport Package detected (+10%): +2,500€
= Adjusted estimate: 27,500€

Search terms: "BMW 320 M Sport" vs "BMW 320"
Results: More accurate comparable vehicles
```

## 🎨 Interface

The extension adds intelligent price blocks to each car card:

```
🤖 Analyse CarPriceFinder

🤖 OPTIONS DÉTECTÉES:
[M-Sport] [Navigation Package]
Impact valeur: +12% (confiance: 85%)

📈 PRIX BASE LBC: 25,500 €
🚀 PRIX AJUSTÉ IA: 28,000 €

🛠️ PRIX AUTO1: 25,000 € • 🔍 Filtre LBC: min 12,500€ (50%)
💰 MARGE POTENTIELLE: +3,000€ (+12%)

[🤖 Voir sur LBC (Recherche IA)]
```

**Smart Price Filtering:**
- Automatically sets minimum search price to 50% of Auto1 price
- Prevents scam listings, parts, or damaged cars from skewing estimates
- Shows filter information for transparency

## 🔧 Configuration

### Supported Premium Options

**German Brands:**
- **Audi**: S-Line (+8%), RS (+25%), Quattro (+5%)
- **BMW**: M-Sport (+10%), M Performance (+25%)
- **Mercedes**: AMG (+20%), AMG Line (+8%)
- **VW**: R-Line (+7%), GTI (+15%)

**Other Brands:**
- **Ford**: ST-Line (+8%)
- **Kia**: GT-Line (+6%)
- **Honda**: Type R (+20%)
- **Mini**: Cooper S (+12%), JCW (+18%)

### Environment Variables

```bash
# Required
PORT=3001

# AI Configuration (Optional)
OPENAI_API_KEY=your_key_here
AI_MODEL=gpt-3.5-turbo
AI_ENDPOINT=https://api.openai.com/v1/chat/completions

# Advanced
AI_MAX_TOKENS=500
AI_TEMPERATURE=0.3
NODE_ENV=development
```

## 📊 Performance Modes

| Mode | Timeout | Cache | Use Case | Server Load | User Experience |
|------|---------|-------|----------|-------------|-----------------|
| Ultra Fast | 1s | 24h | High-volume buying | Very High | Instant results |
| Fast | 3s | 24h | Active browsing | High | Quick results |
| Normal | 5s | 24h | Regular use | Medium | Balanced |
| Slow | 8s | 24h | Slow connection | Low | Patient browsing |
| Economy | 12s | 7d | Minimal usage | Very Low | Background analysis |

**Cache Benefits:**
- **First analysis**: Full AI processing time
- **Cached result**: Instant display (<100ms)
- **Typical hit rate**: 60-80% for repeat browsing
- **Storage efficient**: ~50KB per 100 cars analyzed

## 🛠️ Development

### File Structure
```
CarPriceFinder/
├── manifest.json          # Extension manifest with popup
├── popup.html             # Settings interface
├── popup.js               # Settings logic  
├── inject.js              # Content script injector
├── intercept.js           # Main interceptor with AI + caching
├── server/
│   ├── lbcScraper.js     # Main server with health endpoint
│   ├── aiOptionDetector.js # AI detection engine
│   ├── package.json      # Dependencies
│   └── .env.example      # Config template
├── AI_SETUP.md           # AI configuration guide
├── ICON_INSTRUCTIONS.md  # Icon creation guide
└── README.md             # This file
```

**Clean Architecture:**
- **Single intercept file**: One optimized version with all features
- **Modular server**: Separate AI detection logic
- **Extension popup**: Complete settings management
- **Smart caching**: Configurable with manual override

### API Endpoints

- `GET /api/health` - Health check for extension (returns AI status)
- `GET /api/estimation` - Get price estimation with AI analysis
- `GET /api/lbc-url` - Generate enhanced LeBonCoin URLs

### Extension Storage

The extension uses Chrome's local storage for:
- **Settings**: Request timeouts, cache duration, server URL
- **Cache**: Analyzed car data with timestamps
- **Statistics**: Hit rates, request counts, performance metrics

### Cache System

```javascript
// Cache key generation based on car characteristics
const cacheKey = generateKey({
  brand, model, year, km, fuel, 
  description, equipment
});

// Smart expiration based on user settings
if (now - entry.timestamp > cacheTimeout) {
  // Auto-cleanup expired entries
}
```

### Adding New Options

Edit `aiOptionDetector.js`:

```javascript
const PREMIUM_OPTIONS = {
    'Your Option': { 
        brands: ['BRAND'], 
        valueImpact: 0.08, // 8% increase
        keywords: ['keyword1', 'keyword2'] 
    }
};
```

## 🔍 Troubleshooting

### Common Issues

**No prices showing up?**
- Click extension icon to check server connection
- Verify server is running: `cd server && npm start`
- Check timeout settings (try slower mode)
- Look at browser console for errors

**Slow performance?**
- Increase timeout in extension settings
- Enable caching (24-hour recommended)
- Check cache hit rate in extension popup
- Consider using rule-based mode instead of AI

**Need fresh data?**
- Use "Force Refresh" button in extension popup
- This bypasses cache for 5 minutes  
- Or clear entire cache for permanent reset
- Useful when car listings are updated frequently

**Cache not working?**
- Check extension permissions (storage required)
- Use "Clear Cache" button in popup
- Verify cache statistics in popup
- Try different cache duration settings

**Extension popup not opening?**
- Reload the extension in Chrome extensions page
- Check for JavaScript errors in popup console
- Verify manifest.json permissions are correct

### Debug Mode

Enable detailed logging:
```bash
NODE_ENV=development npm start
```

Check browser console for detailed AI analysis logs.

## 🚀 Business Value

### For Dealers
- **Identify undervalued cars**: Spot premium options sellers missed
- **Accurate pricing**: Know true market value including options
- **Competitive advantage**: Better purchase decisions
- **Risk reduction**: Avoid overpaying for base models

### ROI Examples
- Buy BMW 320i "base" for 25k → Discover M-Sport → Sell for 28k = +3k profit
- Avoid Golf "GTI" at 30k → Detect it's base Golf → Save 5k mistake
- **Smart filtering**: Skip 5k€ "BMW 320" (damaged) → Find real 22k€ listings

### Price Filtering Benefits
- **Eliminates noise**: No more parts, accidents, or scam listings
- **Accurate estimates**: Based on real, complete vehicles only
- **Transparent process**: Shows exactly what price range was used
- **Automatic protection**: 50% minimum prevents most problematic listings

## 📄 License

MIT License - Feel free to use and modify for your business needs.

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Add your improvements
4. Test with different car types
5. Submit pull request

## 📞 Support

For questions or issues, check the browser console logs and server output for debugging information.