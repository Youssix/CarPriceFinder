const express = require("express");
const cors = require("cors");
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const app = express();
const PORT = 3001;

// Headers mobiles pour éviter blocage
const HEADERS = {
    'Host': 'api.leboncoin.fr',
    'Connection': 'keep-alive',
    'Accept': 'application/json',
    'User-Agent': 'LBC;iOS;16.4.1;iPhone;phone;UUID;wifi;6.102.0;24.32.1930',
    'api_key': 'ba0c2dad52b3ec',
    'Accept-Language': 'fr-FR,fr;q=0.9',
    'Content-Type': 'application/json'
};

app.use(cors());

function mapFuelType(fuelType) {
    switch (fuelType.toLowerCase()) {
        case "petrol": return "1";
        case "diesel": return "2";
        case "electric": return "3";
        case "hybrid": return "4";
        default: return null;
    }
}

function mapGearbox(gearType) {
    switch (gearType.toLowerCase()) {
        case "manual": return "1";
        case "automatic": return "2";
        case "duplex": return "2"; 
        default: return null;
    }
}

const brandMap = {
  "LAND ROVER": "LAND-ROVER",
  "MERCEDES BENZ": "MERCEDES-BENZ",
  "ROLLS ROYCE": "ROLLS-ROYCE",
  // Ajoute d'autres au fur et à mesure
};

// 🕒 Anti-spam : limiter à 1 appel par minute
let lastRequestTimestamp = 0;


app.get("/api/estimation", async (req, res) => {
    const now = Date.now();
    if (now - lastRequestTimestamp < 4000) {
        return res.status(429).json({ ok: false, error: "Trop de requêtes. Réessaie dans quelques secondes." });
    }

    const { model, brand, year, km, fuel, gearbox } = req.query;
    if (!model || !brand || !year || !km) {
        return res.status(400).json({ ok: false, error: "Paramètres manquants (model, brand, year, km)" });
    }


    const rawBrand = req.query.brand || "";
    const brandMapped = brandMap[rawBrand.toUpperCase()] || rawBrand;
    const yearInt = parseInt(year);
    const kmInt = parseInt(km);

    lastRequestTimestamp = now;


    const enums = {
        ad_type: ["offer"],
    };

    if (brand) {
        enums.u_car_brand = [brandMapped.toUpperCase()];
    }



    const mappedFuel = mapFuelType(fuel);
    if (mappedFuel) enums.fuel = [mappedFuel];

    const mappedGearbox = mapGearbox(gearbox);
    if (mappedGearbox) enums.gearbox = [mappedGearbox];


    const carModel = req.query.carModel;
    if (brand && carModel) {
        const brandUpper = brandMapped.toUpperCase().replace(/ /g, '-'); // LAND ROVER → LAND-ROVER
        const modelClean = carModel.trim().replace(/ /g, '_');           // "Accord Type S" → "Accord_Type_S"

         const baseModel  = modelClean.split('_')[0];  
        enums.u_car_model = [`${brandUpper}_${baseModel}`];
    }

    const payload = {
        extend: true,
        filters: {
            category: { id: "2" }, // Voitures
            enums,
            keywords: { text: model },
            ranges: {
                regdate: {
                    min: yearInt - 2,
                    max: yearInt + 2
                },
                mileage: {
                    min: Math.max(1, kmInt - 30000),
                    max: kmInt + 30000
                }
            }
        },
        listing_source: "direct-search",
        offset: 0,
        limit: 35, // ← limite à 1 pour limiter le spam
        limit_alu: 2,
        sort_by: "price",
        sort_order: "asc"
    };

    try {
        const response = await fetch("https://api.leboncoin.fr/finder/search", {
            method: "POST",
            headers: HEADERS,
            body: JSON.stringify(payload)
        });



        // ✅ Vérifie que la réponse est correcte
        const text = await response.text();


        if (!text || text.length < 10) {
            throw new Error("Réponse vide ou invalide – possible blocage API");
        }
        if (!text || text.length < 10) {
            throw new Error("Réponse vide ou invalide – possible blocage API");
        }

        const data = JSON.parse(text);
        console.log(data);
        const results = data.ads || [];





// ✅ Trie les annonces par prix croissant
const sortedByPrice = results
    .map(ad => ad.price_cents)
    .filter(price => typeof price === 'number' && isFinite(price))
    .sort((a, b) => a - b);

    // ✅ Garde les 5 premiers (les moins chers)
const topPrices = sortedByPrice.slice(0, 5);

const estimatedPrice = topPrices.length
    ? Math.round(topPrices.reduce((sum, p) => sum + p, 0) / topPrices.length / 100)
    : null;

        res.json({
            ok: true,
            estimatedPrice,
            count: results.length,
            results
        });

         // ✅ Affiche le payload envoyé dans la console
        console.log("📦 Payload envoyé à LBC:\n", JSON.stringify(payload, null, 2));

    } catch (error) {
        console.error("❌ Scraping failed:", error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 LBC Estimator listening on http://localhost:${PORT}`);
});
