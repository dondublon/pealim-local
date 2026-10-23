import { useEffect, useState } from 'react';

/**
 * Поисковое строко-форм: живёт на уровне приложения (App), поэтому
 * доступна и на главной, и на странице канонической формы.
 *
 * Поле синхронизируется с query-строкой URL (?q=…): прямой переход
 * или «назад/вперёд» подставляют запрос из адреса, но ввод пользователя
 * не прерывается (URL меняется только при отправке формы).
 */
export default function SearchForm({
  queryFromUrl,
  onSearch,
}: {
  /** Запрос из ?q= текущего URL. */
  queryFromUrl: string;
  /** Вызывается при отправке формы (значение уже обрезано). */
  onSearch: (query: string) => void;
}) {
  const [query, setQuery] = useState(queryFromUrl);

  useEffect(() => {
    setQuery(queryFromUrl);
  }, [queryFromUrl]);

  return (
    <form
      className="search-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(query.trim());
      }}
    >
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Слово без огласовок, например: אב"
        dir="auto"
        autoFocus
      />
      <button type="submit">Искать</button>
    </form>
  );
}
