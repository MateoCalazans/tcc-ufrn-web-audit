import { describe, expect, it } from "vitest";

import {
  classifyResponse,
  detectDefaultPage,
  detectLogin,
  isHtmlContentType,
  parseRobots,
  probeHost,
  robotsAllows,
  TimeoutError,
  type ProbeDeps,
  type SingleResponse,
} from "../../src/triage/probe.js";

// ---------------------------------------------------------------------------
// Funções puras de decisão
// ---------------------------------------------------------------------------

describe("isHtmlContentType", () => {
  it("aceita text/html com charset e xhtml", () => {
    expect(isHtmlContentType("text/html; charset=utf-8")).toBe(true);
    expect(isHtmlContentType("application/xhtml+xml")).toBe(true);
  });

  it("rejeita tipos não-HTML", () => {
    expect(isHtmlContentType("application/pdf")).toBe(false);
    expect(isHtmlContentType("application/json")).toBe(false);
  });

  it("sem content-type, decide pelo corpo", () => {
    expect(isHtmlContentType(undefined, "<!doctype html><html>")).toBe(true);
    expect(isHtmlContentType(undefined, "{\"a\":1}")).toBe(false);
  });
});

describe("detectLogin", () => {
  it("detecta sistemas institucionais pela URL", () => {
    expect(detectLogin("https://sigaa.ufrn.br/sigaa/", "")).toBe("sigaa");
    expect(detectLogin("https://auth.ufrn.br/cas/login", "")).toBe("cas");
  });

  it("detecta campo de senha no HTML", () => {
    expect(detectLogin("https://x.ufrn.br/", '<input type="password" name="pwd">')).toBe(
      "campo-de-senha",
    );
  });

  it("não acusa páginas comuns", () => {
    expect(detectLogin("https://cb.ufrn.br/", "<html><body>Bem-vindo</body></html>")).toBeNull();
  });
});

describe("detectDefaultPage", () => {
  it("reconhece páginas padrão de servidor", () => {
    expect(detectDefaultPage("<html><body><h1>It works!</h1></body></html>")).toBe(
      "apache-it-works",
    );
    expect(detectDefaultPage("Welcome to nginx!")).toBe("nginx-default");
  });

  it("não acusa páginas de conteúdo", () => {
    expect(detectDefaultPage("<html><body>Departamento de Computação</body></html>")).toBeNull();
  });
});

describe("classifyResponse", () => {
  const html = "text/html";
  const body = "<html><body>conteúdo institucional</body></html>";

  it("inclui 200 HTML de conteúdo", () => {
    const r = classifyResponse({ finalUrl: "https://cb.ufrn.br/", status: 200, contentType: html, body });
    expect(r.incluido).toBe(true);
    expect(r.motivo).toBeNull();
  });

  it("exclui 4xx e 5xx", () => {
    expect(classifyResponse({ finalUrl: "https://x.ufrn.br/", status: 404, contentType: html, body }).motivo).toBe("4xx");
    expect(classifyResponse({ finalUrl: "https://x.ufrn.br/", status: 503, contentType: html, body }).motivo).toBe("5xx");
  });

  it("exclui não-HTML", () => {
    const r = classifyResponse({ finalUrl: "https://x.ufrn.br/", status: 200, contentType: "application/pdf", body: "%PDF" });
    expect(r.motivo).toBe("nao-html");
  });

  it("exclui login antes de incluir", () => {
    const r = classifyResponse({ finalUrl: "https://sigaa.ufrn.br/", status: 200, contentType: html, body });
    expect(r.motivo).toBe("login");
  });

  it("exclui página padrão", () => {
    const r = classifyResponse({ finalUrl: "https://x.ufrn.br/", status: 200, contentType: html, body: "<h1>It works!</h1>" });
    expect(r.motivo).toBe("pagina-padrao");
  });
});

describe("parseRobots + robotsAllows", () => {
  it("permite quando não há regra", () => {
    expect(robotsAllows(parseRobots("User-agent: *\nDisallow:"), "/")).toBe(true);
  });

  it("bloqueia Disallow: / para o curinga", () => {
    expect(robotsAllows(parseRobots("User-agent: *\nDisallow: /"), "/")).toBe(false);
  });

  it("grupo específico vence o curinga", () => {
    const txt = "User-agent: *\nDisallow: /\n\nUser-agent: tcc-eaj-ufrn-audit\nAllow: /";
    expect(robotsAllows(parseRobots(txt), "/")).toBe(true);
  });

  it("aplica correspondência mais longa", () => {
    const txt = "User-agent: *\nDisallow: /\nAllow: /publico";
    expect(robotsAllows(parseRobots(txt), "/publico/pagina")).toBe(true);
    expect(robotsAllows(parseRobots(txt), "/privado")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// probeHost com dependências simuladas (sem rede)
// ---------------------------------------------------------------------------

/** Monta `ProbeDeps` a partir de um mapa URL→resposta e um conjunto de hosts DNS. */
function fakeDeps(
  respostas: Record<string, SingleResponse | (() => never)>,
  dnsOk: (host: string) => boolean = () => true,
): ProbeDeps {
  return {
    async resolveDns(host) {
      return dnsOk(host);
    },
    async request(url) {
      const r = respostas[url];
      if (r === undefined) throw new TimeoutError(); // URL não mapeada = sem resposta
      if (typeof r === "function") return r();
      return r;
    },
  };
}

function resp(partial: Partial<SingleResponse> & { url: string; status: number }): SingleResponse {
  return {
    location: null,
    contentType: "text/html",
    body: "<html><body>conteúdo</body></html>",
    ...partial,
  };
}

describe("probeHost", () => {
  it("inclui um host 200 HTML sem robots", async () => {
    const deps = fakeDeps({
      "https://cb.ufrn.br/": resp({ url: "https://cb.ufrn.br/", status: 200 }),
      "https://cb.ufrn.br/robots.txt": resp({ url: "https://cb.ufrn.br/robots.txt", status: 404, body: "" }),
    });
    const r = await probeHost("cb.ufrn.br", deps);
    expect(r.incluido).toBe(true);
    expect(r.scheme).toBe("https");
    expect(r.status).toBe(200);
  });

  it("exclui por DNS quando não resolve", async () => {
    const deps = fakeDeps({}, () => false);
    const r = await probeHost("naoexiste.ufrn.br", deps);
    expect(r.incluido).toBe(false);
    expect(r.motivoExclusao).toBe("dns");
  });

  it("cai para http quando https falha", async () => {
    const deps = fakeDeps({
      "https://x.ufrn.br/": () => {
        throw new Error("ECONNREFUSED");
      },
      "http://x.ufrn.br/": resp({ url: "http://x.ufrn.br/", status: 200 }),
      "http://x.ufrn.br/robots.txt": resp({ url: "http://x.ufrn.br/robots.txt", status: 404, body: "" }),
    });
    const r = await probeHost("x.ufrn.br", deps);
    expect(r.incluido).toBe(true);
    expect(r.scheme).toBe("http");
  });

  it("exclui por timeout quando ambos os esquemas não respondem", async () => {
    const deps = fakeDeps({
      "https://x.ufrn.br/": () => {
        throw new TimeoutError();
      },
      "http://x.ufrn.br/": () => {
        throw new TimeoutError();
      },
    });
    const r = await probeHost("x.ufrn.br", deps);
    expect(r.motivoExclusao).toBe("timeout");
  });

  it("segue redirects e registra a cadeia", async () => {
    const deps = fakeDeps({
      "https://dept.ufrn.br/": resp({ url: "https://dept.ufrn.br/", status: 301, location: "https://novo.ufrn.br/" }),
      "https://novo.ufrn.br/": resp({ url: "https://novo.ufrn.br/", status: 200 }),
      "https://novo.ufrn.br/robots.txt": resp({ url: "https://novo.ufrn.br/robots.txt", status: 404, body: "" }),
    });
    const r = await probeHost("dept.ufrn.br", deps);
    expect(r.incluido).toBe(true);
    expect(r.urlFinal).toBe("https://novo.ufrn.br/");
    expect(r.redirectChain).toEqual([
      { from: "https://dept.ufrn.br/", to: "https://novo.ufrn.br/", status: 301 },
    ]);
  });

  it("exclui por robots quando a origem final proíbe /", async () => {
    const deps = fakeDeps({
      "https://x.ufrn.br/": resp({ url: "https://x.ufrn.br/", status: 200 }),
      "https://x.ufrn.br/robots.txt": resp({
        url: "https://x.ufrn.br/robots.txt",
        status: 200,
        contentType: "text/plain",
        body: "User-agent: *\nDisallow: /",
      }),
    });
    const r = await probeHost("x.ufrn.br", deps);
    expect(r.incluido).toBe(false);
    expect(r.motivoExclusao).toBe("robots");
  });
});
