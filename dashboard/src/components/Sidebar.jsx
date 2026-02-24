import { NavLink } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { LayoutDashboard, Car, Bell, History, Settings, LogOut } from 'lucide-react';

const links = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/vehicles', icon: Car, label: 'Vehicules' },
  { to: '/alerts', icon: Bell, label: 'Alertes' },
  { to: '/history', icon: History, label: 'Historique' },
  { to: '/settings', icon: Settings, label: 'Parametres' },
];

export default function Sidebar() {
  const { user, logout } = useAuth();

  return (
    <aside className="sidebar" role="navigation" aria-label="Navigation principale">
      <div className="sidebar-header">
        <h1 className="logo">Carlytics</h1>
        <span className="user-email">{user?.email}</span>
      </div>
      <nav className="sidebar-nav">
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <Icon size={20} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <button className="logout-btn" onClick={logout} type="button">
        <LogOut size={20} aria-hidden="true" />
        <span>Deconnexion</span>
      </button>
    </aside>
  );
}
