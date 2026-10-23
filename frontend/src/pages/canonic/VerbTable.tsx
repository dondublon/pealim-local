import type { FormRow } from '../../db';

/**
 * Таблица форм глагола одного биньяна — по образцу pealim
 * (https://www.pealim.com/ru/dict/1141-lehagia/):
 *
 *   колонки:  Единственное число | Множественное число
 *             × подколонки: Мужской род | Женский род
 *   строки:   Настоящее время / причастие
 *             Прошедшее время  → 1-е/2-е/3-е лицо
 *             Будущее время    → 1-е/2-е/3-е лицо
 *             Повелительное наклонение
 *             Инфинитив (ячейка на все 4 колонки)
 *
 * Ячейка без указания рода (1-е лицо, 3-е лицо мн. ч.) занимает
 * обе подколонки числа (colSpan=2), как на сайте.
 */

const NUMBERS = ['Единственное число', 'Множественное число'] as const;
const GENDERS = ['Мужской род', 'Женский род'] as const;
const PERSONS = ['1-е лицо', '2-е лицо', '3-е лицо'] as const;
const TENSES = [
  'Настоящее время / причастие',
  'Прошедшее время',
  'Будущее время',
  'Повелительное наклонение',
  'Инфинитив',
] as const;

/** Прошедшее/будущее время разбиты на под-строки-лица. */
const PERSON_TENSES = new Set(['Прошедшее время', 'Будущее время']);

/** Один визуальный блок ячейки: форма (+ вариант после '~', если он есть). */
interface CellGroup {
  main: FormRow;
  variant?: FormRow;
}

function cellKey(tense: string, person: string, number: string, gender: string): string {
  return [tense, person, number, gender].join('|');
}

/**
 * Строки одной ячейки → пары «форма [~ вариант]»: строка без огласовок,
 * идущая сразу за формой с огласовками, считается её вариантом '~'
 * (как это показано на самом сайте). Порядок — как в базе (= на странице).
 */
function pairForms(rows: FormRow[]): CellGroup[] {
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

function CellContent({ groups }: { groups: CellGroup[] }) {
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

export default function VerbTable({ rows }: { rows: FormRow[] }) {
  // Раскладка форм по ячейкам: tense|person|number|gender → строки
  const cells = new Map<string, FormRow[]>();
  const unplaced: FormRow[] = [];

  for (const row of rows) {
    const f = row.form;
    if (!f || !f.tense || !(TENSES as readonly string[]).includes(f.tense)) {
      unplaced.push(row);
      continue;
    }
    const key = cellKey(f.tense, f.person ?? '', f.number ?? '', f.gender ?? '');
    const bucket = cells.get(key);
    if (bucket) {
      bucket.push(row);
    } else {
      cells.set(key, [row]);
    }
  }

  const consumed = new Set<string>();

  /** 4 ячейки строки (или fewer при colspan): для (tense, person). */
  function renderNumberCells(tense: string, person: string) {
    return NUMBERS.map((number) => {
      // Ячейка без рода (1-е лицо, 3-е лицо мн.ч.) — на обе подколонки
      const genderlessKey = cellKey(tense, person, number, '');
      const genderless = cells.get(genderlessKey);
      if (genderless) {
        consumed.add(genderlessKey);
        return (
          <td className="data" colSpan={2} key={number}>
            <CellContent groups={pairForms(genderless)} />
          </td>
        );
      }
      return GENDERS.map((gender) => {
        const key = cellKey(tense, person, number, gender);
        const bucket = cells.get(key);
        if (bucket) {
          consumed.add(key);
        }
        return (
          <td className="data" key={`${number}|${gender}`}>
            {bucket && <CellContent groups={pairForms(bucket)} />}
          </td>
        );
      });
    });
  }

  const rowsJsx: React.ReactNode[] = [];

  for (const tense of TENSES) {
    if (tense === 'Инфинитив') {
      const key = cellKey(tense, '', '', '');
      const bucket = cells.get(key);
      if (!bucket) continue;
      consumed.add(key);
      rowsJsx.push(
        <tr key={tense}>
          <th className="row-tense" colSpan={2} scope="row">
            {tense}
          </th>
          <td className="data merged" colSpan={4}>
            <CellContent groups={pairForms(bucket)} />
          </td>
        </tr>,
      );
      continue;
    }

    if (PERSON_TENSES.has(tense)) {
      const persons = PERSONS.filter((p) =>
        [...cells.keys()].some((k) => k.startsWith(`${tense}|${p}|`)),
      );
      if (persons.length === 0) continue;
      rowsJsx.push(
        <tr key={tense}>
          <th className="row-tense" rowSpan={persons.length} scope="rowgroup">
            {tense}
          </th>
          <th className="row-person" scope="row">
            {persons[0]}
          </th>
          {renderNumberCells(tense, persons[0])}
        </tr>,
      );
      for (const person of persons.slice(1)) {
        rowsJsx.push(
          <tr key={`${tense}|${person}`}>
            <th className="row-person" scope="row">
              {person}
            </th>
            {renderNumberCells(tense, person)}
          </tr>,
        );
      }
      continue;
    }

    // Настоящее время / Повелительное — одна строка без лиц
    const hasAny = NUMBERS.some((n) =>
      GENDERS.some((g) => cells.has(cellKey(tense, '', n, g))),
    );
    if (!hasAny) continue;
    rowsJsx.push(
      <tr key={tense}>
        <th className="row-tense" colSpan={2} scope="row">
          {tense}
        </th>
        {renderNumberCells(tense, '')}
      </tr>,
    );
  }

  // Формы, не попавшие ни в одну ячейку (не должны встречаться)
  for (const key of cells.keys()) {
    if (!consumed.has(key)) {
      unplaced.push(...cells.get(key)!);
    }
  }

  return (
    <>
      <table className="verb-table">
        <thead>
          <tr>
            <th rowSpan={2}>Форма глагола</th>
            <th rowSpan={2}>Лицо</th>
            <th colSpan={2}>Единственное число</th>
            <th colSpan={2}>Множественное число</th>
          </tr>
          <tr>
            {NUMBERS.map(() =>
              GENDERS.map((g) => (
                <th key={g} className="gender">
                  {g}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>{rowsJsx}</tbody>
      </table>

      {unplaced.length > 0 && (
        <div className="unplaced">
          <b>Не размещены в таблице ({unplaced.length}):</b>
          <ol>
            {unplaced.map((r, i) => (
              <li key={i}>
                {r.word} — {JSON.stringify(r.form)}
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  );
}
