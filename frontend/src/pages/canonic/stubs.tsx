import type { FormRow } from '../../db';

/**
 * Заглушки секций по частям речи. Содержимое (вывод форм) будет
 * добавлено позже — сейчас только структура и счётчик строк.
 */
type Props = { rows: FormRow[] };

function Stub({ title, rows }: { title: string; rows: Props['rows'] }) {
  return (
    <section className="pos-section stub">
      <h2 className="pos-title">{title}</h2>
      <p className="status">
        Заглушка: секция «{title}», строк: {rows.length}. Вывод форм будет добавлен позже.
      </p>
    </section>
  );
}

export const AdjectiveSection = ({ rows }: Props) => <Stub title="Прилагательное" rows={rows} />;

export const AdverbSection = ({ rows }: Props) => <Stub title="Наречие" rows={rows} />;

export const PrepositionSection = ({ rows }: Props) => <Stub title="Предлог" rows={rows} />;

export const PronounSection = ({ rows }: Props) => <Stub title="Местоимение" rows={rows} />;

export const NumeralSection = ({ rows }: Props) => <Stub title="Числительное" rows={rows} />;

export const ParticleSection = ({ rows }: Props) => <Stub title="Частица" rows={rows} />;

export const ConjunctionSection = ({ rows }: Props) => <Stub title="Союз" rows={rows} />;

export const InterjectionSection = ({ rows }: Props) => <Stub title="Междометие" rows={rows} />;

export const NameSection = ({ rows }: Props) => <Stub title="Имя" rows={rows} />;

/** Часть речи не указана сайтом (יֵשׁ, אֵין) или неизвестна. */
export const UnspecifiedSection = ({ pos, rows }: { pos: string; rows: FormRow[] }) => (
  <Stub title={pos || 'Часть речи не указана'} rows={rows} />
);
