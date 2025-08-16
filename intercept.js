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
      const fuel = (car.fuelType || "").toLowerCase();      // ex: "petrol"
      const gearbox = (car.gearType || "").toLowerCase();   // ex: "automatic"
      const carModel = (car.mainType || "").trim();         // ex: "Astra"

       fetch(`http://localhost:3001/api/estimation?model=${encodeURIComponent(searchModel)}&year=${year}&km=${km}&brand=${brand}&fuel=${fuel}&gearbox=${gearbox}&carModel=${encodeURIComponent(carModel)}`)
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

          pluginPriceDiv.innerText = `💰 PRIX PLUGIN : ${euros}`;
          pluginPriceDiv.appendChild(estimateDiv);
          pluginPriceDiv.appendChild(realPriceDiv);

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