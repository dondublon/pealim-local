import type { ComponentType } from 'react';
import type { FormRow } from '../../db';
import VerbSection from './VerbSection';
import {
  AdjectiveSection,
  AdverbSection,
  ConjunctionSection,
  InterjectionSection,
  NounSection,
  NumeralSection,
  ParticleSection,
  PrepositionSection,
  PronounSection,
} from './stubs';

export interface SectionProps {
  rows: FormRow[];
}

/** pos (из базы) → компонент секции. */
export const SECTION_BY_POS: Record<string, ComponentType<SectionProps>> = {
  verb: VerbSection,
  noun: NounSection,
  adjective: AdjectiveSection,
  adverb: AdverbSection,
  preposition: PrepositionSection,
  pronoun: PronounSection,
  numeral: NumeralSection,
  particle: ParticleSection,
  conjunction: ConjunctionSection,
  interjection: InterjectionSection,
};

/**
 * Порядок секций на странице: verb — верхнее разделение (как на
 * страницах pealim сначала идут глаголы), далее остальные части речи.
 * pos, отсутствующие в списке (в т.ч. null), выводятся последними.
 */
export const POS_ORDER = [
  'verb',
  'noun',
  'adjective',
  'adverb',
  'preposition',
  'pronoun',
  'numeral',
  'particle',
  'conjunction',
  'interjection',
] as const;

/** Отсортированные ключи pos, реально присутствующие в строках. */
export function orderPosKeys(present: Iterable<string>): string[] {
  const set = new Set(present);
  const ordered: string[] = POS_ORDER.filter((p) => set.has(p));
  for (const p of set) {
    if (!POS_ORDER.includes(p as (typeof POS_ORDER)[number])) {
      ordered.push(p);
    }
  }
  return ordered;
}
