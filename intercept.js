(function () {
  // Interception fetch

  // Interception XHR
  const originalXHR = window.XMLHttpRequest;

  function CustomXHR() {
    const xhr = new originalXHR();

    const open = xhr.open;
    xhr.open = function (method, url, ...rest) {
      this._url = url;
      return open.call(this, method, url, ...rest);
    };

    const send = xhr.send;
    xhr.send = function (...args) {
      this.addEventListener("load", function () {
        if (this._url && this._url.includes("/v1/car-search/cars/search")) {
          try {
            const json = JSON.parse(this.responseText);
            console.log("[✅ Intercepted via XHR]", json);
            injectPluginPrices(json.hits); // 👈 appel injection
          } catch (e) {
            console.warn("[❌ XHR parse error]", e);
          }
        }
      });

      return send.apply(this, args);
    };

    return xhr;
  }

  window.XMLHttpRequest = CustomXHR;

  console.log("[🚀 Auto1 interceptor injected in page context]");
})();

function mapBodyType(body) {
  const map = {
    "van": "utilitaire",
    "sedan": "berline",
    "hatchback": "berline",
    "suv": "4x4_suv_crossovers",
    "convertible": "cabriolet",
    // Ajoute plus
  };
  return map[body.toLowerCase()] || "";
}

function mapColour(col) {
  const map = {
    "black": "noir",
    "white": "blanc",
    "grey": "gris",
    "silver": "gris",
    "blue": "bleu",
    "red": "rouge",
    // Ajoute plus
  };
  return map[col.toLowerCase()] || "";
}

function mapCritair(fuel, year) {
  if (fuel === "diesel" && year < 2001) return "5"; // Ex: non-classé vieux diesel
  // Ajoute logique
  return "";
}

function mapFuelType(fuelType) {
    switch (fuelType.toLowerCase()) {
        case "petrol": return "1";
        case "diesel": return "2";
        case "electric": return "3";
        case "hybrid": return "4";
        default: return "";
    }
}

function mapGearbox(gearType) {
    switch (gearType.toLowerCase()) {
        case "manual": return "1";
        case "automatic": return "2";
        case "duplex": return "2"; 
        default: return "";
    }
}

function injectPluginPrices(hits) {
  console.log(`[🔍 injectPluginPrices] ${hits.length} véhicules à traiter`);

  hits.forEach((car, i) => {
    setTimeout(() => {
      const stockId = car.stockNumber;
      const price = car.searchPrice || car.minimumBid || car.mpPrice;

      if (!price) {
        console.log(`[⚠️ VEHICULE ${i}] Pas de prix trouvé pour ${stockId}`);
        return;
      }

      const euros = (price / 100).toFixed(0) + " €";
      const card = document.querySelector(`.big-car-card[data-qa-id="${stockId}"]`);

      if (!card) {
        console.log(`[❌ VEHICULE ${i}] Carte non trouvée pour stockNumber=${stockId}`);
        return;
      }

      if (card.querySelector(".plugin-price")) {
        console.log(`[🔁 VEHICULE ${i}] Bloc déjà injecté pour ${stockId}`);
        return;
      }

      const searchModel = `${car.manufacturerName} ${car.mainType}`.trim();
      const year = new Date(car.firstRegistrationDate).getFullYear();
      const km = car.km;
      const brand = car.manufacturerName.toUpperCase();
      const fuel = (car.fuelType || "").toLowerCase();      
      const gearbox = (car.gearType || "").toLowerCase();   
      const carModel = (car.mainType || "").trim();         
      const doors = car.doors || "";                        
      const vehicleType = mapBodyType(car.bodyType || "");  
            

      // URL pour estimation (garde fetch pour estimation)
      let estUrl = `http://localhost:3001/api/estimation?model=${encodeURIComponent(searchModel)}&year=${year}&km=${km}&brand=${brand}&fuel=${fuel}&gearbox=${gearbox}&carModel=${encodeURIComponent(carModel)}&doors=${encodeURIComponent(doors)}`;
      if (vehicleType) estUrl += `&vehicle_type=${encodeURIComponent(vehicleType)}`;


      fetch(estUrl)
        .then(res => res.json())
        .then(data => {
          const pluginPriceDiv = document.createElement("div");
          pluginPriceDiv.className = "plugin-price";
          pluginPriceDiv.style = "font-weight:bold;font-size:16px;margin:10px 0;color:#007bff;";

          const estimateDiv = document.createElement("div");
          estimateDiv.style = "font-size:14px;color:#28a745;margin-top:5px;";
          estimateDiv.innerText = `📈 ESTIMATION LBC : ${data.estimatedPrice || "N/A"} €`;

          const realPriceDiv = document.createElement("div");
          realPriceDiv.style = "font-size:13px;color:#6c757d;margin-top:2px;";
          realPriceDiv.innerText = `🛠️ PRIX PRODUIT : ${(price / 100).toFixed(0)} €`;

          // Build LBC URL direct in plugin (no fetch)
          let text = searchModel; // Default text
          let uCarModel = '';
          if (brand && carModel) {
            let modelClean = carModel.trim().replace(/ /g, '_');
            if (brand.toUpperCase() === "MERCEDES-BENZ" && modelClean.endsWith('-Klasse')) {
              const base = modelClean.replace(/-Klasse$/, '').replace(/_/g, ' ');
              modelClean = `Classe_${base.replace(/ /g, '_')}`;
              text = `${brand} ${base}`;
            } else if (brand.toUpperCase() === "VOLKSWAGEN" && modelClean.startsWith('Golf')) {
              modelClean = 'Golf';
            }
            const brandUpper = brand.replace(/ /g, '-');
            uCarModel = `${brandUpper}_${modelClean}`;
          }

          let doorsParam = '';
          if (doors) {
            doorsParam = doors === "4" ? '4,5' : doors; // Adapt for URL (comma separated)
          }

          const lbcUrl = `https://www.leboncoin.fr/recherche?category=2&text=${encodeURIComponent(text)}&regdate=${year-2}-${year+2}&mileage=${Math.max(1, km - 30000)}-${km + 30000}&gearbox=${mapGearbox(gearbox)}&fuel=${mapFuelType(fuel)}&u_car_brand=${brand}&u_car_model=${uCarModel}&doors=${doorsParam}&sort=price&order=asc`;

          // Ajout bouton avec build direct + logs
          const lbcButton = document.createElement("button");
          lbcButton.innerText = "Voir sur Leboncoin";
          lbcButton.style = "margin-top:5px; padding:5px 10px; background:#007bff; color:white; border:none; cursor:pointer;";
          lbcButton.onclick = () => {
            console.log(`[🖱️ Bouton cliqué pour ${stockId}] Build LBC URL direct...`);
            console.log(`[📊 LBC URL générée] : ${lbcUrl}`);
            const popup = window.open(lbcUrl, 'lbcPopup', 'width=800,height=600,resizable=yes,scrollbars=yes');
            if (popup) {
              console.log(`[➡️ Popup ouverte] LBC pour ${stockId}`);
            } else {
              console.warn(`[⚠️ Popup bloquée] Active popups pour Auto1 ou utilise new tab.`);
              window.open(lbcUrl, '_blank'); // Fallback new tab
            }
          };

          pluginPriceDiv.innerText = `💰 PRIX PLUGIN : ${euros}`;
          pluginPriceDiv.appendChild(estimateDiv);
          pluginPriceDiv.appendChild(realPriceDiv);
          pluginPriceDiv.appendChild(lbcButton); // Ajoute bouton

          const insertAfter = card.querySelector(".big-car-card__title");
          if (insertAfter && insertAfter.parentNode) {
            insertAfter.parentNode.insertBefore(pluginPriceDiv, insertAfter.nextSibling);
            console.log(`[✅ VEHICULE ${i}] Prix injecté pour ${stockId} → ${euros}`);
          } else {
            console.log(`[❓ VEHICULE ${i}] Élément d’injection introuvable pour ${stockId}`);
          }

          console.log(`[📈 VEHICULE ${i}] Estimation LeBonCoin : ${data.estimatedPrice} €`);
        })
        .catch(err => {
          console.warn(`[⚠️ VEHICULE ${i}] Échec estimation LeBonCoin`, err);
        });
    }, i * 5000); // Évite surcharge
  });
}