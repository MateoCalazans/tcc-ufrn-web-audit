import { describe, expect, it } from "vitest";

import { dimensoesDaImagem } from "../../src/recommend/image-size.js";
import { gif, jpeg, png, webpVp8, webpVp8l, webpVp8x } from "./bytes.js";

describe("dimensoesDaImagem", () => {
  it.each([
    ["png", png(120, 45), { largura: 120, altura: 45, formato: "png" }],
    ["gif", gif(16, 9), { largura: 16, altura: 9, formato: "gif" }],
    ["jpeg", jpeg(800, 600), { largura: 800, altura: 600, formato: "jpeg" }],
    ["jpeg com EXIF orientação 1", jpeg(800, 600, 1), { largura: 800, altura: 600, formato: "jpeg" }],
    ["webp VP8X", webpVp8x(1920, 1080), { largura: 1920, altura: 1080, formato: "webp" }],
    ["webp VP8L", webpVp8l(300, 200), { largura: 300, altura: 200, formato: "webp" }],
    ["webp VP8", webpVp8(640, 480), { largura: 640, altura: 480, formato: "webp" }],
  ])("%s", (_, bytes, esperado) => {
    expect(dimensoesDaImagem(bytes)).toEqual(esperado);
  });

  it("jpeg com orientação EXIF 6 (girado 90°) troca largura e altura", () => {
    expect(dimensoesDaImagem(jpeg(800, 600, 6))).toEqual({ largura: 600, altura: 800, formato: "jpeg" });
  });

  it("svg: width/height absolutos; px aceito", () => {
    expect(dimensoesDaImagem(Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="24px" height="12">'))).toEqual({ largura: 24, altura: 12, formato: "svg" });
  });

  it("svg: unidade relativa cai no viewBox", () => {
    expect(dimensoesDaImagem(Buffer.from('<svg width="100%" height="2em" viewBox="0 0 48.4 24">'))).toEqual({ largura: 48, altura: 24, formato: "svg" });
  });

  it("svg sem dimensões nem viewBox → null", () => {
    expect(dimensoesDaImagem(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><g/></svg>'))).toBeNull();
  });

  it("formato desconhecido, truncado ou com dimensão zero → null", () => {
    expect(dimensoesDaImagem(Buffer.from("BM\0\0\0\0"))).toBeNull();
    expect(dimensoesDaImagem(png(10, 10).subarray(0, 20))).toBeNull();
    expect(dimensoesDaImagem(jpeg(10, 10).subarray(0, 25))).toBeNull();
    expect(dimensoesDaImagem(png(0, 10))).toBeNull();
    expect(dimensoesDaImagem(Buffer.alloc(0))).toBeNull();
  });
});
