// Extension popup logic — matches new popup.html structure
document.addEventListener('DOMContentLoaded', async function() {
    // Auth gate: check if API key exists before showing main UI
    await checkAuthState();

    // Initialize tabs & settings panel
    initTabs();
    initSettingsPanel();

    // Load initial data
    loadSettings();
    checkServerStatus();
    loadVehicleList();

    // Event listeners - Settings (auto-save on change)
    document.getElementById('timeoutSelect').addEventListener('change', saveSettings);
    document.getElementById('debugModeSelect').addEventListener('change', saveSettings);
    document.getElementById('testConnection').addEventListener('click', checkServerStatus);

    // Event listeners - Account
    document.getElementById('disconnectBtn').addEventListener('click', handleDisconnect);
    document.getElementById('disconnectBtnHeader').addEventListener('click', handleDisconnect);

    // Event listeners - Vehicle List
    document.getElementById('generateEmail').addEventListener('click', generateEmail);
    document.getElementById('clearList').addEventListener('click', clearVehicleList);

    // Event listeners - Auth screen
    document.getElementById('loginBtn').addEventListener('click', handlePasswordLogin);
    document.getElementById('passwordInput').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') handlePasswordLogin();
    });
    document.getElementById('emailInput').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') document.getElementById('passwordInput').focus();
    });
    document.getElementById('forgotPasswordLink').addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://carlytics.fr/reset-password' });
    });
});

// Default settings
const DEFAULT_SETTINGS = {
    requestTimeout: 5000,
    debugMode: false,
    serverUrl: 'https://api.carlytics.fr',
    apiKey: ''
};

// ===== AUTH GATE =====

// Serveurs à essayer dans l'ordre
const AUTH_SERVERS = ['http://localhost:9001', 'https://api.carlytics.fr'];

// Trouver un serveur disponible et appeler l'endpoint donné
async function callAuthServer(path, method = 'GET', body = null) {
    for (const server of AUTH_SERVERS) {
        try {
            const opts = {
                method,
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(4000)
            };
            if (body) opts.body = JSON.stringify(body);

            const response = await fetch(`${server}${path}`, opts);
            const data = await response.json().catch(() => ({}));
            return { ok: response.ok, status: response.status, data, server };
        } catch (e) {
            console.log(`[Auth] ${server} not reachable, trying next...`);
        }
    }
    return null; // Aucun serveur disponible
}

async function saveAuthToStorage(apiKey, email, serverUrl) {
    const result = await chrome.storage.local.get(['carFinderSettings']);
    const settings = result.carFinderSettings || DEFAULT_SETTINGS;
    const updatedSettings = {
        ...DEFAULT_SETTINGS,
        ...settings,
        apiKey,
        email: email || '',
        debugMode: serverUrl.includes('localhost'),
        serverUrl,
        lastUpdated: Date.now()
    };
    await chrome.storage.local.set({ carFinderSettings: updatedSettings });

    // Notifier intercept.js sur l'onglet Auto1 actif pour qu'il recharge le apiKey
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url && tab.url.includes('auto1.com')) {
            await chrome.tabs.sendMessage(tab.id, {
                type: 'SETTINGS_UPDATED',
                settings: updatedSettings
            });
        }
    } catch (e) {
        // Tab might not have content script (normal if Auto1 not open)
    }
}

async function checkAuthState() {
    try {
        const result = await chrome.storage.local.get(['carFinderSettings']);
        const settings = result.carFinderSettings || {};
        if (settings.apiKey && settings.apiKey.trim().length > 0) {
            showMainUI();
            loadAccountInfo();
        } else {
            showAuthScreen();
        }
    } catch (error) {
        console.error('Error checking auth state:', error);
        showAuthScreen();
    }
}

function showAuthScreen() {
    document.getElementById('authScreen').classList.remove('hidden');
    document.querySelector('.header').style.display = 'none';
    document.getElementById('mainTabs').style.display = 'none';
    document.getElementById('listTab').style.display = 'none';
    document.getElementById('accountTab').style.display = 'none';
    document.getElementById('settingsPanel').classList.remove('active');
    document.getElementById('authError').textContent = '';
}

function showMainUI() {
    document.getElementById('authScreen').classList.add('hidden');
    document.querySelector('.header').style.display = 'flex';
    document.getElementById('mainTabs').style.display = 'flex';
    document.querySelectorAll('.tab-content').forEach(content => {
        content.style.display = content.classList.contains('active') ? 'block' : 'none';
    });
}

// Login email + mot de passe
async function handlePasswordLogin() {
    const email = document.getElementById('emailInput').value.trim();
    const password = document.getElementById('passwordInput').value;
    const errorEl = document.getElementById('authError');
    const btn = document.getElementById('loginBtn');

    errorEl.textContent = '';

    if (!email || !email.includes('@')) {
        errorEl.textContent = 'Entrez une adresse email valide';
        return;
    }
    if (!password) {
        errorEl.textContent = 'Entrez votre mot de passe';
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Connexion…';

    try {
        const result = await callAuthServer('/api/auth/login', 'POST', { email, password });

        if (!result) {
            errorEl.textContent = 'Serveur inaccessible. Vérifiez votre connexion.';
            return;
        }

        if (result.status === 404 || result.status === 401) {
            errorEl.textContent = result.data?.error || 'Email ou mot de passe incorrect';
            return;
        }

        if (result.status === 403) {
            errorEl.textContent = result.data?.error || 'Abonnement inactif';
            return;
        }

        if (!result.ok) {
            errorEl.textContent = result.data?.error || 'Erreur de connexion';
            return;
        }

        // Succès — sauvegarder et afficher le main UI
        await saveAuthToStorage(result.data.apiKey, result.data.email, result.server);
        showMainUI();
        loadAccountInfo();
        await loadSettings();
        await checkServerStatus();
        await loadVehicleList();

    } catch (err) {
        console.error('[Auth] Login error:', err.message);
        errorEl.textContent = 'Erreur inattendue. Réessayez.';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Se connecter';
    }
}


async function handleDisconnect() {
    try {
        const result = await chrome.storage.local.get(['carFinderSettings']);
        const settings = result.carFinderSettings || DEFAULT_SETTINGS;
        settings.apiKey = '';
        settings.email = '';
        settings.lastUpdated = Date.now();
        await chrome.storage.local.set({ carFinderSettings: settings });
        showAuthScreen();
        console.log('[Auth] User disconnected');
    } catch (error) {
        console.error('Error during disconnect:', error);
    }
}

// ===== ACCOUNT INFO =====

async function loadAccountInfo() {
    try {
        const result = await chrome.storage.local.get(['carFinderSettings']);
        const settings = result.carFinderSettings || {};

        // Display email
        const emailEl = document.getElementById('accountEmail');
        emailEl.textContent = settings.email || '—';

        // Fetch live subscription status
        if (settings.apiKey && settings.serverUrl) {
            try {
                const response = await fetch(`${settings.serverUrl}/api/check-subscription`, {
                    headers: { 'X-API-Key': settings.apiKey },
                    signal: AbortSignal.timeout(3000)
                });
                const data = await response.json();
                const badge = document.getElementById('accountBadge');

                if (data.active) {
                    badge.textContent = 'Actif';
                    badge.className = 'account-badge active';
                    if (data.email) {
                        emailEl.textContent = data.email;
                        // Update stored email
                        settings.email = data.email;
                        await chrome.storage.local.set({ carFinderSettings: settings });
                    }
                } else {
                    badge.textContent = 'Inactif';
                    badge.className = 'account-badge inactive';
                }
            } catch (e) {
                // Silently fail — badge stays as default
            }
        }
    } catch (error) {
        console.error('Error loading account info:', error);
    }
}

// ===== TABS =====

function initTabs() {
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.getAttribute('data-tab');

            // Remove active from all buttons and contents
            document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
                content.style.display = 'none';
            });

            // Activate selected
            button.classList.add('active');
            const targetTab = document.getElementById(tabName + 'Tab');
            if (targetTab) {
                targetTab.classList.add('active');
                targetTab.style.display = 'block';
            }

            // Close settings panel when switching tabs
            document.getElementById('settingsPanel').classList.remove('active');

            // Reload data for the active tab
            if (tabName === 'list') loadVehicleList();
            if (tabName === 'account') loadAccountInfo();
        });
    });
}

// ===== SETTINGS PANEL (overlay) =====

function initSettingsPanel() {
    document.getElementById('openSettings').addEventListener('click', () => {
        const panel = document.getElementById('settingsPanel');
        panel.classList.toggle('active');

        // Hide tabs + tab content when settings is open
        if (panel.classList.contains('active')) {
            document.getElementById('mainTabs').style.display = 'none';
            document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
        } else {
            document.getElementById('mainTabs').style.display = 'flex';
            // Restore active tab
            document.querySelectorAll('.tab-content').forEach(c => {
                c.style.display = c.classList.contains('active') ? 'block' : 'none';
            });
        }
    });

    document.getElementById('closeSettings').addEventListener('click', () => {
        document.getElementById('settingsPanel').classList.remove('active');
        document.getElementById('mainTabs').style.display = 'flex';
        document.querySelectorAll('.tab-content').forEach(c => {
            c.style.display = c.classList.contains('active') ? 'block' : 'none';
        });
    });
}

// ===== SETTINGS =====

async function loadSettings() {
    try {
        const result = await chrome.storage.local.get(['carFinderSettings']);
        const settings = result.carFinderSettings || DEFAULT_SETTINGS;

        document.getElementById('timeoutSelect').value = settings.requestTimeout || DEFAULT_SETTINGS.requestTimeout;
        document.getElementById('debugModeSelect').value = settings.debugMode ? 'true' : 'false';

        console.log('[Settings] Loaded:', settings);
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

async function saveSettings() {
    try {
        const debugMode = document.getElementById('debugModeSelect').value === 'true';
        const serverUrl = debugMode ? 'http://localhost:9001' : 'https://api.carlytics.fr';

        const result = await chrome.storage.local.get(['carFinderSettings']);
        const currentSettings = result.carFinderSettings || DEFAULT_SETTINGS;

        const settings = {
            ...currentSettings,
            requestTimeout: parseInt(document.getElementById('timeoutSelect').value),
            debugMode: debugMode,
            serverUrl: serverUrl,
            lastUpdated: Date.now()
        };

        await chrome.storage.local.set({ carFinderSettings: settings });

        // Reload Auto1 page if server changed
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab && tab.url && tab.url.includes('auto1.com')) {
                if (currentSettings.serverUrl !== serverUrl) {
                    await chrome.tabs.reload(tab.id);
                } else {
                    await chrome.tabs.sendMessage(tab.id, {
                        type: 'SETTINGS_UPDATED',
                        settings: settings
                    });
                }
            }
        } catch (e) {
            // Tab might not have content script
        }

        // Re-check server status after settings change
        checkServerStatus();

        console.log('[Settings] Saved:', settings);
    } catch (error) {
        console.error('Error saving settings:', error);
    }
}

// ===== SERVER STATUS =====

async function checkServerStatus() {
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('serverStatus');
    const testBtn = document.getElementById('testConnection');

    if (statusText) statusText.textContent = 'Test en cours...';
    if (testBtn) testBtn.textContent = 'Test...';

    try {
        const result = await chrome.storage.local.get(['carFinderSettings']);
        const settings = result.carFinderSettings || DEFAULT_SETTINGS;
        const serverUrl = settings.serverUrl || DEFAULT_SETTINGS.serverUrl;

        const response = await fetch(`${serverUrl}/api/health`, {
            signal: AbortSignal.timeout(5000)
        });

        if (response.ok) {
            const data = await response.json();
            statusDot.classList.add('connected');
            const modeLabel = settings.debugMode ? 'Local' : 'Prod';
            if (statusText) statusText.textContent = `${modeLabel} connecte ${data.aiEnabled ? '+ IA' : ''}`;
        } else {
            throw new Error('Server error');
        }
    } catch (error) {
        statusDot.classList.remove('connected');
        if (statusText) statusText.textContent = 'Serveur deconnecte';
    }

    if (testBtn) {
        setTimeout(() => { testBtn.textContent = 'Tester la connexion'; }, 1500);
    }
}

// ===== VEHICLE LIST =====

async function loadVehicleList() {
    try {
        const result = await chrome.storage.local.get(['carFinderSelectedList']);
        const vehicles = result.carFinderSelectedList || [];

        document.getElementById('listCount').textContent = vehicles.length;
        const listContainer = document.getElementById('vehicleList');

        if (vehicles.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-list">
                    <div class="empty-list-icon">🚗</div>
                    <p style="font-size: 14px; font-weight: 600; margin-bottom: 8px;">Liste vide</p>
                    <p style="font-size: 12px;">Ajoutez des vehicules depuis Auto1 avec le bouton "+"</p>
                </div>
            `;
            return;
        }

        listContainer.innerHTML = vehicles.map(vehicle => {
            const margin = parseInt(vehicle.margin) || 0;
            const isPositive = margin >= 0;
            const auto1Price = parseInt(vehicle.auto1Price) || 0;
            const estimatedPrice = parseInt(vehicle.estimatedPrice) || 0;

            return `
                <div class="vehicle-item" data-stock="${vehicle.stockNumber}">
                    <div class="vehicle-top">
                        <div>
                            <div class="vehicle-name">${vehicle.brand} ${vehicle.model}</div>
                            <div class="vehicle-specs">
                                ${vehicle.year || '—'} · ${vehicle.km ? vehicle.km.toLocaleString() + ' km' : '—'} · ${mapFuelLabel(vehicle.fuel)} · ${mapGearboxLabel(vehicle.gearbox)}
                            </div>
                        </div>
                        <button class="vehicle-remove" data-stock="${vehicle.stockNumber}">&times;</button>
                    </div>
                    <div class="vehicle-prices">
                        <div><span class="label">Auto1</span> <span class="value">${auto1Price ? auto1Price.toLocaleString() + ' €' : '—'}</span></div>
                        <div><span class="label">Marche</span> <span class="value">${estimatedPrice ? estimatedPrice.toLocaleString() + ' €' : '—'}</span></div>
                    </div>
                    <span class="vehicle-margin ${isPositive ? 'positive' : 'negative'}">
                        ${isPositive ? '+' : ''}${margin.toLocaleString()} €
                    </span>
                </div>
            `;
        }).join('');

        // Add remove listeners
        document.querySelectorAll('.vehicle-remove').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const stockNumber = e.target.closest('[data-stock]').getAttribute('data-stock');
                await removeVehicle(stockNumber);
            });
        });
    } catch (error) {
        console.error('Error loading vehicle list:', error);
    }
}

function mapFuelLabel(fuel) {
    if (!fuel) return '—';
    const map = { 'petrol': 'Essence', 'diesel': 'Diesel', 'electric': 'Electrique', 'hybrid': 'Hybride' };
    return map[fuel.toLowerCase()] || fuel;
}

function mapGearboxLabel(gearbox) {
    if (!gearbox) return '—';
    const map = { 'manual': 'Manuelle', 'automatic': 'Auto', 'duplex': 'Auto' };
    return map[gearbox.toLowerCase()] || gearbox;
}

async function removeVehicle(stockNumber) {
    try {
        const result = await chrome.storage.local.get(['carFinderSettings', 'carFinderSelectedList']);
        const settings = result.carFinderSettings || {};
        const apiKey = settings.apiKey;
        const serverUrl = settings.serverUrl || 'https://api.carlytics.fr';

        // 1. Supprimer du backend (le serveur a la route DELETE /api/vehicles/:stockNumber)
        if (apiKey) {
            try {
                await fetch(`${serverUrl}/api/vehicles/${encodeURIComponent(stockNumber)}`, {
                    method: 'DELETE',
                    headers: { 'X-API-Key': apiKey },
                    signal: AbortSignal.timeout(4000)
                });
            } catch (e) {
                console.warn('[Vehicle] Backend delete failed:', e.message);
                // On continue quand même avec la suppression locale
            }
        }

        // 2. Supprimer du storage local
        let vehicles = result.carFinderSelectedList || [];
        vehicles = vehicles.filter(v => v.stockNumber !== stockNumber);
        await chrome.storage.local.set({ carFinderSelectedList: vehicles });

        // 3. Notifier intercept.js (page context) via content-bridge pour réinitialiser le bouton
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab && tab.url && tab.url.includes('auto1.com')) {
                chrome.tabs.sendMessage(tab.id, { type: 'VEHICLE_REMOVED', stockNumber }).catch(() => {});
            }
        } catch (e) { /* Tab might not have content script */ }

        await loadVehicleList();
    } catch (error) {
        console.error('Error removing vehicle:', error);
    }
}

async function clearVehicleList() {
    if (!confirm('Vider toute la liste ?')) return;
    try {
        await chrome.storage.local.remove(['carFinderSelectedList']);
        await loadVehicleList();
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
            alert('Aucun vehicule dans la liste');
            return;
        }

        let emailContent = '';
        vehicles.forEach((vehicle, index) => {
            emailContent += formatVehicleForEmail(vehicle);
            if (index < vehicles.length - 1) emailContent += '\n';
        });

        showEmailModal(emailContent, vehicles);
    } catch (error) {
        console.error('Error generating email:', error);
    }
}

function formatVehicleForEmail(vehicle) {
    const auto1Price = parseInt(vehicle.auto1Price) || 0;
    const estimatedPrice = parseInt(vehicle.estimatedPrice) || 0;
    const yourPrice = auto1Price > 0 ? (auto1Price + 1500).toFixed(0) : estimatedPrice.toFixed(0);

    const gearboxMap = { 'automatic': 'Automatique', 'manual': 'Manuelle', 'duplex': 'Automatique S-Tronic' };
    const gearboxLabel = gearboxMap[vehicle.gearbox?.toLowerCase()] || vehicle.gearbox || 'N/A';

    const fuelMap = { 'petrol': 'Essence', 'diesel': 'Diesel', 'electric': 'Electrique', 'hybrid': 'Hybride' };
    const fuelLabel = fuelMap[vehicle.fuel?.toLowerCase()] || vehicle.fuel || 'N/A';
    const powerText = vehicle.power ? `${vehicle.power} ch` : '';

    // Collect notable options
    const importantOptions = [];
    if (vehicle.detectedOptions && vehicle.detectedOptions.length > 0) {
        importantOptions.push(...vehicle.detectedOptions.map(o => o.name));
    }
    if (vehicle.equipment && vehicle.equipment.length > 0) {
        const premiumEquipment = vehicle.equipment.filter(eq => {
            const lower = eq.toLowerCase();
            return (
                lower.includes('navigation') || lower.includes('gps') ||
                lower.includes('cuir') || lower.includes('leather') ||
                lower.includes('camera') || lower.includes('panoram') ||
                lower.includes('chauffant') || lower.includes('heated') ||
                lower.includes('led') || lower.includes('xenon') ||
                lower.includes('parktronic') || lower.includes('parking') ||
                lower.includes('keyless')
            ) && !importantOptions.some(opt => opt.toLowerCase().includes(lower));
        }).slice(0, 3);
        importantOptions.push(...premiumEquipment);
    }
    const optionsText = importantOptions.slice(0, 5).join(', ');

    const photoLine = vehicle.imgurAlbumUrl
        ? `Photos: ${vehicle.imgurAlbumUrl}\n`
        : '';

    return `${vehicle.brand} ${vehicle.model} – ${yourPrice} €
${photoLine}Annee : ${vehicle.year} – ${vehicle.km?.toLocaleString() || 'N/A'} km
Boite : ${gearboxLabel}
Carburant : ${fuelLabel}${powerText ? ' ' + powerText : ''}
Points forts : ${optionsText || 'Vehicule en excellent etat'}
`;
}

function showEmailModal(emailContent, vehicles) {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.85); display: flex; align-items: center;
        justify-content: center; z-index: 10000; padding: 16px;
    `;

    modal.innerHTML = `
        <div style="
            background: #1a1a2e; border: 1px solid rgba(255,255,255,0.1);
            border-radius: 12px; padding: 20px; max-width: 600px; width: 100%;
            max-height: 85vh; overflow-y: auto;
        ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                <span style="color: white; font-size: 15px; font-weight: 600;">Email (${vehicles.length} vehicules)</span>
                <button id="closeModal" style="
                    background: rgba(255,255,255,0.1); border: none; color: white;
                    font-size: 20px; cursor: pointer; width: 28px; height: 28px;
                    border-radius: 50%; line-height: 1;
                ">&times;</button>
            </div>
            <textarea id="emailTextarea" readonly style="
                width: 100%; min-height: 350px; padding: 14px; border-radius: 8px;
                border: 1px solid rgba(255,255,255,0.1); font-family: -apple-system, sans-serif;
                font-size: 13px; line-height: 1.6; resize: vertical; margin-bottom: 12px;
                background: rgba(255,255,255,0.06); color: white;
            ">${emailContent}</textarea>
            <button id="copyEmail" style="
                width: 100%; padding: 11px; background: #3b82f6; color: white;
                border: none; border-radius: 8px; font-size: 14px; font-weight: 600;
                cursor: pointer;
            ">Copier</button>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('closeModal').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    document.getElementById('copyEmail').addEventListener('click', () => {
        const textarea = document.getElementById('emailTextarea');
        textarea.select();
        document.execCommand('copy');
        const btn = document.getElementById('copyEmail');
        btn.textContent = 'Copie !';
        setTimeout(() => { btn.textContent = 'Copier'; }, 2000);
    });
}
