/**
 * Профоры (приклеенные слева частицы) иврита и правила дополнительного
 * поиска.
 *
 * Схема: если запрос начинается с профора, дополнительно ищется остаток
 * без него; к результату добавляются строки остатка, чья часть речи
 * допускает присоединение именно этого профора:
 *
 *   ה              — определённый артикль:    noun, adjective, причастие
 *   ב | מ | л     — предожные профоры:       noun, adjective, pronoun
 *   ш | כש         — союзные профоры:         verb, noun, adjective,
 *                                             pronoun, adverb
 *
 * Причастие — это отдельный случай: в базе это pos='verb' со
 * значением tense = «Настоящее время / причастие» (הַכּוֹתֵב —
 * «пишущий», артикль к нему приклеивается, как к прилагательному).
 */
import type { FormRow } from './types';

const PARTICIPLE_TENSE = 'Настоящее время / причастие';

export interface PrefixRule {
  /** Сам профор, например "ה". */
  prefix: string;
  /** Допускает ли строка остатка этот профор (по части речи). */
  allows: (row: FormRow) => boolean;
}

const hasPos =
  (...pos: string[]) =>
  (row: FormRow): boolean =>
    row.pos !== null && pos.includes(row.pos);

const isParticiple = (row: FormRow): boolean =>
  row.pos === 'verb' && row.form?.tense === PARTICIPLE_TENSE;

const anyOf =
  (...preds: ((row: FormRow) => boolean)[]) =>
  (row: FormRow): boolean =>
    preds.some((p) => p(row));

const SH_KSH_ALLOWED = anyOf(hasPos('verb', 'noun', 'adjective', 'pronoun', 'adverb'));
const BE_ME_LE_ALLOWED = anyOf(hasPos('noun', 'adjective', 'pronoun'));

/** Порядок: «כש» (2 символа) перед односимвольными; пересечений нет. */
const RULES: PrefixRule[] = [
  { prefix: 'כש', allows: SH_KSH_ALLOWED },
  { prefix: 'ש', allows: SH_KSH_ALLOWED },
  { prefix: 'ה', allows: anyOf(hasPos('noun', 'adjective'), isParticiple) },
  { prefix: 'ב', allows: BE_ME_LE_ALLOWED },
  { prefix: 'מ', allows: BE_ME_LE_ALLOWED },
  { prefix: 'ל', allows: BE_ME_LE_ALLOWED },
];

export interface PrefixMatch {
  /** Профор, например "ה". */
  prefix: string;
  /** Запрос без профора (непустой). */
  rest: string;
  rule: PrefixRule;
}

/**
 * Разбор запроса на профор и остаток. Возвращает null, если запрос
 * не начинается с профора или остаток пуст (сам запрос — только профор).
 */
export function detectPrefix(query: string): PrefixMatch | null {
  const rule = RULES.find((r) => query.startsWith(r.prefix));
  if (!rule) return null;
  const rest = query.slice(rule.prefix.length);
  if (!rest) return null;
  return { prefix: rule.prefix, rest, rule };
}

/**
 * Дополнительные строки для запроса с профором: остаток без профора,
 * отфильтрованный по допустимым частям речи, с пометкой профора.
 * Пусто, если ни одна строка остатка не проходит по части речи.
 */
export function prefixExtras(
  query: string,
  searchRest: (rest: string) => FormRow[],
): FormRow[] {
  const match = detectPrefix(query);
  if (!match) return [];
  const extra = searchRest(match.rest).filter(match.rule.allows);
  return extra.map((row) => ({ ...row, via_prefix: match.prefix }));
}
