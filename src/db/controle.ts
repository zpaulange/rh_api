/** JSON canonique (clés triées) : comparaison indépendante de l'ordre des propriétés */
export function canonique(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonique).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.keys(v as object)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonique((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(v);
}

/** Premières différences entre deux valeurs (chemins) */
export function differences(a: unknown, b: unknown, chemin = '', max = 10, sortie: string[] = []): string[] {
  if (sortie.length >= max) return sortie;
  if (canonique(a) === canonique(b)) return sortie;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const cles = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
    for (const k of cles) differences((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${chemin}.${k}`, max, sortie);
    return sortie;
  }
  sortie.push(`${chemin} : ${JSON.stringify(a)?.slice(0, 80)} ≠ ${JSON.stringify(b)?.slice(0, 80)}`);
  return sortie;
}
