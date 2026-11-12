import type { Har } from "../../src/shared/types.js";

/**
 * Cabeçalhos mínimos de imagem para os testes: o leitor só olha o cabeçalho,
 * então bastam os bytes que ele lê (o restante é preenchimento).
 */

export function png(w: number, h: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "latin1");
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
}

export function gif(w: number, h: number): Buffer {
  const b = Buffer.alloc(13);
  b.write("GIF89a", 0, "latin1");
  b.writeUInt16LE(w, 6);
  b.writeUInt16LE(h, 8);
  return b;
}

/** Segmento APP1 Exif big-endian com só a tag Orientation. */
function app1Orientacao(o: number): Buffer {
  const tiff = Buffer.alloc(8 + 2 + 12 + 4);
  tiff.write("MM", 0, "latin1");
  tiff.writeUInt16BE(42, 2);
  tiff.writeUInt32BE(8, 4);
  tiff.writeUInt16BE(1, 8);
  tiff.writeUInt16BE(0x0112, 10);
  tiff.writeUInt16BE(3, 12);
  tiff.writeUInt32BE(1, 14);
  tiff.writeUInt16BE(o, 18);
  const corpo = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
  const cab = Buffer.from([0xff, 0xe1, 0, 0]);
  cab.writeUInt16BE(corpo.length + 2, 2);
  return Buffer.concat([cab, corpo]);
}

export function jpeg(w: number, h: number, orientacao?: number): Buffer {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, ...Buffer.from("JFIF\0", "latin1"), 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const sof = Buffer.alloc(19);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(17, 2);
  sof[4] = 8;
  sof.writeUInt16BE(h, 5);
  sof.writeUInt16BE(w, 7);
  const partes: Buffer[] = [Buffer.from([0xff, 0xd8]), app0];
  if (orientacao !== undefined) partes.push(app1Orientacao(orientacao));
  partes.push(sof, Buffer.from([0xff, 0xd9]));
  return Buffer.concat(partes);
}

export function webpVp8x(w: number, h: number): Buffer {
  const b = Buffer.alloc(30);
  b.write("RIFF", 0, "latin1");
  b.write("WEBP", 8, "latin1");
  b.write("VP8X", 12, "latin1");
  b.writeUIntLE(w - 1, 24, 3);
  b.writeUIntLE(h - 1, 27, 3);
  return b;
}

export function webpVp8l(w: number, h: number): Buffer {
  const b = Buffer.alloc(30);
  b.write("RIFF", 0, "latin1");
  b.write("WEBP", 8, "latin1");
  b.write("VP8L", 12, "latin1");
  b[20] = 0x2f;
  b.writeUInt32LE(((w - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14), 21);
  return b;
}

export function webpVp8(w: number, h: number): Buffer {
  const b = Buffer.alloc(30);
  b.write("RIFF", 0, "latin1");
  b.write("WEBP", 8, "latin1");
  b.write("VP8 ", 12, "latin1");
  b.writeUInt16LE(w, 26);
  b.writeUInt16LE(h, 28);
  return b;
}

type EntradaHar = Har["log"]["entries"][number];

/** Entrada de HAR com corpo em base64 (binário) ou texto (SVG). */
export function entrada(url: string, corpo: Buffer | string, mimeType: string): EntradaHar {
  return {
    request: { url },
    response: {
      status: 200,
      content: typeof corpo === "string" ? { mimeType, text: corpo } : { mimeType, text: corpo.toString("base64"), encoding: "base64" },
    },
  };
}

export function redirecionamento(url: string, destino: string): EntradaHar {
  return { request: { url }, response: { status: 301, redirectURL: destino, content: {} } };
}

export const har = (entries: EntradaHar[]): Har => ({ log: { entries } });
