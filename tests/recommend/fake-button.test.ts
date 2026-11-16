import { describe, expect, it } from "vitest";

import { fakeButton } from "../../src/recommend/rules/fake-button.js";
import { ler, rodar } from "./comum.js";

describe("fake-button", () => {
  it("div/span com onclick, sem role e sem tabindex (ADR 011) → só recomendação", async () => {
    const html = ler("fake-button/interativos.html");
    const r = await rodar(fakeButton, html);
    expect(r.recommendations.map((x) => x.evidencia)).toEqual([
      '<div onclick="abrir()">',
      '<span onclick="fechar()" class="x">',
      '<div onclick="ir()" role=" ">', // a evidência normaliza espaços
    ]);
    expect(r.recommendations.every((x) => !x.correcaoAutomatica && x.dimensao === "semantica" && x.severidade === "media")).toBe(true);
    expect(r.recommendations[0]!.mensagem).toContain('<button type="button">');
    expect(r.fixedHtml).toBe(html);
  });
});
