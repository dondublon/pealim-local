/** Снять огласовки (U+0591–U+05C7), сохранив буквы и маqaf (־). */
export function stripNikud(word: string): string {
  let out = '';
  for (const ch of word) {
    const cp = ch.codePointAt(0) ?? 0;
    const isNikud = cp >= 0x0591 && cp <= 0x05c7 && cp !== 0x05be;
    if (!isNikud) out += ch;
  }
  return out;
}
