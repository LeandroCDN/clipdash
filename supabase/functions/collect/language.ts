// Heurística barata de idioma. Se reemplaza por un clasificador LLM más adelante.
const HINTS: [string, RegExp][] = [
  ["fr", /\b(fr|français|francais|france|campagne)\b/i],
  ["de", /\b(deutsch|german|kampagne)\b/i],
  ["es", /\b(español|espanol|spanish|campaña|latam|hablando|vistas|sobreviviendo)\b/i],
  ["pt", /\b(português|portugues|brasil|brazil|pt-br)\b/i],
  ["it", /\b(italiano|italia)\b/i],
  ["ar", /\b(arabic)\b|عربي/i],
  ["tr", /\b(türkçe|turkish)\b/i],
];

export function guessLanguage(...texts: (string | null | undefined)[]): string | null {
  const blob = texts.filter(Boolean).join(" ");
  if (!blob) return null;
  for (const [code, re] of HINTS) if (re.test(blob)) return code;
  return "en";
}
