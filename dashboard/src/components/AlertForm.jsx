import { useState } from 'react';

const BRANDS = [
  'BMW', 'MERCEDES', 'AUDI', 'VOLKSWAGEN', 'PEUGEOT',
  'RENAULT', 'CITROEN', 'TOYOTA', 'FORD', 'OPEL',
];
const FUELS = ['diesel', 'essence', 'electrique', 'hybride'];

export default function AlertForm({ initial = {}, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    name: initial.name || '',
    brand: initial.brand || '',
    model: initial.model || '',
    yearMin: initial.year_min || '',
    yearMax: initial.year_max || '',
    kmMax: initial.km_max || '',
    fuel: initial.fuel || '',
    minMargin: initial.min_margin || 500,
    maxPrice: initial.max_price || '',
  });

  const update = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = {};
    Object.entries(form).forEach(([k, v]) => {
      if (v !== '' && v !== null) {
        data[k] = typeof v === 'string' && /^\d+$/.test(v) ? parseInt(v, 10) : v;
      }
    });
    onSubmit(data);
  };

  return (
    <form className="alert-form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="alert-name">Nom de l'alerte</label>
        <input
          id="alert-name"
          type="text"
          value={form.name}
          onChange={update('name')}
          placeholder="Ex: BMW Serie 3 bonnes affaires"
        />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label htmlFor="alert-brand">Marque</label>
          <select id="alert-brand" value={form.brand} onChange={update('brand')}>
            <option value="">Toutes</option>
            {BRANDS.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="alert-model">Modele</label>
          <input
            id="alert-model"
            type="text"
            value={form.model}
            onChange={update('model')}
            placeholder="Ex: 320, Classe C..."
          />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label htmlFor="alert-year-min">Annee min</label>
          <input
            id="alert-year-min"
            type="number"
            value={form.yearMin}
            onChange={update('yearMin')}
            min="2000"
            max="2026"
          />
        </div>
        <div className="form-group">
          <label htmlFor="alert-year-max">Annee max</label>
          <input
            id="alert-year-max"
            type="number"
            value={form.yearMax}
            onChange={update('yearMax')}
            min="2000"
            max="2026"
          />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label htmlFor="alert-km-max">KM max</label>
          <input
            id="alert-km-max"
            type="number"
            value={form.kmMax}
            onChange={update('kmMax')}
            step="10000"
            placeholder="150000"
          />
        </div>
        <div className="form-group">
          <label htmlFor="alert-fuel">Carburant</label>
          <select id="alert-fuel" value={form.fuel} onChange={update('fuel')}>
            <option value="">Tous</option>
            {FUELS.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label htmlFor="alert-min-margin">Marge minimum</label>
          <input
            id="alert-min-margin"
            type="number"
            value={form.minMargin}
            onChange={update('minMargin')}
            step="100"
          />
        </div>
        <div className="form-group">
          <label htmlFor="alert-max-price">Prix max achat</label>
          <input
            id="alert-max-price"
            type="number"
            value={form.maxPrice}
            onChange={update('maxPrice')}
            step="1000"
            placeholder="30000"
          />
        </div>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary">Sauvegarder</button>
        {onCancel && (
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}
