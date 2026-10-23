import Canonic from './pages/canonic/Canonic';
import Home from './pages/Home';
import { useCurrentPath } from './router';

export default function App() {
  const path = useCurrentPath();
  const match = /^\/canonic\/([^/]+)\/?$/.exec(path);
  if (match) {
    return <Canonic canonical={decodeURIComponent(match[1])} />;
  }
  return <Home />;
}
