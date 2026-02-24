import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { formatPrice, formatKm, formatDate, marginColor } from '../utils/format';

export default function History() {
  const { data, isLoading } = useQuery({
    queryKey: ['history'],
    queryFn: () => api.getHistory({ limit: 50 }),
  });

  const observations = data?.observations || [];

  return (
    <div className="page">
      <h2>Historique des recherches</h2>
      {isLoading ? (
        <div className="loading">Chargement...</div>
      ) : observations.length === 0 ? (
        <div className="empty-state">
          <p>Aucune recherche enregistree.</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Vehicule</th>
                <th scope="col">KM</th>
                <th scope="col">Prix Auto1</th>
                <th scope="col">Prix LBC</th>
                <th scope="col">Marge</th>
                <th scope="col">Annonces</th>
              </tr>
            </thead>
            <tbody>
              {observations.map((obs) => {
                const margin =
                  obs.lbc_median_price -
                  (obs.auto1_price_cents ? obs.auto1_price_cents / 100 : 0);
                return (
                  <tr key={obs.id}>
                    <td>{formatDate(obs.created_at)}</td>
                    <td>
                      <strong>
                        {obs.brand} {obs.model}
                      </strong>{' '}
                      ({obs.year})
                    </td>
                    <td>{formatKm(obs.km)}</td>
                    <td>
                      {obs.auto1_price_cents
                        ? formatPrice(obs.auto1_price_cents / 100)
                        : '\u2014'}
                    </td>
                    <td>{formatPrice(obs.lbc_median_price)}</td>
                    <td style={{ color: marginColor(margin) }}>
                      {margin
                        ? `${margin >= 0 ? '+' : ''}${formatPrice(margin)}`
                        : '\u2014'}
                    </td>
                    <td>{obs.lbc_count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
