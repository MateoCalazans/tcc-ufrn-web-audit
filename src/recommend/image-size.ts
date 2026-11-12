/**
 * Dimensões intrínsecas de uma imagem a partir dos bytes do cabeçalho
 * (ADR 014): PNG, GIF, JPEG (com orientação EXIF), WebP e SVG. Formato não
 * reconhecido ou cabeçalho truncado → `null` (a regra só recomenda).
 */
export interface Dimensoes {
  largura: number;
  altura: number;
  formato: "png" | "gif" | "jpeg" | "webp" | "svg";
}

export function dimensoesDaImagem(buf: Buffer): Dimensoes | null {
  try {
    const d = png(buf) ?? gif(buf) ?? jpeg(buf) ?? webp(buf) ?? svg(buf);
    return d !== null && d.largura > 0 && d.altura > 0 ? d : null;
  } catch {
    return null; // cabeçalho truncado: leitura fora do buffer
  }
}

function png(b: Buffer): Dimensoes | null {
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47 || b.toString("latin1", 12, 16) !== "IHDR") return null;
  return { largura: b.readUInt32BE(16), altura: b.readUInt32BE(20), formato: "png" };
}

function gif(b: Buffer): Dimensoes | null {
  if (b.length < 10 || b.toString("latin1", 0, 4) !== "GIF8") return null;
  return { largura: b.readUInt16LE(6), altura: b.readUInt16LE(8), formato: "gif" };
}

/** Marcadores SOF (start of frame) que trazem as dimensões; exclui DHT/JPG/DAC. */
const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function jpeg(b: Buffer): Dimensoes | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let orientacao = 1;
  let i = 2;
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1]!;
    if (m === 0xff) { i++; continue; } // bytes de preenchimento
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; } // sem comprimento
    const len = b.readUInt16BE(i + 2);
    if (m === 0xe1) orientacao = orientacaoExif(b.subarray(i + 4, i + 2 + len)) ?? orientacao;
    if (SOF.has(m)) {
      const altura = b.readUInt16BE(i + 5);
      const largura = b.readUInt16BE(i + 7);
      // Orientações 5–8 giram 90°: o navegador exibe com largura e altura trocadas.
      return orientacao >= 5 && orientacao <= 8
        ? { largura: altura, altura: largura, formato: "jpeg" }
        : { largura, altura, formato: "jpeg" };
    }
    i += 2 + len;
  }
  return null;
}

/** Tag 0x0112 (Orientation) do IFD0 de um segmento APP1 Exif. */
function orientacaoExif(seg: Buffer): number | null {
  if (seg.toString("latin1", 0, 6) !== "Exif\0\0") return null;
  const t = seg.subarray(6);
  const le = t.toString("latin1", 0, 2) === "II";
  const u16 = (o: number) => (le ? t.readUInt16LE(o) : t.readUInt16BE(o));
  const u32 = (o: number) => (le ? t.readUInt32LE(o) : t.readUInt32BE(o));
  const ifd = u32(4);
  const n = u16(ifd);
  for (let k = 0; k < n; k++) {
    const e = ifd + 2 + k * 12;
    if (u16(e) === 0x0112) return u16(e + 8);
  }
  return null;
}

function webp(b: Buffer): Dimensoes | null {
  if (b.length < 30 || b.toString("latin1", 0, 4) !== "RIFF" || b.toString("latin1", 8, 12) !== "WEBP") return null;
  const chunk = b.toString("latin1", 12, 16);
  if (chunk === "VP8 ") return { largura: b.readUInt16LE(26) & 0x3fff, altura: b.readUInt16LE(28) & 0x3fff, formato: "webp" };
  if (chunk === "VP8L") {
    const bits = b.readUInt32LE(21);
    return { largura: (bits & 0x3fff) + 1, altura: ((bits >> 14) & 0x3fff) + 1, formato: "webp" };
  }
  if (chunk === "VP8X") return { largura: b.readUIntLE(24, 3) + 1, altura: b.readUIntLE(27, 3) + 1, formato: "webp" };
  return null;
}

/** `width`/`height` absolutos (sem unidade ou `px`); senão a proporção do `viewBox`. */
function svg(b: Buffer): Dimensoes | null {
  const texto = b.toString("utf8", 0, Math.min(b.length, 64 * 1024));
  const tag = /<svg\b[^>]*>/i.exec(texto)?.[0];
  if (tag === undefined) return null;
  const attr = (nome: string) => new RegExp(`\\s${nome}\\s*=\\s*["']([^"']*)["']`, "i").exec(tag)?.[1]?.trim();
  const px = (v: string | undefined) => {
    const m = v === undefined ? null : /^(\d+(?:\.\d+)?)(px)?$/.exec(v);
    return m ? Math.round(Number(m[1])) : null;
  };
  const w = px(attr("width"));
  const h = px(attr("height"));
  if (w !== null && h !== null) return { largura: w, altura: h, formato: "svg" };
  const vb = attr("viewBox")?.split(/[\s,]+/).map(Number);
  if (vb?.length === 4 && vb.every(Number.isFinite)) {
    return { largura: Math.round(vb[2]!), altura: Math.round(vb[3]!), formato: "svg" };
  }
  return null;
}
