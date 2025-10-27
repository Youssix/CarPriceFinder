# CarPriceFinder API Documentation

Server API documentation for CarPriceFinder backend.

**Base URL**: `http://localhost:3001`

---

## Endpoints

### 1. Health Check

**GET** `/api/health`

Check server status and AI availability.

**Response**:
```json
{
  "ok": true,
  "status": "running",
  "aiEnabled": true,
  "timestamp": "2024-10-02T17:00:00.000Z",
  "version": "2.0.0"
}
```

**Example**:
```bash
curl http://localhost:3001/api/health
```

---

### 2. Car Price Estimation

**GET** `/api/estimation`

Analyze car and return price estimation with detected options.

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `brand` | string | Yes | Car brand (e.g., "BMW", "Audi") |
| `model` | string | Yes | Car model (e.g., "320", "A4") |
| `year` | number | Yes | Year (e.g., 2020) |
| `km` | number | Yes | Mileage in km (e.g., 50000) |
| `fuel` | string | Yes | Fuel type: "petrol", "diesel", "electric", "hybrid" |
| `gearbox` | string | No | "manual" or "automatic" |
| `price` | number | Yes | Auto1 price in euros (e.g., 25000) |
| `title` | string | No | Car title/description |
| `description` | string | No | Full description |
| `equipment` | string | No | Equipment list (comma-separated) |

**Response**:
```json
{
  "success": true,
  "detectedOptions": [
    {
      "name": "M-Sport",
      "confidence": 0.95,
      "valueImpact": 0.10
    }
  ],
  "baseLbcPrice": 27500,
  "adjustedLbcPrice": 30250,
  "margin": 5250,
  "marginPercent": 21,
  "count": 15,
  "lbcUrl": "https://www.leboncoin.fr/recherche?category=2&text=BMW%20320%20M%20Sport&...",
  "minPriceFilter": 12500
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "Missing required parameter: brand"
}
```

**Example**:
```bash
curl -G http://localhost:3001/api/estimation \
  --data-urlencode "brand=BMW" \
  --data-urlencode "model=320" \
  --data-urlencode "year=2020" \
  --data-urlencode "km=50000" \
  --data-urlencode "fuel=diesel" \
  --data-urlencode "gearbox=automatic" \
  --data-urlencode "price=25000" \
  --data-urlencode "title=BMW 320d M Sport" \
  --data-urlencode "equipment=Navigation,Toit ouvrant,Sièges sport"
```

---

### 3. Generate LeBonCoin URL

**GET** `/api/lbc-url`

Generate enhanced LeBonCoin search URL with detected options.

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `brand` | string | Yes | Car brand |
| `model` | string | Yes | Car model |
| `year` | number | Yes | Year |
| `km` | number | No | Maximum mileage |
| `fuel` | string | Yes | Fuel type |
| `gearbox` | string | No | Gearbox type |
| `minPrice` | number | No | Minimum price filter |
| `options` | string | No | Detected options (comma-separated) |

**Response**:
```json
{
  "success": true,
  "url": "https://www.leboncoin.fr/recherche?category=2&text=BMW%20320%20M%20Sport&...",
  "searchTerms": "BMW 320 M Sport",
  "filters": {
    "minPrice": 12500,
    "maxKm": 75000,
    "fuel": "diesel"
  }
}
```

**Example**:
```bash
curl -G http://localhost:3001/api/lbc-url \
  --data-urlencode "brand=BMW" \
  --data-urlencode "model=320" \
  --data-urlencode "year=2020" \
  --data-urlencode "fuel=diesel" \
  --data-urlencode "options=M-Sport"
```

---

## Data Models

### Detected Option
```typescript
{
  name: string;          // Option name (e.g., "M-Sport")
  confidence: number;    // 0.0 to 1.0
  valueImpact: number;   // Percentage increase (e.g., 0.10 = 10%)
}
```

### Fuel Type Mapping
```javascript
{
  "petrol": "1",
  "diesel": "2",
  "electric": "3",
  "hybrid": "4"
}
```

### Gearbox Type Mapping
```javascript
{
  "manual": "1",
  "automatic": "2",
  "duplex": "2"
}
```

---

## Error Codes

| Code | Description |
|------|-------------|
| 400 | Bad Request - Missing or invalid parameters |
| 500 | Internal Server Error - Server or scraping failure |
| 503 | Service Unavailable - AI service down (falls back to rules) |

---

## Rate Limiting

**Default limits**:
- 100 requests per minute per IP
- Configurable via `RATE_LIMIT_MAX` environment variable

**Headers**:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1633024800
```

---

## Authentication

**Current version**: No authentication required (localhost only)

**Future versions** (SaaS):
- API key authentication: `Authorization: Bearer YOUR_API_KEY`
- Rate limits per tier (Free: 100/day, Pro: 10000/day)

---

## Premium Option Detection

### Supported Options

**German Brands**:
- **Audi**: S-Line (+8%), RS (+25%), Quattro (+5%)
- **BMW**: M-Sport (+10%), M Performance (+25%)
- **Mercedes**: AMG (+20%), AMG Line (+8%)
- **VW**: R-Line (+7%), GTI (+15%)

**Other Brands**:
- **Ford**: ST-Line (+8%)
- **Kia**: GT-Line (+6%)
- **Honda**: Type R (+20%)
- **Mini**: Cooper S (+12%), JCW (+18%)

### Detection Methods

1. **Rule-Based** (always active):
   - Keyword matching in title/description/equipment
   - Brand-specific patterns
   - Confidence: 0.8-1.0

2. **AI-Enhanced** (if OpenAI API key set):
   - GPT-3.5 contextual analysis
   - Equipment list understanding
   - Multi-language support
   - Confidence: 0.6-1.0

---

## LeBonCoin Scraping

### API Details
- **Endpoint**: `https://api.leboncoin.fr/api/autos/v1/search`
- **Method**: POST
- **Headers**: Mobile app headers (iOS 16.4.1)
- **API Key**: `ba0c2dad52b3ec` (public mobile app key)

### Smart Price Filtering
- Minimum price: 50% of Auto1 price
- Prevents scam listings, parts, damaged cars
- Improves margin calculation accuracy

### Search Parameters
```json
{
  "filters": {
    "category": { "id": "2" },
    "keywords": { "text": "BMW 320 M Sport" },
    "enums": {
      "fuel": ["2"],
      "gearbox": ["1"]
    },
    "ranges": {
      "mileage": { "max": 75000 },
      "price": { "min": 12500 }
    }
  },
  "limit": 35,
  "offset": 0
}
```

---

## Environment Variables

See `.env.example` for complete configuration options.

**Required**:
```bash
PORT=3001
```

**Optional** (AI features):
```bash
OPENAI_API_KEY=your_key
AI_MODEL=gpt-3.5-turbo
```

**Advanced**:
```bash
RATE_LIMIT_MAX=100
LOG_LEVEL=info
NODE_ENV=production
```

---

## Examples & Use Cases

### Example 1: Simple Price Check
```bash
# Minimum parameters
curl -G http://localhost:3001/api/estimation \
  --data-urlencode "brand=Audi" \
  --data-urlencode "model=A4" \
  --data-urlencode "year=2021" \
  --data-urlencode "km=30000" \
  --data-urlencode "fuel=diesel" \
  --data-urlencode "price=28000"
```

### Example 2: Full Analysis with Options
```bash
# With equipment list for AI detection
curl -G http://localhost:3001/api/estimation \
  --data-urlencode "brand=BMW" \
  --data-urlencode "model=320" \
  --data-urlencode "year=2020" \
  --data-urlencode "km=50000" \
  --data-urlencode "fuel=diesel" \
  --data-urlencode "gearbox=automatic" \
  --data-urlencode "price=25000" \
  --data-urlencode "title=BMW 320d M Sport Package" \
  --data-urlencode "equipment=M Sport Package,Navigation Professional,Toit ouvrant panoramique,Sièges sport"
```

### Example 3: JavaScript Fetch
```javascript
const estimateCar = async (carData) => {
  const params = new URLSearchParams({
    brand: carData.brand,
    model: carData.model,
    year: carData.year,
    km: carData.km,
    fuel: carData.fuel,
    price: carData.price
  });

  const response = await fetch(`http://localhost:3001/api/estimation?${params}`);
  const data = await response.json();

  console.log('Detected options:', data.detectedOptions);
  console.log('Estimated margin:', data.margin, '€');

  return data;
};

// Usage
estimateCar({
  brand: 'Mercedes',
  model: 'CLA',
  year: 2021,
  km: 25000,
  fuel: 'petrol',
  price: 35000
});
```

---

## Changelog

See `CHANGELOG.md` for API version history and breaking changes.

---

## Support

**Issues**: https://github.com/yourusername/carpricefinder/issues
**Documentation**: See `CLAUDE.md` for development context
**Contributing**: See `CONTRIBUTING.md` for contribution guidelines
