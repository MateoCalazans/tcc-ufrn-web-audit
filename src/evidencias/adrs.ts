/** Leitura dos ADRs (`docs/decisoes/NNN-titulo.md`) para o índice de evidências (S19). */

export interface Adr {
  arquivo: string;
  numero: string | null;
  titulo: string | null;
  data: string | null;
  status: string | null;
  /** Títulos dos adendos ("## Adendo …"), na ordem do arquivo. */
  adendos: string[];
}

export function parseAdr(md: string, arquivo: string): Adr {
  const t = /^#\s+ADR\s+(\d{3})\s+[—-]\s+(.+)$/m.exec(md);
  const d = /\*\*Data:\*\*\s*([^\s·]+)/.exec(md);
  const s = /\*\*Status:\*\*\s*([^\n]+)/.exec(md);
  const adendos = [...md.matchAll(/^#{2,3}\s+(Adendo[^\n]*)$/gm)].map((m) => m[1]!.trim());
  return {
    arquivo,
    numero: t?.[1] ?? null,
    titulo: t?.[2]?.trim() ?? null,
    data: d?.[1] ?? null,
    status: s?.[1]?.trim() ?? null,
    adendos,
  };
}

/** Números que faltam na sequência (ex.: 017 reservado). */
export function numerosAusentes(numeros: string[]): string[] {
  const n = numeros.map(Number).filter((x) => Number.isFinite(x));
  if (n.length === 0) return [];
  const presentes = new Set(n);
  const faltam: string[] = [];
  for (let i = 1; i <= Math.max(...n); i++) if (!presentes.has(i)) faltam.push(String(i).padStart(3, "0"));
  return faltam;
}
