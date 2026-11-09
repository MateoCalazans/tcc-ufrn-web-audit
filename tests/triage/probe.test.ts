import { describe, expect, it } from "vitest";

import {
  classifyResponse,
  decodeBody,
  describeFetchError,
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
    expect(r.html).toBeNull(); // HTML de site proibido por robots não é guardado
  });

  it("devolve o HTML final só para incluídos (insumo da classificação)", async () => {
    const deps = fakeDeps({
      "https://cb.ufrn.br/": resp({ url: "https://cb.ufrn.br/", status: 200, body: "<title>CB</title>" }),
      "https://cb.ufrn.br/robots.txt": resp({ url: "https://cb.ufrn.br/robots.txt", status: 404, body: "" }),
      "https://sigaa.ufrn.br/": resp({ url: "https://sigaa.ufrn.br/", status: 200 }),
    });
    expect((await probeHost("cb.ufrn.br", deps)).html).toBe("<title>CB</title>");
    expect((await probeHost("sigaa.ufrn.br", deps)).html).toBeNull();
  });
});

/** Erro no formato do undici: `TypeError("fetch failed")` com a causa em `cause`. */
function undiciErr(code: string): Error {
  const cause = Object.assign(new Error(code), { code });
  return Object.assign(new TypeError("fetch failed"), { cause });
}

describe("describeFetchError", () => {
  it.each([
    ["UND_ERR_CONNECT_TIMEOUT", "connect-timeout", false],
    ["ECONNREFUSED", "conexao-recusada", false],
    ["UND_ERR_SOCKET", "conexao-fechada", false],
    ["CERT_HAS_EXPIRED", "cert-expirado", true],
    ["UNABLE_TO_VERIFY_LEAF_SIGNATURE", "cert-cadeia-incompleta", true],
    ["DEPTH_ZERO_SELF_SIGNED_CERT", "cert-autoassinado", true],
    ["ERR_TLS_CERT_ALTNAME_INVALID", "cert-nome-divergente", true],
  ])("%s → %s", (code, causa, cert) => {
    expect(describeFetchError(undiciErr(code))).toEqual({ causa, cert });
  });

  it("código desconhecido e timeout próprio", () => {
    expect(describeFetchError(undiciErr("EWHATEVER")).causa).toBe("outro:EWHATEVER");
    expect(describeFetchError(new TimeoutError("redirect-loop"))).toEqual({ causa: "redirect-loop", cert: false });
  });
});

describe("probeHost — causas e certificado inválido", () => {
  /** Fake que distingue requisições seguras e inseguras (aceitando cert inválido). */
  function certDeps(seguro: Record<string, () => SingleResponse>, inseguro: Record<string, SingleResponse>): ProbeDeps {
    return {
      async resolveDns() {
        return true;
      },
      async request(url, opts) {
        if (opts?.insecure) {
          const r = inseguro[url];
          if (r === undefined) throw new TimeoutError();
          return r;
        }
        const f = seguro[url];
        if (f === undefined) throw undiciErr("UND_ERR_CONNECT_TIMEOUT");
        return f();
      },
    };
  }

  it("grava a causa de cada esquema quando tudo falha", async () => {
    const r = await probeHost("kraken.ufrn.br", certDeps({}, {}));
    expect(r.motivoExclusao).toBe("timeout");
    expect(r.detalhe).toBe("https: connect-timeout; http: connect-timeout");
  });

  it("cert expirado: inclui lendo sem verificar e marca tlsInvalido", async () => {
    const deps = certDeps(
      {
        "https://x.ufrn.br/": () => {
          throw undiciErr("CERT_HAS_EXPIRED");
        },
      },
      {
        "https://x.ufrn.br/": resp({ url: "https://x.ufrn.br/", status: 200 }),
        "https://x.ufrn.br/robots.txt": resp({ url: "https://x.ufrn.br/robots.txt", status: 404, body: "" }),
      },
    );
    const r = await probeHost("x.ufrn.br", deps);
    expect(r).toMatchObject({ incluido: true, scheme: "https", tlsInvalido: "cert-expirado" });
    expect(r.html).not.toBeNull();
  });

  it("cert inválido no destino de um redirect http→https também é contornado", async () => {
    const deps = certDeps(
      {
        "http://prometeu.ufrn.br/": () =>
          resp({ url: "http://prometeu.ufrn.br/", status: 301, location: "https://obeduc.ufrn.br/" }),
        "https://obeduc.ufrn.br/": () => {
          throw undiciErr("UNABLE_TO_VERIFY_LEAF_SIGNATURE");
        },
      },
      {
        "http://prometeu.ufrn.br/": resp({ url: "http://prometeu.ufrn.br/", status: 301, location: "https://obeduc.ufrn.br/" }),
        "https://obeduc.ufrn.br/": resp({ url: "https://obeduc.ufrn.br/", status: 200 }),
      },
    );
    const r = await probeHost("prometeu.ufrn.br", deps);
    expect(r).toMatchObject({
      incluido: true,
      scheme: "http",
      urlFinal: "https://obeduc.ufrn.br/",
      tlsInvalido: "cert-cadeia-incompleta",
    });
  });

  it("falha no destino de um redirect registra a URL onde quebrou", async () => {
    const deps = certDeps(
      {
        "https://evento.ct.ufrn.br/": () =>
          resp({ url: "https://evento.ct.ufrn.br/", status: 301, location: "https://api-boreas.ct.ufrn.br/" }),
        "http://evento.ct.ufrn.br/": () =>
          resp({ url: "http://evento.ct.ufrn.br/", status: 301, location: "https://api-boreas.ct.ufrn.br/" }),
        "https://api-boreas.ct.ufrn.br/": () => {
          throw undiciErr("ENOTFOUND");
        },
      },
      {},
    );
    const r = await probeHost("evento.ct.ufrn.br", deps);
    expect(r.motivoExclusao).toBe("timeout");
    expect(r.detalhe).toBe(
      "https: dns em https://api-boreas.ct.ufrn.br/; http: dns em https://api-boreas.ct.ufrn.br/",
    );
  });

  it("TLS válido não marca tlsInvalido", async () => {
    const deps = certDeps(
      {
        "https://cb.ufrn.br/": () => resp({ url: "https://cb.ufrn.br/", status: 200 }),
        "https://cb.ufrn.br/robots.txt": () => resp({ url: "https://cb.ufrn.br/robots.txt", status: 404, body: "" }),
      },
      {},
    );
    expect((await probeHost("cb.ufrn.br", deps)).tlsInvalido).toBe("");
  });
});

describe("decodeBody", () => {
  // "Pós" em ISO-8859-1: P=0x50, ó=0xF3, s=0x73
  const latin1 = new Uint8Array([0x50, 0xf3, 0x73]);

  it("usa o charset do Content-Type", () => {
    expect(decodeBody(latin1, "text/html; charset=ISO-8859-1")).toBe("Pós");
  });

  it("cai para o <meta charset> quando o header não declara", () => {
    const html = new Uint8Array([
      ...new TextEncoder().encode('<meta charset="iso-8859-1">'),
      ...latin1,
    ]);
    expect(decodeBody(html, "text/html")).toBe('<meta charset="iso-8859-1">Pós');
  });

  it("padrão UTF-8; charset inválido não lança", () => {
    const utf8 = new TextEncoder().encode("Pós");
    expect(decodeBody(utf8, undefined)).toBe("Pós");
    expect(decodeBody(utf8, "text/html; charset=nao-existe")).toBe("Pós");
  });
});
