/** Formatação pt-BR dos números das telas. `—` quando não há valor. */

export const VAZIO = "—";

const inteiro = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const umaCasa = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const tresCasas = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

const ok = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

/** Converte o texto do CSV em número (`""` → `null`). */
export function numero(texto: string | undefined): number | null {
  if (texto === undefined || texto.trim() === "") return null;
  const n = Number(texto);
  return Number.isFinite(n) ? n : null;
}

export function fmtInteiro(v: number | null | undefined): string {
  return ok(v) ? inteiro.format(v) : VAZIO;
}

export function fmtIndice(v: number | null | undefined): string {
  return ok(v) ? umaCasa.format(v) : VAZIO;
}

/** Milissegundos: até 1 s em ms, depois em segundos com 1 casa. */
export function fmtMs(v: number | null | undefined): string {
  if (!ok(v)) return VAZIO;
  return v < 1000 ? `${inteiro.format(v)} ms` : `${umaCasa.format(v / 1000)} s`;
}

export function fmtCls(v: number | null | undefined): string {
  return ok(v) ? tresCasas.format(v) : VAZIO;
}

export function fmtBytes(v: number | null | undefined): string {
  if (!ok(v)) return VAZIO;
  if (v < 1024) return `${inteiro.format(v)} B`;
  if (v < 1024 * 1024) return `${umaCasa.format(v / 1024)} KiB`;
  return `${umaCasa.format(v / (1024 * 1024))} MiB`;
}

export function fmtProporcao(v: number | null | undefined): string {
  return ok(v) ? `${umaCasa.format(v * 100)}%` : VAZIO;
}

export function fmtData(iso: string | undefined): string {
  if (!iso) return VAZIO;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return VAZIO;
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function fmtUsd(v: number | null | undefined): string {
  return ok(v) ? `US$ ${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(v)}` : VAZIO;
}

export type Faixa = "ruim" | "media" | "boa";

/** Faixas de cor do próprio Lighthouse: 0–49, 50–89, 90–100. Só para notas do Lighthouse. */
export function faixaLighthouse(v: number | null | undefined): Faixa | null {
  if (!ok(v)) return null;
  if (v >= 90) return "boa";
  if (v >= 50) return "media";
  return "ruim";
}

export const ROTULO_FAIXA: Record<Faixa, string> = { ruim: "ruim", media: "precisa melhorar", boa: "boa" };

export const ROTULO_TIPO: Record<string, string> = {
  unidade: "Unidade",
  departamento: "Departamento",
  "pos-graduacao": "Pós-graduação",
  laboratorio: "Laboratório",
  projeto: "Projeto",
  evento: "Evento",
  outro: "Outro",
};

export const ROTULO_TECNOLOGIA: Record<string, string> = {
  wordpress: "WordPress",
  estatico: "Estático",
  "framework-js": "Framework JS",
  joomla: "Joomla",
  "outro-cms": "Outro CMS",
  outro: "Outro",
};

export function rotulo(mapa: Record<string, string>, v: string | undefined): string {
  if (!v) return VAZIO;
  return mapa[v] ?? v;
}
