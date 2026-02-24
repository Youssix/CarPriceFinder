import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="not-found-page">
      <h1>404</h1>
      <p>Page introuvable</p>
      <Link to="/" className="btn btn-primary">Retour au dashboard</Link>
    </div>
  );
}
