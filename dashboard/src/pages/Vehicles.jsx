import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import posthog from 'posthog-js';
import { api } from '../api/client';
import VehicleCard from '../components/VehicleCard';

export default function Vehicles() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => api.getVehicles(),
  });

  const deleteMutation = useMutation({
    mutationFn: (stockNumber) => api.deleteVehicle(stockNumber),
    onSuccess: (_, stockNumber) => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      posthog.capture('vehicle_deleted', { stock_number: stockNumber });
    },
  });

  const vehicles = data?.vehicles || [];

  return (
    <div className="page">
      <h2>Vehicules sauvegardes ({vehicles.length})</h2>
      {isLoading ? (
        <div className="loading">Chargement...</div>
      ) : vehicles.length === 0 ? (
        <div className="empty-state">
          <p>Aucun vehicule sauvegarde.</p>
          <p>Utilisez l'extension Chrome sur Auto1 pour ajouter des vehicules.</p>
        </div>
      ) : (
        <div className="vehicles-grid">
          {vehicles.map((v) => (
            <VehicleCard
              key={v.stock_number}
              vehicle={v}
              onDelete={(sn) => deleteMutation.mutate(sn)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
