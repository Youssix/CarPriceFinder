import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import AlertForm from '../components/AlertForm';
import { Plus, Trash2, Pause, Play } from 'lucide-react';

export default function Alerts() {
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['alerts'],
    queryFn: () => api.getAlerts(),
  });

  const createMutation = useMutation({
    mutationFn: (alert) => api.createAlert(alert),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      setShowForm(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.deleteAlert(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }) => api.updateAlert(id, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const alerts = data?.alerts || [];

  return (
    <div className="page">
      <div className="page-header">
        <h2>Alertes ({alerts.length})</h2>
        <button
          className="btn btn-primary"
          onClick={() => setShowForm(!showForm)}
          type="button"
        >
          <Plus size={18} aria-hidden="true" /> Nouvelle alerte
        </button>
      </div>

      {showForm && (
        <div className="form-card">
          <AlertForm
            onSubmit={(data) => createMutation.mutate(data)}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {isLoading ? (
        <div className="loading">Chargement...</div>
      ) : alerts.length === 0 ? (
        <div className="empty-state">
          <p>Aucune alerte configuree.</p>
          <p>Creez une alerte pour etre notifie des bons deals.</p>
        </div>
      ) : (
        <div className="alerts-list">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`alert-card ${!alert.is_active ? 'inactive' : ''}`}
            >
              <div className="alert-info">
                <h4>
                  {alert.name ||
                    `${alert.brand || 'Toutes marques'} ${alert.model || ''}`}
                </h4>
                <div className="alert-criteria">
                  {alert.brand && <span className="badge">{alert.brand}</span>}
                  {alert.fuel && <span className="badge">{alert.fuel}</span>}
                  {alert.km_max && (
                    <span className="badge">
                      &le; {alert.km_max / 1000}k km
                    </span>
                  )}
                  {alert.min_margin > 0 && (
                    <span className="badge">
                      Marge &ge; {alert.min_margin}&euro;
                    </span>
                  )}
                  {alert.year_min && (
                    <span className="badge">&ge; {alert.year_min}</span>
                  )}
                </div>
              </div>
              <div className="alert-actions">
                <button
                  className="btn-icon"
                  onClick={() =>
                    toggleMutation.mutate({
                      id: alert.id,
                      isActive: !alert.is_active,
                    })
                  }
                  title={alert.is_active ? 'Pause' : 'Activer'}
                  aria-label={
                    alert.is_active
                      ? `Mettre en pause ${alert.name || 'alerte'}`
                      : `Activer ${alert.name || 'alerte'}`
                  }
                  type="button"
                >
                  {alert.is_active ? (
                    <Pause size={16} aria-hidden="true" />
                  ) : (
                    <Play size={16} aria-hidden="true" />
                  )}
                </button>
                <button
                  className="btn-icon danger"
                  onClick={() => deleteMutation.mutate(alert.id)}
                  title="Supprimer"
                  aria-label={`Supprimer ${alert.name || 'alerte'}`}
                  type="button"
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
