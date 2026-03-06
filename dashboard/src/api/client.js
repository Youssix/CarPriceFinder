const API_URL = import.meta.env.VITE_API_URL || '';

class ApiClient {
  constructor() {
    this.baseUrl = API_URL;
  }

  async request(endpoint, options = {}) {
    const apiKey = localStorage.getItem('apiKey');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey && { 'X-API-Key': apiKey }),
          ...options.headers,
        },
      });

      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem('apiKey');
        window.location.href = '/login';
        throw new Error('Non autorise');
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur serveur');
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }

  // Auth
  loginWithPassword(email, password) {
    // Fetch direct (sans header auth) pour éviter la redirection auto sur 401
    return fetch(`${this.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Email ou mot de passe incorrect');
      return data;
    });
  }

  checkSubscription() {
    return this.request('/api/check-subscription');
  }

  cancelSubscription() {
    return this.request('/api/cancel-subscription', { method: 'POST' });
  }

  // Vehicles
  getVehicles() {
    return this.request('/api/vehicles');
  }

  saveVehicle(vehicle) {
    return this.request('/api/vehicles', {
      method: 'POST',
      body: JSON.stringify(vehicle),
    });
  }

  deleteVehicle(stockNumber) {
    return this.request(`/api/vehicles/${stockNumber}`, { method: 'DELETE' });
  }

  // Alerts
  getAlerts() {
    return this.request('/api/alerts');
  }

  createAlert(alert) {
    return this.request('/api/alerts', {
      method: 'POST',
      body: JSON.stringify(alert),
    });
  }

  updateAlert(id, updates) {
    return this.request(`/api/alerts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  deleteAlert(id) {
    return this.request(`/api/alerts/${id}`, { method: 'DELETE' });
  }

  // Dashboard
  getStats() {
    return this.request('/api/dashboard/stats');
  }

  getHistory(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/api/observations${qs ? '?' + qs : ''}`);
  }

  // Deals
  getTopDeals(limit = 10) {
    return this.request(`/api/deals/top?limit=${limit}`);
  }

  // Alert matches
  getAlertMatches() {
    return this.request('/api/alert-matches');
  }

  markMatchesSeen(matchIds) {
    return this.request('/api/alert-matches/seen', {
      method: 'POST',
      body: JSON.stringify({ matchIds }),
    });
  }

  // Health
  getHealth() {
    return this.request('/api/health');
  }
}

export const api = new ApiClient();
