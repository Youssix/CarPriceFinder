const API_URL = import.meta.env.VITE_API_URL || '';

class ApiClient {
  constructor() {
    this.baseUrl = API_URL;
  }

  async request(endpoint, options = {}) {
    const apiKey = localStorage.getItem('apiKey');
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey && { 'X-API-Key': apiKey }),
        ...options.headers,
      },
      credentials: 'include',
    });

    if (res.status === 401 || res.status === 403) {
      localStorage.removeItem('apiKey');
      window.location.href = '/login';
      throw new Error('Non autorise');
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur serveur');
    return data;
  }

  // Auth
  requestCode(email) {
    return this.request('/api/auth/request-code', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  verifyCode(email, code) {
    return this.request('/api/auth/verify-code', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    });
  }

  checkSubscription() {
    return this.request('/api/check-subscription');
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
