import type { FormRow } from '../../db';

/**
 * Блок форм одного биньяна на странице глагола.
 * Пока повторяет примитивный список вывода; структурирование — следующий шаг.
 */
export default function BinyanBlock({
  name,
  rows,
}: {
  /** Название биньяна (hифъиль, hуфъаль…); null — на странице биньян не указан. */
  name: string | null;
  rows: FormRow[];
}) {
  return (
    <div className="binyan">
      {name && <h3 className="binyan-title">{name}</h3>}
      <ol className="results">
        {rows.map((row, i) => (
          <li key={`${row.word}|${i}`}>
            <span className="word">{row.word}</span>
            {row.transcription && <span className="transcription"> {row.transcription}</span>}
            <span className="meta">
              {[row.pos, row.binyan, row.no_nikud !== row.word ? row.no_nikud : null]
                .filter((p): p is string => Boolean(p))
                .join(' · ')}
            </span>
            {row.form && <span className="form">{JSON.stringify(row.form)}</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}
