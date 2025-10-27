// Extension popup logic
document.addEventListener('DOMContentLoaded', function() {
    // Initialize tabs
    initTabs();

    // Load initial data
    loadSettings();
    checkServerStatus();
    loadCacheStats();
    loadVehicleList();

    // Event listeners - Settings
    document.getElementById('saveSettings').addEventListener('click', saveSettings);
    document.getElementById('resetSettings').addEventListener('click', resetSettings);
    document.getElementById('clearCache').addEventListener('click', clearCache);
    document.getElementById('forceRefresh').addEventListener('click', forceRefresh);
    document.getElementById('testConnection').addEventListener('click', checkServerStatus);

    // Auto-save on change
    document.getElementById('timeoutSelect').addEventListener('change', saveSettings);
    document.getElementById('cacheSelect').addEventListener('change', saveSettings);

    // Event listeners - Vehicle List
    document.getElementById('generateEmail').addEventListener('click', generateEmail);
    document.getElementById('clearList').addEventListener('click', clearVehicleList);
});

// Tab management
function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.getAttribute('data-tab');

            // Remove active class from all buttons and contents
            document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

            // Add active class to clicked button and corresponding content
            button.classList.add('active');
            document.getElementById(tabName + 'Tab').classList.add('active');

            // Reload list when switching to list tab
            if (tabName === 'list') {
                loadVehicleList();
            }
        });
    });
}

// Default settings
const DEFAULT_SETTINGS = {
    requestTimeout: 5000,  // 5 seconds between requests
    cacheTimeout: 86400000, // 24 hours cache
    serverUrl: 'http://localhost:9001'
};

async function loadSettings() {
    try {
        const result = await chrome.storage.local.get(['carFinderSettings']);
        const settings = result.carFinderSettings || DEFAULT_SETTINGS;
        
        document.getElementById('timeoutSelect').value = settings.requestTimeout;
        document.getElementById('cacheSelect').value = settings.cacheTimeout;
        
        console.log('Settings loaded:', settings);
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

async function saveSettings() {
    try {
        const settings = {
            requestTimeout: parseInt(document.getElementById('timeoutSelect').value),
            cacheTimeout: parseInt(document.getElementById('cacheSelect').value),
            serverUrl: DEFAULT_SETTINGS.serverUrl,
            lastUpdated: Date.now()
        };
        
        await chrome.storage.local.set({ carFinderSettings: settings });
        
        // Notify content script of settings change
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab && tab.url.includes('auto1.com')) {
                await chrome.tabs.sendMessage(tab.id, { 
                    type: 'SETTINGS_UPDATED', 
                    settings: settings 
                });
            }
        } catch (e) {
            // Tab might not have content script injected yet
            console.log('Could not notify content script:', e.message);
        }
        
        // Visual feedback
        const btn = document.getElementById('saveSettings');
        const originalText = btn.textContent;
        btn.textContent = '✅ Sauvegardé!';
        btn.style.background = '#4CAF50';
        
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.background = '';
        }, 1500);
        
        console.log('Settings saved:', settings);
    } catch (error) {
        console.error('Error saving settings:', error);
    }
}

async function resetSettings() {
    try {
        await chrome.storage.local.set({ carFinderSettings: DEFAULT_SETTINGS });
        loadSettings();
        
        const btn = document.getElementById('resetSettings');
        const originalText = btn.textContent;
        btn.textContent = '🔄 Reset OK';
        
        setTimeout(() => {
            btn.textContent = originalText;
        }, 1500);
    } catch (error) {
        console.error('Error resetting settings:', error);
    }
}

async function clearCache() {
    try {
        await chrome.storage.local.remove(['carFinderCache', 'carFinderStats']);
        loadCacheStats();
        
        // Notify content script to clear its cache too
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab && tab.url.includes('auto1.com')) {
                await chrome.tabs.sendMessage(tab.id, { type: 'CLEAR_CACHE' });
            }
        } catch (e) {
            console.log('Could not notify content script to clear cache:', e.message);
        }
        
        const btn = document.getElementById('clearCache');
        const originalText = btn.textContent;
        btn.textContent = '🗑️ Cache vidé!';
        btn.style.background = '#28a745';
        
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.background = '';
        }, 2000);
        
        console.log('Cache cleared');
    } catch (error) {
        console.error('Error clearing cache:', error);
    }
}

async function forceRefresh() {
    try {
        // Set a temporary flag to bypass cache on next page load
        await chrome.storage.local.set({ 
            carFinderForceRefresh: { 
                enabled: true, 
                timestamp: Date.now() 
            } 
        });
        
        // Notify content script
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab && tab.url.includes('auto1.com')) {
                await chrome.tabs.sendMessage(tab.id, { type: 'FORCE_REFRESH' });
            }
        } catch (e) {
            console.log('Could not notify content script for force refresh:', e.message);
        }
        
        const btn = document.getElementById('forceRefresh');
        const originalText = btn.textContent;
        btn.textContent = '🔄 Mode refresh activé!';
        btn.style.background = '#ffc107';
        btn.style.color = '#000';
        
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.background = '';
            btn.style.color = '';
        }, 3000);
        
        console.log('Force refresh mode enabled for next page load');
    } catch (error) {
        console.error('Error enabling force refresh:', error);
    }
}

async function checkServerStatus() {
    const statusEl = document.getElementById('serverStatus');
    const testBtn = document.getElementById('testConnection');
    
    statusEl.textContent = '🔄 Test en cours...';
    statusEl.className = 'status';
    
    if (testBtn) {
        testBtn.textContent = '🔄 Test...';
    }
    
    try {
        const response = await fetch('http://localhost:9001/api/health', {
            method: 'GET',
            timeout: 5000
        });
        
        if (response.ok) {
            const data = await response.json();
            statusEl.textContent = `✅ Serveur connecté ${data.aiEnabled ? '🤖' : '🔧'}`;
            statusEl.className = 'status connected';
        } else {
            throw new Error('Server error');
        }
    } catch (error) {
        statusEl.textContent = '❌ Serveur déconnecté - Démarrer le serveur';
        statusEl.className = 'status disconnected';
    }
    
    if (testBtn) {
        setTimeout(() => {
            testBtn.textContent = '🔍 Test serveur';
        }, 1500);
    }
}

async function loadCacheStats() {
    try {
        const result = await chrome.storage.local.get(['carFinderCache', 'carFinderStats']);
        const cache = result.carFinderCache || {};
        const stats = result.carFinderStats || { hits: 0, requests: 0 };

        const cacheCount = Object.keys(cache).length;
        const hitRate = stats.requests > 0 ? Math.round((stats.hits / stats.requests) * 100) : 0;
        const savedRequests = stats.hits;

        document.getElementById('cacheCount').textContent = cacheCount;
        document.getElementById('hitRate').textContent = `${hitRate}%`;
        document.getElementById('savedRequests').textContent = `${savedRequests} req`;

        // Clean expired cache entries
        const now = Date.now();
        const settings = result.carFinderSettings || DEFAULT_SETTINGS;
        let cleaned = 0;

        for (const [key, entry] of Object.entries(cache)) {
            if (now - entry.timestamp > settings.cacheTimeout) {
                delete cache[key];
                cleaned++;
            }
        }

        if (cleaned > 0) {
            await chrome.storage.local.set({ carFinderCache: cache });
            console.log(`Cleaned ${cleaned} expired cache entries`);
        }

    } catch (error) {
        console.error('Error loading cache stats:', error);
    }
}

// ===== VEHICLE LIST MANAGEMENT =====

async function loadVehicleList() {
    try {
        const result = await chrome.storage.local.get(['carFinderSelectedList']);
        const vehicles = result.carFinderSelectedList || [];

        // Update count in tab button
        document.getElementById('listCount').textContent = vehicles.length;

        const listContainer = document.getElementById('vehicleList');

        if (vehicles.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-list">
                    <div class="empty-list-icon">📭</div>
                    <p style="font-size: 14px; font-weight: 600; margin-bottom: 8px;">Liste vide</p>
                    <p style="font-size: 12px;">Ajoutez des véhicules depuis Auto1 avec le bouton "➕"</p>
                </div>
            `;
            return;
        }

        // Render vehicle list
        listContainer.innerHTML = vehicles.map(vehicle => `
            <div class="vehicle-item" data-stock="${vehicle.stockNumber}">
                <button class="vehicle-remove" data-stock="${vehicle.stockNumber}">×</button>
                <div class="vehicle-header">
                    🚗 ${vehicle.brand} ${vehicle.model}
                </div>
                <div class="vehicle-details">
                    📅 ${vehicle.year || 'N/A'} • 🛣️ ${vehicle.km?.toLocaleString() || 'N/A'} km • ⚡ ${vehicle.power || 'N/A'} ch<br>
                    ⛽ ${mapFuelLabel(vehicle.fuel)} • ⚙️ ${mapGearboxLabel(vehicle.gearbox)}<br>
                    💰 Auto1: ${vehicle.auto1Price || 'N/A'}€ → 📈 Estimation: ${vehicle.estimatedPrice || 'N/A'}€
                    ${vehicle.detectedOptions && vehicle.detectedOptions.length > 0 ? `<br>✨ ${vehicle.detectedOptions.map(o => o.name).join(', ')}` : ''}
                </div>
                <span class="vehicle-margin ${parseInt(vehicle.margin) >= 0 ? 'positive' : 'negative'}">
                    ${parseInt(vehicle.margin) >= 0 ? '💰' : '⚠️'} Marge: ${parseInt(vehicle.margin) >= 0 ? '+' : ''}${vehicle.margin}€
                </span>
            </div>
        `).join('');

        // Add remove listeners
        document.querySelectorAll('.vehicle-remove').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const stockNumber = e.target.getAttribute('data-stock');
                await removeVehicle(stockNumber);
            });
        });

    } catch (error) {
        console.error('Error loading vehicle list:', error);
    }
}

function mapFuelLabel(fuel) {
    const map = { 'petrol': 'Essence', 'diesel': 'Diesel', 'electric': 'Électrique', 'hybrid': 'Hybride' };
    return map[fuel.toLowerCase()] || fuel;
}

function mapGearboxLabel(gearbox) {
    const map = { 'manual': 'Manuelle', 'automatic': 'Auto', 'duplex': 'Auto' };
    return map[gearbox.toLowerCase()] || gearbox;
}

async function removeVehicle(stockNumber) {
    try {
        const result = await chrome.storage.local.get(['carFinderSelectedList']);
        let vehicles = result.carFinderSelectedList || [];

        vehicles = vehicles.filter(v => v.stockNumber !== stockNumber);

        await chrome.storage.local.set({ carFinderSelectedList: vehicles });

        // Reload list
        await loadVehicleList();

        console.log(`Vehicle ${stockNumber} removed from list`);
    } catch (error) {
        console.error('Error removing vehicle:', error);
    }
}

async function clearVehicleList() {
    if (!confirm('Êtes-vous sûr de vouloir vider toute la liste ?')) {
        return;
    }

    try {
        await chrome.storage.local.remove(['carFinderSelectedList']);
        await loadVehicleList();

        console.log('Vehicle list cleared');
    } catch (error) {
        console.error('Error clearing list:', error);
    }
}

// ===== EMAIL GENERATOR =====

async function generateEmail() {
    try {
        const result = await chrome.storage.local.get(['carFinderSelectedList']);
        const vehicles = result.carFinderSelectedList || [];

        if (vehicles.length === 0) {
            alert('❌ Aucun véhicule dans la liste !');
            return;
        }

        // Generate formatted email text
        let emailContent = '';

        vehicles.forEach((vehicle, index) => {
            // Format vehicle entry like the example
            const vehicleEntry = formatVehicleForEmail(vehicle);
            emailContent += vehicleEntry;

            // Add spacing between vehicles
            if (index < vehicles.length - 1) {
                emailContent += '\n';
            }
        });

        // Create modal to display and copy email
        showEmailModal(emailContent, vehicles);

        console.log('[✉️ Email] Generated for', vehicles.length, 'vehicles');
    } catch (error) {
        console.error('Error generating email:', error);
        alert('❌ Erreur lors de la génération de l\'email');
    }
}

function formatVehicleForEmail(vehicle) {
    // Calculate your price with benefit (example: +1500€ margin)
    // Safely parse numeric values with fallbacks
    const estimatedPrice = parseInt(vehicle.estimatedPrice) || 0;
    const margin = parseInt(vehicle.margin) || 0;
    const auto1Price = parseInt(vehicle.auto1Price) || 0;

    // Calculate your selling price (Auto1 price + margin of 1500€)
    const yourPrice = auto1Price > 0 ? (auto1Price + 1500).toFixed(0) : estimatedPrice.toFixed(0);

    // Format gearbox
    const gearboxMap = {
        'automatic': 'Automatique',
        'manual': 'Manuelle',
        'duplex': 'Automatique S-Tronic'
    };
    const gearboxLabel = gearboxMap[vehicle.gearbox?.toLowerCase()] || vehicle.gearbox || 'N/A';

    // Format fuel with power
    const fuelMap = {
        'petrol': 'Essence',
        'diesel': 'Diesel',
        'electric': 'Électrique',
        'hybrid': 'Hybride'
    };
    const fuelLabel = fuelMap[vehicle.fuel?.toLowerCase()] || vehicle.fuel || 'N/A';

    // Format power (handle undefined/null)
    const powerText = vehicle.power ? `${vehicle.power} ch` : '';

    // Get top 4-5 most important options
    const importantOptions = [];

    // Add detected premium options first
    if (vehicle.detectedOptions && vehicle.detectedOptions.length > 0) {
        importantOptions.push(...vehicle.detectedOptions.map(o => o.name));
    }

    // Add other important equipment (filter common options)
    if (vehicle.equipment && vehicle.equipment.length > 0) {
        const premiumEquipment = vehicle.equipment.filter(eq => {
            const eq_lower = eq.toLowerCase();
            return (
                eq_lower.includes('navigation') ||
                eq_lower.includes('gps') ||
                eq_lower.includes('cuir') ||
                eq_lower.includes('leather') ||
                eq_lower.includes('caméra') ||
                eq_lower.includes('camera') ||
                eq_lower.includes('panoram') ||
                eq_lower.includes('chauffant') ||
                eq_lower.includes('heated') ||
                eq_lower.includes('led') ||
                eq_lower.includes('xenon') ||
                eq_lower.includes('parktronic') ||
                eq_lower.includes('parking') ||
                eq_lower.includes('keyless') ||
                eq_lower.includes('électrique') ||
                eq_lower.includes('electric')
            ) && !importantOptions.some(opt => opt.toLowerCase().includes(eq_lower));
        }).slice(0, 3);

        importantOptions.push(...premiumEquipment);
    }

    // Limit to top 5 options
    const optionsText = importantOptions.slice(0, 5).join(', ');

    // Add photo link if available
    const photoLine = vehicle.imgurAlbumUrl
        ? `📸 Photos: ${vehicle.imgurAlbumUrl}\n\n`
        : (vehicle.photos && vehicle.photos.length > 0
            ? `📸 ${vehicle.photos.length} photo(s) disponible(s)\n\n`
            : '');

    // Format email entry
    return `🔹 ${vehicle.brand} ${vehicle.model} – ${yourPrice} €
${photoLine}Année : ${vehicle.year} – ${vehicle.km?.toLocaleString() || 'N/A'} km

Boîte : ${gearboxLabel}

Carburant : ${fuelLabel}${powerText ? ' ' + powerText : ''}

Points forts : ${optionsText || 'Véhicule en excellent état'}
`;
}

function showEmailModal(emailContent, vehicles) {
    // Create modal overlay
    const modal = document.createElement('div');
    modal.style = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        padding: 20px;
    `;

    modal.innerHTML = `
        <div style="
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 12px;
            padding: 20px;
            max-width: 600px;
            width: 100%;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <h2 style="color: white; margin: 0; font-size: 18px;">✉️ Email généré (${vehicles.length} véhicules)</h2>
                <button id="closeModal" style="
                    background: rgba(255,255,255,0.2);
                    border: none;
                    color: white;
                    font-size: 24px;
                    cursor: pointer;
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    line-height: 1;
                ">×</button>
            </div>

            <textarea id="emailTextarea" readonly style="
                width: 100%;
                min-height: 400px;
                padding: 15px;
                border-radius: 8px;
                border: none;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                font-size: 13px;
                line-height: 1.6;
                resize: vertical;
                margin-bottom: 15px;
            ">${emailContent}</textarea>

            <div style="display: flex; gap: 10px;">
                <button id="copyEmail" style="
                    flex: 1;
                    padding: 12px 20px;
                    background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
                    color: white;
                    border: none;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    box-shadow: 0 4px 12px rgba(76, 175, 80, 0.4);
                ">📋 Copier Email</button>
            </div>

            <div style="margin-top: 12px; padding: 10px; background: rgba(255,255,255,0.1); border-radius: 6px; font-size: 11px; color: rgba(255,255,255,0.8); line-height: 1.4;">
                💡 <strong>Info :</strong> Les photos sont automatiquement uploadées sur Imgur lors de l'ajout à la liste. Les liens des albums sont inclus dans l'email ci-dessus.
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Event listeners
    document.getElementById('closeModal').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });

    document.getElementById('copyEmail').addEventListener('click', () => {
        const textarea = document.getElementById('emailTextarea');
        textarea.select();
        document.execCommand('copy');

        const btn = document.getElementById('copyEmail');
        const originalText = btn.textContent;
        btn.textContent = '✅ Copié !';
        setTimeout(() => btn.textContent = originalText, 2000);
    });

    // ✅ FIX: Removed event listener for deleted 'downloadPhotos' button
    // Photos are now auto-uploaded to Imgur when adding vehicle to list
}

async function downloadAllPhotos(vehicles) {
    // Group photos by vehicle
    const vehiclesWithPhotos = vehicles.filter(v => v.photos && v.photos.length > 0);

    if (vehiclesWithPhotos.length === 0) {
        alert('❌ Aucune photo disponible dans la liste');
        return;
    }

    const btn = document.getElementById('downloadPhotos');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Upload en cours...';

    try {
        const emailTextarea = document.getElementById('emailTextarea');
        let currentEmail = emailTextarea.value;
        let photoLinks = '\n\n📸 PHOTOS PAR VÉHICULE:\n';
        let totalPhotosUploaded = 0;

        // Upload photos for each vehicle separately
        for (let i = 0; i < vehiclesWithPhotos.length; i++) {
            const vehicle = vehiclesWithPhotos[i];
            btn.textContent = `⏳ Upload ${i + 1}/${vehiclesWithPhotos.length}...`;

            try {
                const response = await fetch('http://localhost:9001/api/upload-images', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        imageUrls: vehicle.photos,
                        title: `${vehicle.brand} ${vehicle.model} - ${vehicle.year}`
                    })
                });

                if (!response.ok) {
                    throw new Error('Imgur upload failed');
                }

                const data = await response.json();

                if (data.ok && data.albumUrl) {
                    photoLinks += `\n🚗 ${vehicle.brand} ${vehicle.model} (${vehicle.photos.length} photos):\n${data.albumUrl}\n`;
                    totalPhotosUploaded += data.totalImages;
                } else {
                    photoLinks += `\n⚠️ ${vehicle.brand} ${vehicle.model}: Erreur upload\n`;
                }
            } catch (error) {
                console.error(`[📸 Upload] Error for ${vehicle.brand} ${vehicle.model}:`, error);
                photoLinks += `\n⚠️ ${vehicle.brand} ${vehicle.model}: Erreur upload\n`;
            }

            // Small delay between uploads to avoid rate limiting
            if (i < vehiclesWithPhotos.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }

        // Update email with all photo links
        emailTextarea.value = currentEmail + photoLinks;

        // Copy all links to clipboard
        await navigator.clipboard.writeText(photoLinks.trim());

        btn.textContent = '✅ Albums créés !';
        setTimeout(() => {
            btn.textContent = originalText;
            btn.disabled = false;
        }, 3000);

        alert(`✅ ${totalPhotosUploaded} photos uploadées sur Imgur !\n\n${vehiclesWithPhotos.length} albums créés (un par véhicule).\n\nLes liens ont été ajoutés à l'email et copiés dans le presse-papier.`);

    } catch (error) {
        console.error('[📸 Upload] Error:', error);
        btn.textContent = '❌ Erreur upload';
        setTimeout(() => {
            btn.textContent = originalText;
            btn.disabled = false;
        }, 3000);

        // Fallback: copy all photo URLs
        const allPhotoUrls = vehiclesWithPhotos.flatMap(v => v.photos);
        const photosList = allPhotoUrls.map((url, i) => `Photo ${i + 1}: ${url}`).join('\n');
        await navigator.clipboard.writeText(photosList);
        alert(`❌ Erreur lors de l'upload Imgur.\n\n${allPhotoUrls.length} URLs de photos copiées dans le presse-papier comme alternative.`);
    } finally {
        btn.disabled = false;
    }
}
