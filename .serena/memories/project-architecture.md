# CarPriceFinder Architecture Summary

## Core Flow
Auto1.com → intercept.js → /api/estimation → lbcScraper.js → LeBonCoin API → Display price card

## Key Components
- **intercept.js**: Chrome extension frontend, intercepts fetch(), renders price cards
- **lbcScraper.js**: Express server (:9001), scrapes LBC API, returns median prices
- **aiOptionDetector.js**: Premium option detection (AMG, M-Sport, S-Line) - NOT CURRENTLY INTEGRATED

## Current Pricing Logic
1. Fetches LBC listings matching car criteria (brand, model, year±3, km+30k)
2. Calculates MEDIAN price from results
3. Displays: AUTO1 price vs LBC median, margin calculation

## Premium Options System (aiOptionDetector.js)
- PREMIUM_OPTIONS object with valueImpact percentages
- AIOptionDetector class with rule-based + AI detection
- calculateAdjustedPrice() multiplies base price by (1 + totalImpact)
- **ISSUE**: Not integrated into main flow (lbcScraper.js doesn't use it)

## UI Card Shows
- AUTO1 price vs LBC estimated price
- Margin calculation (LBC - AUTO1)
- Cache badge if from cache
- LBC link button, Add to list button

## Current Gaps Identified
1. aiOptionDetector.js exists but NOT used by server
2. No "real selling price" calculation - just median of listings
3. Options not factored into price comparison
4. No finishing/trim level consideration in search
