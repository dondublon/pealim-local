import type { FormRow } from '../../db';
import { CellContent, pairForms } from './FormCell';

/**
 * Секция «Существительное» по образцу pealim (https://www.pealim.com/ru/dict/6009-av/):
 *
 *   1. Формы без местоименных окончаний:
 *        колонки: Единственное число | Множественное число
 *        строки:  Абсолютное состояние | Сопряженное состояние
 *   2. Формы с местоименными окончаниями (только при заполненном num_owners):
 *        строки:  Число существительного (Единственное/Множественное) → Лицо
 *        колонки: число владельцев × род; 1-е лицо рода не имеет (colSpan).
 *
 * Строки с person, но без num_owners (на pealim для них отдельная раскладка
 * таблицы) не выводятся.
 */

const STATE_NUMBERS = ['Единственное число', 'Множественное число'] as const;
const STATES = ['Абсолютное состояние', 'Сопряженное состояние'] as const;
const SUFFIX_NUMBERS = ['Единственное', 'Множественное'] as const;
const OWNERS = [
  'Единственное число владельцев',
  'Множественное число владельцев',
] as const;
const PERSONS = ['1-е лицо', '2-е лицо', '3-е лицо'] as const;
const GENDERS = ['Мужской род', 'Женский род'] as const;

function key(...parts: string[]): string {
  return parts.join('|');
}

function addTo(map: Map<string, FormRow[]>, cellKey: string, row: FormRow): void {
  const bucket = map.get(cellKey);
  if (bucket) bucket.push(row);
  else map.set(cellKey, [row]);
}

export default function NounSection({ rows }: { rows: FormRow[] }) {
  const stateCells = new Map<string, FormRow[]>();
  const suffixCells = new Map<string, FormRow[]>();
  const suffixGenders = new Set<string>();

  for (const row of rows) {
    const f = row.form;
    if (f?.state) {
      addTo(stateCells, key(f.state, f.number ?? ''), row);
    } else if (f?.person && f.num_owners) {
      addTo(suffixCells, key(f.number ?? '', f.person, f.num_owners, f.gender ?? ''), row);
      if (f.gender) suffixGenders.add(f.gender);
    }
    // person без num_owners — отдельная раскладка pealim, не выводим
  }

  const hasSuffix = suffixCells.size > 0;

  // ячейка «лица» существует, если заполнен хоть один её столбец
  const suffixCellExists = (number: string, person: string, owner: string): boolean =>
    suffixCells.has(key(number, person, owner, '')) ||
    GENDERS.some((g) => suffixCells.has(key(number, person, owner, g)));

  const stateNumbers = STATE_NUMBERS.filter((n) =>
    STATES.some((s) => stateCells.has(key(s, n))),
  );
  const states = STATES.filter((s) => stateNumbers.some((n) => stateCells.has(key(s, n))));
  const suffixNumbers = SUFFIX_NUMBERS.filter((n) =>
    PERSONS.some((p) => OWNERS.some((o) => suffixCellExists(n, p, o))),
  );
  const owners = OWNERS.filter((o) =>
    suffixNumbers.some((n) => PERSONS.some((p) => suffixCellExists(n, p, o))),
  );
  const genders = GENDERS.filter((g) => suffixGenders.has(g));

  return (
    <section className="pos-section">
      <h2 className="pos-title">Существительное</h2>

      {hasSuffix && <h3 className="binyan-title">Формы без местоименных окончаний</h3>}
      {stateNumbers.length > 0 && (
        <table className="noun-table">
          <thead>
            <tr>
              <th />
              {stateNumbers.map((n) => (
                <th key={n}>{n}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {states.map((s) => (
              <tr key={s}>
                <th className="row-tense" scope="row">
                  {s}
                </th>
                {stateNumbers.map((n) => {
                  const bucket = stateCells.get(key(s, n));
                  return (
                    <td className="data" key={n}>
                      {bucket && <CellContent groups={pairForms(bucket)} />}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {hasSuffix && (
        <div className="binyan">
          <h3 className="binyan-title">Формы с местоименными окончаниями</h3>
          <table className="noun-table">
            <thead>
              <tr>
                <th rowSpan={genders.length ? 2 : 1}>Число существительного</th>
                <th rowSpan={genders.length ? 2 : 1}>Лицо</th>
                {owners.map((o) => (
                  <th colSpan={Math.max(genders.length, 1)} key={o}>
                    {o.replace(/ владельцев$/, '')}
                  </th>
                ))}
              </tr>
              {genders.length > 0 && (
                <tr>
                  {owners.map((o) =>
                    genders.map((g) => (
                      <th className="gender" key={`${o}|${g}`}>
                        {g}
                      </th>
                    )),
                  )}
                </tr>
              )}
            </thead>
            <tbody>
              {suffixNumbers.map((number) => {
                const persons = PERSONS.filter((p) =>
                  owners.some((o) => suffixCellExists(number, p, o)),
                );
                return persons.map((person, pi) => (
                  <tr key={`${number}|${person}`}>
                    {pi === 0 && (
                      <th className="row-tense" rowSpan={persons.length} scope="rowgroup">
                        {number}
                      </th>
                    )}
                    <th className="row-person" scope="row">
                      {person.replace(' лицо', '')}
                    </th>
                    {owners.map((owner) => {
                      const genderless = suffixCells.get(key(number, person, owner, ''));
                      if (genderless) {
                        return (
                          <td className="data" colSpan={Math.max(genders.length, 1)} key={owner}>
                            <CellContent groups={pairForms(genderless)} />
                          </td>
                        );
                      }
                      return genders.map((gender) => {
                        const bucket = suffixCells.get(key(number, person, owner, gender));
                        return (
                          <td className="data" key={`${owner}|${gender}`}>
                            {bucket && <CellContent groups={pairForms(bucket)} />}
                          </td>
                        );
                      });
                    })}
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
