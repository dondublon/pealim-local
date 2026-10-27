import type { FormRow } from '../../db';

/** Один визуальный блок ячейки: форма (+ вариант после '~', если он есть). */
export interface CellGroup {
  main: FormRow;
  variant?: FormRow;
}

/**
 * Строки одной ячейки → пары «форма [~ вариант]»: строка без огласовок,
 * идущая сразу за формой с огласовками, считается её вариантом '~'
 * (как это показано на самом сайте). Порядок — как в базе (= на странице).
 */
export function pairForms(rows: FormRow[]): CellGroup[] {
  const groups: CellGroup[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (row.word === row.no_nikud && last && !last.variant) {
      last.variant = row;
    } else {
      groups.push({ main: row });
    }
  }
  return groups;
}

/** Содержимое ячейки: блоки «слово [~ вариант]» с транскрипцией. */
export function CellContent({ groups }: { groups: CellGroup[] }) {
  return (
    <>
      {groups.map((g, i) => (
        <div className="cell-form" key={`${g.main.word}|${i}`}>
          <span className="cell-word">{g.main.word}</span>
          {g.variant && <span className="cell-variant"> ~ {g.variant.word}</span>}
          {(g.main.transcription ?? g.variant?.transcription) && (
            <span className="cell-tr">{g.main.transcription ?? g.variant?.transcription}</span>
          )}
        </div>
      ))}
    </>
  );
}
