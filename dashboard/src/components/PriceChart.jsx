import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { formatPrice } from '../utils/format';

export default function PriceChart({ results = [] }) {
  if (!results.length) return <p className="no-data">Pas de donnees</p>;

  const data = results.slice(0, 10).map((r, i) => ({
    name: `#${i + 1}`,
    price: r.price || r.price_cents / 100,
  }));

  return (
    <div className="price-chart" role="img" aria-label="Distribution des prix LeBonCoin">
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data}>
          <XAxis dataKey="name" />
          <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
          <Tooltip formatter={(v) => formatPrice(v)} />
          <Bar dataKey="price" fill="#3b82f6" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => (
              <Cell
                key={i}
                fill={i === Math.floor(data.length / 2) ? '#16a34a' : '#3b82f6'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
