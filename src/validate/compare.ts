import type { Page } from "playwright";

/**
 * Comparação pixel a pixel de dois PNG, feita dentro do navegador (sem
 * dependência nova). Saiu do `scripts/landmarks-validacao.ts` (S16) para ser
 * reaproveitada na verificação da cópia local (S17).
 *
 * A página precisa ter `globalThis.__name` definido (`prepararComparador`):
 * o tsx (esbuild, keepNames) envolve funções internas em `__name(...)`.
 */
export interface Comparacao {
  tamanhoA: number[];
  tamanhoB: number[];
  /** Pixels com algum canal diferente; `null` se os tamanhos diferem. */
  diferentes: number | null;
  proporcao: number | null;
}

export async function prepararComparador(page: Page): Promise<void> {
  await page.evaluate("globalThis.__name = (f) => f");
}

export async function compararPng(page: Page, a: Buffer, b: Buffer): Promise<Comparacao> {
  return page.evaluate(
    async ([x, y]) => {
      // Roda no navegador; o tsconfig do projeto não carrega os tipos do DOM.
      const g = globalThis as unknown as {
        createImageBitmap(b: Blob): Promise<{ width: number; height: number }>;
        OffscreenCanvas: new (w: number, h: number) => {
          getContext(t: "2d"): { drawImage(i: unknown, x: number, y: number): void; getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray } } | null;
        };
      };
      const ler = async (b64: string) => {
        const bmp = await g.createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
        const c = new g.OffscreenCanvas(bmp.width, bmp.height);
        const ctx = c.getContext("2d")!;
        ctx.drawImage(bmp, 0, 0);
        return { w: bmp.width, h: bmp.height, d: ctx.getImageData(0, 0, bmp.width, bmp.height).data };
      };
      const [p, q] = [await ler(x), await ler(y)];
      if (p.w !== q.w || p.h !== q.h) return { tamanhoA: [p.w, p.h], tamanhoB: [q.w, q.h], diferentes: null, proporcao: null };
      let n = 0;
      for (let i = 0; i < p.d.length; i += 4) {
        if (p.d[i] !== q.d[i] || p.d[i + 1] !== q.d[i + 1] || p.d[i + 2] !== q.d[i + 2] || p.d[i + 3] !== q.d[i + 3]) n++;
      }
      return { tamanhoA: [p.w, p.h], tamanhoB: [q.w, q.h], diferentes: n, proporcao: n / (p.w * p.h) };
    },
    [a.toString("base64"), b.toString("base64")] as const,
  );
}
