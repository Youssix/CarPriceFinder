export function formatPrice(cents) {
  if (!cents && cents !== 0) return '\u2014';
  const euros = typeof cents === 'number' && cents > 99999 ? cents / 100 : cents;
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(euros);
}

export function formatKm(km) {
  if (!km) return '\u2014';
  return new Intl.NumberFormat('fr-FR').format(km) + ' km';
}

export function formatDate(date) {
  if (!date) return '\u2014';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export function formatMargin(margin) {
  if (!margin && margin !== 0) return '\u2014';
  const sign = margin >= 0 ? '+' : '';
  return sign + formatPrice(margin);
}

export function marginColor(margin) {
  if (margin >= 2000) return '#16a34a';
  if (margin >= 500) return '#ca8a04';
  return '#dc2626';
}
