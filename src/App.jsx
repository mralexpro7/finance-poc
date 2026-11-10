import { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import HomeView from './views/HomeView.jsx';
import PositionsView from './views/PositionsView.jsx';

// Add a view here and it appears in the sidebar. Current view is kept in the URL hash (#/positions).
export const VIEWS = [
  { id: 'home', label: 'Home', component: HomeView },
  { id: 'positions', label: 'Positions', component: PositionsView },
];

const viewFromHash = () => {
  const id = window.location.hash.replace(/^#\/?/, '');
  return VIEWS.some((v) => v.id === id) ? id : 'home';
};

export default function App() {
  const [active, setActive] = useState(viewFromHash);

  useEffect(() => {
    const onHash = () => setActive(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const View = VIEWS.find((v) => v.id === active).component;

  return (
    <div className="layout">
      <Sidebar views={VIEWS} active={active} />
      <main className="content">
        <View />
      </main>
    </div>
  );
}
