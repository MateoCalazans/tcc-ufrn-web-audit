/**
 * Decodificação do `index.html` bruto (ADR 014). UTF-8 quando os bytes são
 * UTF-8 válido; senão latin1, que mapeia byte a byte e por isso devolve os
 * mesmos bytes ao recodificar. O BOM é removido do texto (as posições do
 * parse5 contam sem ele) e recolocado ao gravar.
 */
export type Codificacao = "utf-8" | "latin1";

export interface Texto {
  texto: string;
  codificacao: Codificacao;
  bom: boolean;
}

const BOM_UTF8 = Buffer.from([0xef, 0xbb, 0xbf]);

export function decodificar(bytes: Buffer): Texto {
  const bom = bytes.subarray(0, 3).equals(BOM_UTF8);
  const corpo = bom ? bytes.subarray(3) : bytes;
  try {
    const texto = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(corpo);
    return { texto, codificacao: "utf-8", bom };
  } catch {
    return { texto: corpo.toString("latin1"), codificacao: "latin1", bom };
  }
}

export function codificar(texto: string, origem: Omit<Texto, "texto">): Buffer {
  const corpo = Buffer.from(texto, origem.codificacao === "utf-8" ? "utf8" : "latin1");
  return origem.bom ? Buffer.concat([BOM_UTF8, corpo]) : corpo;
}
