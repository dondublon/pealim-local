/**
 * Профоры/префиксы (приклеенные слева частицы) и правила дополнительного
 * поиска.
 *
 * Схема: если запрос начинается с префикса, дополнительно ищется остаток
 * без него; к результату добавляются строки остатка, чья часть речи
 * допускает присоединение именно этого префикса:
 *
 *   ה                    — определённый артикль: noun, adjective,
 *                           причастие (не имена — к именам не применяется)
 *   ВСЕ предлоги          — к существительным, прилагательным,
 *                           местоимениям и ИМЕНАМ (לדוד, אלשלום):
 *                           ב מ ל על אל עם עד בין את לפני אחרי תחת
 *                           מתחת מעל בתוך ללא בלי לגבי כלפי לעומת
 *                           למען מלבד אצל מול ליד כמו
 *   ш | когда            — союзы: verb, noun, adjective, pronoun, adverb
 *
 * Причастие — отдельный случай: в базе это pos='verb' со значением
 * tense = «Настоящее время / причастие» (הַכּוֹתֵב — «пишущий», артикль
 * к нему приклеивается, как к прилагательному).
 */
import type { FormRow } from './types';

const PARTICIPLE_TENSE = 'Настоящее время / причастие';

export interface PrefixRule {
  /** Сам префикс, например "ל". */
  prefix: string;
  /** Допускает ли строка остатка этот префикс (по части речи). */
  allows: (row: FormRow) => boolean;
}

const posIn =
  (...pos: string[]) =>
  (row: FormRow): boolean =>
    row.pos !== null && pos.includes(row.pos);

const isParticiple = (row: FormRow): boolean =>
  row.pos === 'verb' && row.form?.tense === PARTICIPLE_TENSE;

const anyOf =
  (...preds: ((row: FormRow) => boolean)[]) =>
  (row: FormRow): boolean =>
    preds.some((p) => p(row));

/** Предлоги: + имена (לדוד, אלשלום) — имена стали частью базы. */
const allowsPreposition = posIn('noun', 'adjective', 'pronoun', 'name');

/** ש/כש — союзные профоры. */
const allowsConjunction = posIn('verb', 'noun', 'adjective', 'pronoun', 'adverb');

/** ה — артикль (исходная схема); к именам не применяется. */
const allowsArticle = anyOf(posIn('noun', 'adjective'), isParticiple);

/**
 * Все предлоги. Порядок в этом массиве не важен: detectPrefix выбирает
 * самый длинный подходящий префикс, поэтому «לפני» срабатывает раньше «ל»,
 * «בתוך» — раньше «ב», «מתחת» — раньше «м».
 */
const PREPOSITIONS = [
  'לפני', 'אחרי', 'ללא', 'מתחת', 'בתוך', 'בלי', 'לגבי', 'כלפי', 'לעומת',
  'למען', 'מלבד', 'על', 'אל', 'עם', 'עד', 'בין', 'את', 'אצל', 'מול', 'ליד',
  'כמו',
  // исходные профоры-контракции
  'ב', 'מ', 'ל',
];

const RULES: PrefixRule[] = [
  ...PREPOSITIONS.map((prefix) => ({ prefix, allows: allowsPreposition })),
  { prefix: 'כש', allows: allowsConjunction },
  { prefix: 'ש', allows: allowsConjunction },
  { prefix: 'ה', allows: allowsArticle },
];

/** Длинные префиксы первыми: «ל_before» должно срабатывать раньше «ל». */
const ORDERED: PrefixRule[] = [...RULES].sort((a, b) => b.prefix.length - a.prefix.length);

export interface PrefixMatch {
  /** Префикс, например "ל". */
  prefix: string;
  /** Запрос без префикса (непустой). */
  rest: string;
  rule: PrefixRule;
}

/**
 * Разбор запроса на префикс и остаток. null — запрос не начинается
 * с префикса или остаток пуст (запрос — только префикс).
 */
export function detectPrefix(query: string): PrefixMatch | null {
  const rule = ORDERED.find((r) => query.startsWith(r.prefix));
  if (!rule) return null;
  const rest = query.slice(rule.prefix.length);
  if (!rest) return null;
  return { prefix: rule.prefix, rest, rule };
}

/**
 * Дополнительные строки для запроса с префиксом: остаток без префикса,
 * отфильтрованный по допустимым частям речи, с пометкой префикса.
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
