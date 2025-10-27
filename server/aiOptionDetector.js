const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

// Premium option patterns and their typical value impact
const PREMIUM_OPTIONS = {
    // German Premium Lines
    'S-Line': { brands: ['AUDI'], valueImpact: 0.08, keywords: ['s line', 'sline', 's-line'] },
    'RS': { brands: ['AUDI'], valueImpact: 0.25, keywords: ['rs', 'rs3', 'rs4', 'rs5', 'rs6', 'rs7'] },
    'AMG': { brands: ['MERCEDES', 'MERCEDES-BENZ'], valueImpact: 0.20, keywords: ['amg', 'mercedes-amg'] },
    'M-Sport': { brands: ['BMW'], valueImpact: 0.10, keywords: ['m sport', 'm-sport', 'msport'] },
    'M Performance': { brands: ['BMW'], valueImpact: 0.25, keywords: ['m3', 'm4', 'm5', 'm6', 'm8', 'm performance'] },
    
    // French Premium
    'GT-Line': { brands: ['KIA'], valueImpact: 0.06, keywords: ['gt line', 'gt-line', 'gtline'] },
    'R-Line': { brands: ['VOLKSWAGEN'], valueImpact: 0.07, keywords: ['r line', 'r-line', 'rline'] },
    'ST-Line': { brands: ['FORD'], valueImpact: 0.08, keywords: ['st line', 'st-line', 'stline'] },
    
    // Luxury Packages
    'Executive': { brands: ['*'], valueImpact: 0.05, keywords: ['executive', 'luxury', 'premium'] },
    'Sport Package': { brands: ['*'], valueImpact: 0.06, keywords: ['sport package', 'sport pack', 'pack sport'] },
    'Technology Package': { brands: ['*'], valueImpact: 0.04, keywords: ['tech pack', 'technology', 'tech package'] },
    
    // Specific Model Variants
    'GTI': { brands: ['VOLKSWAGEN'], valueImpact: 0.15, keywords: ['gti', 'golf gti'] },
    'Type R': { brands: ['HONDA'], valueImpact: 0.20, keywords: ['type r', 'type-r', 'civic type r'] },
    'Cooper S': { brands: ['MINI'], valueImpact: 0.12, keywords: ['cooper s', 'john cooper works', 'jcw'] }
};

// AI-powered option detection using OpenAI-compatible API
class AIOptionDetector {
    constructor(apiKey = null, apiUrl = 'https://api.openai.com/v1/chat/completions') {
        this.apiKey = apiKey || process.env.OPENAI_API_KEY;
        this.apiUrl = apiUrl;
        this.useAI = !!this.apiKey;
    }

    // Detect premium options from car data
    async detectOptions(carData) {
        const { manufacturerName, mainType, description, equipment, trim } = carData;
        
        // Combine all text sources
        const fullText = [
            manufacturerName,
            mainType,
            description,
            equipment?.join(' '),
            trim
        ].filter(Boolean).join(' ').toLowerCase();

        const detectedOptions = {
            premiumOptions: [],
            estimatedValueImpact: 0,
            searchKeywords: [],
            confidence: 0
        };

        // Rule-based detection first
        const ruleBasedOptions = this.detectOptionsRuleBased(fullText, manufacturerName);
        detectedOptions.premiumOptions.push(...ruleBasedOptions.options);
        detectedOptions.estimatedValueImpact += ruleBasedOptions.valueImpact;

        // AI enhancement if available
        if (this.useAI && fullText.length > 10) {
            try {
                const aiResult = await this.detectOptionsWithAI(fullText, manufacturerName, mainType);
                
                // Merge AI results with rule-based
                if (aiResult.additionalOptions) {
                    detectedOptions.premiumOptions.push(...aiResult.additionalOptions);
                    detectedOptions.estimatedValueImpact += aiResult.additionalValueImpact || 0;
                }
                
                detectedOptions.searchKeywords = aiResult.searchKeywords || [];
                detectedOptions.confidence = aiResult.confidence || 0.5;
            } catch (error) {
                console.warn('AI detection failed, using rule-based only:', error.message);
                detectedOptions.confidence = 0.7; // Rule-based confidence
            }
        } else {
            detectedOptions.confidence = 0.7; // Rule-based only
        }

        // Generate enhanced search terms
        detectedOptions.enhancedSearchTerms = this.generateEnhancedSearchTerms(
            manufacturerName, 
            mainType, 
            detectedOptions.premiumOptions
        );

        return detectedOptions;
    }

    // Rule-based option detection
    detectOptionsRuleBased(text, brand) {
        const detectedOptions = [];
        let totalValueImpact = 0;

        for (const [optionName, config] of Object.entries(PREMIUM_OPTIONS)) {
            // Check if brand matches (or wildcard)
            if (config.brands.includes('*') || 
                config.brands.some(b => brand.toUpperCase().includes(b))) {
                
                // Check if any keywords match
                const hasOption = config.keywords.some(keyword => 
                    text.includes(keyword.toLowerCase())
                );

                if (hasOption) {
                    detectedOptions.push({
                        name: optionName,
                        confidence: 0.8,
                        valueImpact: config.valueImpact,
                        source: 'rule-based'
                    });
                    totalValueImpact += config.valueImpact;
                }
            }
        }

        return { options: detectedOptions, valueImpact: totalValueImpact };
    }

    // AI-powered option detection
    async detectOptionsWithAI(text, brand, model) {
        if (!this.useAI) return {};

        const prompt = `Analyze this car description and identify premium options/packages:

Brand: ${brand}
Model: ${model}
Description: ${text}

Identify:
1. Premium trim levels (S-Line, AMG, M-Sport, etc.)
2. Performance packages 
3. Luxury options
4. Technology packages
5. Any special editions

For each option found, estimate its market value impact as a percentage (0.05 = 5% price increase).

Also suggest search keywords that would help find similar cars on French marketplace sites.

Return JSON format:
{
  "options": [{"name": "option name", "valueImpact": 0.05, "confidence": 0.9}],
  "searchKeywords": ["keyword1", "keyword2"],
  "confidence": 0.8
}`;

        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-3.5-turbo',
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 500,
                    temperature: 0.3
                })
            });

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content;
            
            if (content) {
                // Try to parse JSON response
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const result = JSON.parse(jsonMatch[0]);
                    return {
                        additionalOptions: result.options || [],
                        additionalValueImpact: result.options?.reduce((sum, opt) => sum + opt.valueImpact, 0) || 0,
                        searchKeywords: result.searchKeywords || [],
                        confidence: result.confidence || 0.5
                    };
                }
            }
        } catch (error) {
            console.error('AI API error:', error);
        }

        return {};
    }

    // Generate enhanced search terms for LeBonCoin
    generateEnhancedSearchTerms(brand, model, options) {
        const terms = [`${brand} ${model}`];
        
        // Add option-specific terms
        options.forEach(option => {
            terms.push(`${brand} ${model} ${option.name}`);
            
            // Add alternative spellings/formats
            if (option.name.includes('-')) {
                terms.push(`${brand} ${model} ${option.name.replace('-', ' ')}`);
                terms.push(`${brand} ${model} ${option.name.replace('-', '')}`);
            }
        });

        return terms;
    }

    // Calculate adjusted price based on detected options
    calculateAdjustedPrice(basePrice, detectedOptions) {
        const totalImpact = detectedOptions.estimatedValueImpact;
        const adjustedPrice = basePrice * (1 + totalImpact);
        
        return {
            originalPrice: basePrice,
            adjustedPrice: Math.round(adjustedPrice),
            totalValueImpact: totalImpact,
            adjustmentAmount: Math.round(adjustedPrice - basePrice),
            confidence: detectedOptions.confidence
        };
    }
}

module.exports = AIOptionDetector;
