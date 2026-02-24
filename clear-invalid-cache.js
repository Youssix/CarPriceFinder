// Script pour nettoyer le cache invalide (résultats N/A)
// À exécuter dans la console Chrome (F12) sur auto1.com

chrome.storage.local.get(['carFinderCache'], (result) => {
  const cache = result.carFinderCache || {};
  const cleanedCache = {};
  
  let removedCount = 0;
  let keptCount = 0;
  
  Object.entries(cache).forEach(([key, entry]) => {
    const hasValidPrice = entry.data?.analysisResult?.estimatedPrice &&
                         typeof entry.data.analysisResult.estimatedPrice === 'number' &&
                         entry.data.analysisResult.estimatedPrice > 0;
    
    if (hasValidPrice) {
      cleanedCache[key] = entry;
      keptCount++;
    } else {
      removedCount++;
    }
  });
  
  chrome.storage.local.set({ carFinderCache: cleanedCache }, () => {
    console.log(`✅ Cache nettoyé !`);
    console.log(`📦 Conservés: ${keptCount} véhicules avec prix valide`);
    console.log(`🗑️ Supprimés: ${removedCount} résultats N/A`);
    console.log(`Recharge la page pour appliquer les changements.`);
  });
});
