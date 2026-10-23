/**
 * Мини-роутер на History API: маршрутов всего два (главная и
 * /canonic/:canonical), react-router здесь был бы избыточен.
 */
import { useEffect, useState } from 'react';

export interface Location {
  pathname: string;
  search: string;
}

/**
 * Текущая локация (pathname + search), обновляется при любой навигации
 * (pushState и кнопки «назад/вперёд»). Объект новый при каждом событии,
 * поэтому и изменение только query-строкы перерисовывает слушателей.
 */
export function useLocation(): Location {
  const [loc, setLoc] = useState<Location>(() => ({
    pathname: window.location.pathname,
    search: window.location.search,
  }));
  useEffect(() => {
    const update = () =>
      setLoc({ pathname: window.location.pathname, search: window.location.search });
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);
  return loc;
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
