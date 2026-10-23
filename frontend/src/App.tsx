import SearchForm from './components/SearchForm';
import Canonic from './pages/canonic/Canonic';
import Home from './pages/Home';
import { navigate, useLocation } from './router';

export default function App() {
  const { pathname, search } = useLocation();
  const urlQuery = new URLSearchParams(search).get('q') ?? '';
  const match = /^\/canonic\/([^/]+)\/?$/.exec(pathname);

  return (
    <main>
      <SearchForm
        queryFromUrl={urlQuery}
        onSearch={(q) => navigate(q ? `/?q=${encodeURIComponent(q)}` : '/')}
      />
      {match ? <Canonic canonical={decodeURIComponent(match[1])} /> : <Home />}
    </main>
  );
}
