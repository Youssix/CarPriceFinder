import { formatPrice, formatKm, formatMargin, marginColor } from '../utils/format';
import { Trash2 } from 'lucide-react';

export default function VehicleCard({ vehicle, onDelete }) {
  const margin = vehicle.margin || (vehicle.estimated_price - vehicle.auto1_price);

  return (
    <article className="vehicle-card">
      <div className="vehicle-header">
        <h3>{vehicle.brand} {vehicle.model}</h3>
        <div className="vehicle-actions">
          {onDelete && (
            <button
              className="btn-icon"
              onClick={() => onDelete(vehicle.stock_number)}
              title="Supprimer"
              aria-label={`Supprimer ${vehicle.brand} ${vehicle.model}`}
              type="button"
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      <div className="vehicle-details">
        <span>{vehicle.year}</span>
        <span>{formatKm(vehicle.km)}</span>
        <span>{vehicle.fuel}</span>
        <span>{vehicle.gearbox}</span>
      </div>
      <div className="vehicle-prices">
        <div className="price-row">
          <span className="price-label">Auto1</span>
          <span className="price-value">{formatPrice(vehicle.auto1_price)}</span>
        </div>
        <div className="price-row">
          <span className="price-label">LBC estime</span>
          <span className="price-value">{formatPrice(vehicle.estimated_price)}</span>
        </div>
        <div className="price-row margin-row">
          <span className="price-label">Marge</span>
          <span className="price-value" style={{ color: marginColor(margin) }}>
            {formatMargin(margin)}
          </span>
        </div>
      </div>
      {vehicle.detected_options?.length > 0 && (
        <div className="vehicle-options">
          {(Array.isArray(vehicle.detected_options) ? vehicle.detected_options : []).map((opt, i) => (
            <span key={i} className="option-badge">
              {typeof opt === 'string' ? opt : opt.name}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}
