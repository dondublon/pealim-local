import type { PrepositionEntry } from '../../db';

/**
 * Список предлогов глагола (general.prepositions): для каждого —
 * предлог, пример сочетания на иврите и русский комментарий.
 */
export default function PrepositionList({ items }: { items: PrepositionEntry[] }) {
  return (
    <div className="prepositions">
      <h3 className="prepositions-title">Предлоги</h3>
      <ul className="prepositions-list">
        {items.map((p, i) => (
          <li key={`${p.prep}|${i}`}>
            <span className="preposition">{p.prep}</span>
            <span className="preposition-comment">{p.comment}</span>
            <span className="preposition-example" dir="rtl">
              {p.example}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
