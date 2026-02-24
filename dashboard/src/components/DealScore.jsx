export default function DealScore({ margin, count }) {
  let score = 0;
  if (margin >= 3000) score += 40;
  else if (margin >= 2000) score += 30;
  else if (margin >= 1000) score += 20;
  else if (margin >= 500) score += 10;

  if (count >= 20) score += 30;
  else if (count >= 10) score += 20;
  else if (count >= 5) score += 10;

  score += 30; // base for having data

  const color = score >= 80 ? '#16a34a' : score >= 60 ? '#ca8a04' : '#dc2626';
  const label = score >= 80 ? 'Excellent' : score >= 60 ? 'Bon' : 'Faible';

  return (
    <div className="deal-score" style={{ borderColor: color }} role="status" aria-label={`Score: ${score} - ${label}`}>
      <span className="deal-score-value" style={{ color }}>{score}</span>
      <span className="deal-score-label">{label}</span>
    </div>
  );
}
