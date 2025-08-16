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
  // Ajoute d'autres
};

// Blacklist pour filtrer pièces/scams
const blacklistKeywords = [
    "moteur", "boite", "turbo", "injecteur", "piece", "pieces", "épave", "pour pieces", "démonté", "casse", "moteurs"
];

// Anti-spam: 4s entre appels
let lastRequestTimestamp = 0;

app.get("/api/estimation", async (req, res) => {
    const now = Date.now();
    if (now - lastRequestTimestamp < 4000) {
        return res.status(429).json({ ok: false, error: "Trop de requêtes. Réessaie dans quelques secondes." });
    }

    const { model, brand, year, km, fuel, gearbox, doors, vehicle_type, colour, critair, min_price = 500 } = req.query;
    if (!model || !brand || !year || !km) {
        return res.status(400).json({ ok: false, error: "Paramètres manquants (model, brand, year, km)" });
    }

    const rawBrand = brand || "";
    const brandMapped = brandMap[rawBrand.toUpperCase()] || rawBrand;
    const yearInt = parseInt(year);
    const kmInt = parseInt(km);
    const minPriceInt = parseInt(min_price);

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

    if (doors) {
        if (doors === "4") {
            enums.doors = ["4", "5"]; // Recherche 4 et 5 pour CLA/GLE etc. (Shooting Brake/Break souvent 5p)
        } else {
            enums.doors = [doors]; // Ex: 3p seulement 3
        }
    }

    if (vehicle_type) enums.vehicle_type = [vehicle_type];
    if (colour) enums.vehicule_color = [colour];
    if (critair) enums.critair = [critair];

    const carModel = req.query.carModel || model; // Fallback sur model
    let uCarModel;
    let keywordsText = model; // Default keywords
    if (brand && carModel) {
        let modelClean = carModel.trim().replace(/ /g, '_');
        // Map spécial Mercedes pour Klasse -> Classe (CLA, CLE, GLA, GLE etc.)
        if (brandMapped.toUpperCase() === "MERCEDES-BENZ" && modelClean.endsWith('-Klasse')) {
            const base = modelClean.replace(/-Klasse$/, '').replace(/_/g, ' ');
            modelClean = `Classe_${base.replace(/ /g, '_')}`; // Ex: CLA-Klasse -> Classe_CLA
            keywordsText = `${brandMapped} ${base}`; // Keywords sans -Klasse, ex: "Mercedes-Benz CLA"
        } else if (brandMapped.toUpperCase() === "VOLKSWAGEN" && modelClean.startsWith('Golf')) {
            modelClean = 'Golf'; // Use base Golf for Volkswagen, specify generation in keywords
        }
        const brandUpper = brandMapped.toUpperCase().replace(/ /g, '-');
        const baseModel = modelClean.split('_')[0];
        uCarModel = `${brandUpper}_${modelClean}`; // Ex: VOLKSWAGEN_Golf
        enums.u_car_model = [uCarModel];
    }

    // Keywords avec exclusions pour virer pièces
    keywordsText = `${keywordsText}`;

    const payload = {
        extend: true,
        filters: {
            category: { id: "2" }, // Voitures
            enums,
            keywords: { text: keywordsText },
            ranges: {
                regdate: {
                    min: yearInt - 2,
                    max: yearInt + 2
                },
                mileage: {
                    min: Math.max(1, kmInt - 30000),
                    max: kmInt + 30000
                },
                price: { // Ajout: filtre prix min pour éviter scams
                    min: minPriceInt,
                }
            }
        },
        listing_source: "direct-search",
        offset: 0,
        limit: 35, // Limite à 35
        limit_alu: 3,
        sort_by: "price", // Tri par prix
        sort_order: "asc" // Ascendant pour les moins chers d'abord
    };

    console.log("📦 Payload envoyé à LBC:\n", JSON.stringify(payload, null, 2)); // Log payload

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
