import { describe, expect, it } from "vitest";

import {
  matchInfra,
  normalizeHost,
  normalizeList,
  parseLines,
} from "../../src/triage/normalize.js";

describe("parseLines", () => {
  it("remove linhas vazias, espaços e comentários, preservando a ordem", () => {
    const texto = "  access.ufrn.br \n\n# comentário\nacervo.ufrn.br\n";
    expect(parseLines(texto)).toEqual(["access.ufrn.br", "acervo.ufrn.br"]);
  });
});

describe("normalizeHost", () => {
  it("normaliza caixa e espaços", () => {
    expect(normalizeHost("  Access.UFRN.br ")).toBe("access.ufrn.br");
  });

  it("remove o www. inicial", () => {
    expect(normalizeHost("www.cb.ufrn.br")).toBe("cb.ufrn.br");
  });

  it("mapeia .ufrn.edu.br para .ufrn.br", () => {
    expect(normalizeHost("sistemas.ufrn.edu.br")).toBe("sistemas.ufrn.br");
    expect(normalizeHost("ufrn.edu.br")).toBe("ufrn.br");
  });

  it("corrige sufixo registrável duplicado (caso real da lista)", () => {
    expect(normalizeHost("www.cbeqimat.ufrn.br.ufrn.br")).toBe("cbeqimat.ufrn.br");
  });

  it("remove esquema, porta e caminho se vierem numa URL", () => {
    expect(normalizeHost("https://portal.ufrn.br:443/index")).toBe("portal.ufrn.br");
  });
});

describe("matchInfra", () => {
  it("casa rótulos de infraestrutura e homologação", () => {
    expect(matchInfra("dns.ufrn.br")).toBe("dns");
    expect(matchInfra("ldap.ufrn.br")).toBe("ldap");
    expect(matchInfra("grafana.ufrn.br")).toBe("grafana");
    expect(matchInfra("hml.sigaa.ufrn.br")).toBe("hml");
  });

  it("casa rótulo com sufixo numérico (api2, ns1)", () => {
    expect(matchInfra("api.ufrn.br")).toBe("api");
    expect(matchInfra("api2.ufrn.br")).toBe("api");
    expect(matchInfra("ns1.ufrn.br")).toBe("ns");
  });

  it("casa rótulos hifenizados de homologação/teste (ADR 002)", () => {
    expect(matchInfra("hml-smartenergy.imd.ufrn.br")).toBe("hml");
    expect(matchInfra("teste-ipv6.ufrn.br")).toBe("teste");
    expect(matchInfra("test-redes.cb.ufrn.br")).toBe("test");
  });

  it("casa serviços de infraestrutura/dev acrescentados", () => {
    expect(matchInfra("ftp.ufrn.br")).toBe("ftp");
    expect(matchInfra("git.ct.ufrn.br")).toBe("git");
    expect(matchInfra("ssh.lar.ect.ufrn.br")).toBe("ssh");
  });

  it("NÃO casa nomes que apenas contêm o padrão como substring", () => {
    // `apito` contém "api" mas não é infraestrutura — não pode ser descartado.
    expect(matchInfra("apito.ufrn.br")).toBeNull();
    expect(matchInfra("acervo.ufrn.br")).toBeNull();
    expect(matchInfra("desenvolvimento.ufrn.br")).toBeNull();
  });

  it("não considera o domínio registrável nu como infraestrutura", () => {
    expect(matchInfra("ufrn.br")).toBeNull();
  });
});

describe("normalizeList (funil)", () => {
  it("conta linhas, únicos, unificados e após filtro", () => {
    const lines = [
      "access.ufrn.br", // mantido
      "ACCESS.ufrn.br", // duplicata exata (case) → únicos--
      "www.access.ufrn.br", // unifica em access.ufrn.br → unificados--
      "acervo.ufrn.edu.br", // mantido (edu.br → br)
      "api.ufrn.br", // descartado (infra)
      "api2.ufrn.br", // descartado (infra)
    ];
    const { rows, funnel } = normalizeList(lines);

    expect(funnel.linhas).toBe(6);
    expect(funnel.unicos).toBe(5); // -1 duplicata exata
    expect(funnel.unificados).toBe(4); // -1 unificação www
    expect(funnel.aposFiltro).toBe(2); // -2 infra (api, api2); sobram access, acervo

    expect(rows[1]).toMatchObject({ situacao: "unificado", detalhe: "access.ufrn.br" });
    expect(rows[2]).toMatchObject({ situacao: "unificado", detalhe: "access.ufrn.br" });
    expect(rows[3]).toMatchObject({ hostNormalizado: "acervo.ufrn.br", situacao: "mantido" });
    expect(rows[4]).toMatchObject({ situacao: "descartado", motivo: "infra", detalhe: "api" });
    expect(rows[5]).toMatchObject({ situacao: "descartado", motivo: "infra", detalhe: "api" });
  });

  it("emite exatamente uma linha por entrada", () => {
    const lines = ["a.ufrn.br", "www.a.ufrn.br", "dns.ufrn.br"];
    const { rows } = normalizeList(lines);
    expect(rows).toHaveLength(3);
  });
});
