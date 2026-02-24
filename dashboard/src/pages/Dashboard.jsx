import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import VehicleCard from '../components/VehicleCard';
import { formatPrice } from '../utils/format';
import { TrendingUp, Search, Bell, Car } from 'lucide-react';

export default function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: () => api.getStats(),
  });

  const { data: vehiclesData } = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => api.getVehicles(),
  });

  const vehicles = vehiclesData?.vehicles || [];
  const topDeals = vehicles
    .filter((v) => v.margin > 0)
    .sort((a, b) => b.margin - a.margin)
    .slice(0, 5);

  return (
    <div className="page dashboard-page">
      <h2>Dashboard</h2>

      <div className="stats-grid">
        <div className="stat-card">
          <Search size={24} aria-hidden="true" />
          <div className="stat-value">{stats?.totalSearches || 0}</div>
          <div className="stat-label">Recherches aujourd'hui</div>
        </div>
        <div className="stat-card">
          <Car size={24} aria-hidden="true" />
          <div className="stat-value">{vehicles.length}</div>
          <div className="stat-label">Vehicules sauves</div>
        </div>
        <div className="stat-card">
          <TrendingUp size={24} aria-hidden="true" />
          <div className="stat-value">
            {stats?.avgMargin ? formatPrice(stats.avgMargin) : '\u2014'}
          </div>
          <div className="stat-label">Marge moyenne</div>
        </div>
        <div className="stat-card">
          <Bell size={24} aria-hidden="true" />
          <div className="stat-value">{stats?.activeAlerts || 0}</div>
          <div className="stat-label">Alertes actives</div>
        </div>
      </div>

      <section className="section">
        <h3>Top deals du jour</h3>
        {topDeals.length === 0 ? (
          <p className="no-data">
            Aucun deal trouve. Naviguez sur Auto1 avec l'extension pour commencer.
          </p>
        ) : (
          <div className="vehicles-grid">
            {topDeals.map((v) => (
              <VehicleCard key={v.stock_number} vehicle={v} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
