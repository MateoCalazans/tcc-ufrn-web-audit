/**
 * Rotas no hash (`#/site/mat.ufrn.br`): funcionam igual no Vite e no
 * servidor da S20, sem configuração de histórico.
 */
export type Rota =
  | { tela: "lista" }
  | { tela: "site"; id: string }
  | { tela: "nova" }
  | { tela: "analise"; id: string }
  | { tela: "nao-encontrada" };

const SITE = /^[a-z0-9.-]+$/;
const ANALISE = /^[a-z0-9.-]+__\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/;

export function lerRota(hash: string): Rota {
  const partes = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map((p) => {
    try {
      return decodeURIComponent(p);
    } catch {
      return "";
    }
  });
  if (partes.length === 0) return { tela: "lista" };
  const [tela, id, ...resto] = partes;
  if (resto.length > 0) return { tela: "nao-encontrada" };
  if (tela === "nova" && id === undefined) return { tela: "nova" };
  if (tela === "site" && id !== undefined && SITE.test(id)) return { tela: "site", id };
  if (tela === "analise" && id !== undefined && ANALISE.test(id)) return { tela: "analise", id };
  return { tela: "nao-encontrada" };
}

export function link(r: Rota): string {
  switch (r.tela) {
    case "lista":
      return "#/";
    case "nova":
      return "#/nova";
    case "site":
      return `#/site/${encodeURIComponent(r.id)}`;
    case "analise":
      return `#/analise/${encodeURIComponent(r.id)}`;
    default:
      return "#/";
  }
}
