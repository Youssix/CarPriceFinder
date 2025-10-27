# Changelog

All notable changes to CarPriceFinder will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Complete commercial documentation suite (PRODUCT_BRIEF_COMMERCIAL.md, EXECUTIVE_SUMMARY.md)
- 7-day validation action plan (ACTION_PLAN_IMMEDIATE.md, START_TODAY.md)
- CLAUDE.md for AI coding assistant context
- CONTRIBUTING.md for contributor guidelines
- Package.json root with unified scripts
- Comprehensive .gitignore
- .env.example template

### Changed
- Consolidated intercept files into single intercept.js
- Improved project structure and organization

### Removed
- Deprecated intercept_ai_enhanced.js
- Deprecated intercept_cached.js

## [2.0.0] - 2024-09-10

### Added
- Smart caching system (configurable 1h-7d duration)
- Force refresh mode (5-minute cache bypass)
- Cache management UI in extension popup
- Real-time cache statistics (hit rates, storage usage)
- Dynamic performance controls (1s-12s request timeouts)
- Server health check endpoint (/api/health)
- Connection testing in extension popup

### Changed
- Upgraded to Manifest V3
- Improved AI option detection accuracy
- Enhanced LeBonCoin search with 50% minimum price filter
- Optimized cache storage using chrome.storage.local

### Fixed
- Cache expiration not working correctly
- Extension popup settings not persisting
- Race conditions in concurrent fetch requests

## [1.0.0] - 2024-08-01

### Added
- Initial Chrome extension release
- AI-powered premium option detection (M-Sport, AMG, S-Line)
- LeBonCoin market price comparison
- Profit margin calculation
- Auto1.com integration via fetch interception
- Node.js Express server with LeBonCoin scraping
- OpenAI GPT-3.5 integration (optional)
- Rule-based option detection fallback

### Features
- Detects 15+ premium option types across German brands
- Real-time price analysis on Auto1 listings
- Enhanced search term generation
- Visual price cards in Auto1 UI
- Configurable server timeout settings

---

## Version History

**[2.0.0]** - Major update with caching system and performance improvements
**[1.0.0]** - Initial release with AI option detection

---

## Upcoming Features (Roadmap)

See `PRODUCT_BRIEF_COMMERCIAL.md` for detailed roadmap:

### Phase 1 - MVP (Months 1-3)
- [ ] Web dashboard with analysis history
- [ ] Email alert system for good deals
- [ ] A-F profitability scoring
- [ ] Stripe payment integration

### Phase 2 - Growth (Months 4-6)
- [ ] Price history tracking (30/60/90 days)
- [ ] Multi-platform support (Mobile.de, AutoScout24)
- [ ] Mobile app (iOS/Android)
- [ ] Push notifications

### Phase 3 - Enterprise (Months 7-12)
- [ ] Public REST API
- [ ] CRM integrations (Salesforce, Pipedrive)
- [ ] Multi-user teams & permissions
- [ ] White-label for dealerships

---

## Migration Guides

### Upgrading from 1.0 to 2.0

**Extension users**:
1. Remove old extension from Chrome
2. Load new version from chrome://extensions
3. Click extension icon to configure cache settings
4. Recommended: 24h cache duration, 5s timeout

**Server users**:
1. Pull latest code: `git pull origin main`
2. Update dependencies: `cd server && npm install`
3. Copy new .env template: `cp .env.example .env`
4. Restart server: `npm start`

**Breaking changes**:
- Extension popup now required for settings (no more hardcoded defaults)
- Cache is enabled by default (can be disabled in popup)

---

## Support

For issues or questions:
- GitHub Issues: https://github.com/yourusername/carpricefinder/issues
- Documentation: See README.md and CLAUDE.md
- Contributing: See CONTRIBUTING.md
