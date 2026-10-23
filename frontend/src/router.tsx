/**
 * Мини-роутер на History API: маршрутов всего два (главная и
 * /canonic/:canonical), react-router здесь был бы избыточен.
 */
import { useEffect, useState } from 'react';

/** Текущий pathname, обновляется при навигации (кнопки «назад/вперёд» и pushState). */
export function useCurrentPath(): string {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const update = () => setPath(window.location.pathname);
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);
  return path;
}

/** Переход без перезагрузки страницы. */
export function navigate(to: string): void {
  window.history.pushState(null, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/** Ссылка-переход без перезагрузки; modifier-клик (ctrl/cmd) отдаётся браузеру. */
export function Link({
  to,
  children,
  title,
}: {
  to: string;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <a
      href={to}
      title={title}
      onClick={(e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}
