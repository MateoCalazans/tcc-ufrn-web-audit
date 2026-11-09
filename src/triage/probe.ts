/**
 * Sondagem de triagem (módulo 0, S03). Para cada host normalizado (da S02):
 * resolve DNS, tenta `https://` e cai para `http://`, segue redirects
 * registrando a cadeia, checa status/Content-Type, lê `robots.txt` e detecta
 * login e página padrão. Aplica os critérios do **ADR 002**.
 *
 * A lógica de decisão é separada em funções **puras** (`classifyResponse`,
 * `detectLogin`, `detectDefaultPage`, `isHtmlContentType`, `parseRobots`,
 * `robotsAllows`) — testáveis sem rede. A parte com IO (`probeHost`) recebe as
 * dependências (`ProbeDeps`) por injeção, para os testes simularem respostas.
 */

import { lookup } from "node:dns/promises";

import { Agent, fetch as undiciFetch } from "undici";

import { buildUserAgent, defaultLimiter, DEFAULT_TIMEOUT_MS, type HostLimiter } from "../shared/http.js";
import type { ExclusionReason } from "../shared/types.js";

/** Token de produto do nosso User-Agent, para casar grupos do robots.txt. */
export const USER_AGENT_TOKEN = "tcc-eaj-ufrn-audit";

/** Nº máximo de redirects seguidos antes de desistir (evita laços). */
export const MAX_REDIRECTS = 10;

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Resposta de um único hop HTTP (redirect tratado manualmente por quem chama). */
export interface SingleResponse {
  /** URL efetivamente requisitada neste hop. */
  url: string;
  status: number;
  /** Header `Location` (resolvido ou não), ou `null` se ausente. */
  location: string | null;
  /** Valor de `Content-Type` (com charset), ou `undefined` se ausente. */
  contentType: string | undefined;
  body: string;
}

/** Um salto da cadeia de redirects. */
export interface RedirectHop {
  from: string;
  to: string;
  status: number;
}

/** Veredito da sondagem de um host (uma linha de `probed.csv`). */
export interface ProbeResult {
  /** Host normalizado de entrada. */
  host: string;
  urlFinal: string | null;
  status: number | null;
  scheme: "https" | "http" | null;
  redirectChain: RedirectHop[];
  incluido: boolean;
  motivoExclusao: ExclusionReason | null;
  /** Evidência/detalhe do veredito (código HTTP, sinal de login, etc.). */
  detalhe: string;
  /**
   * HTML da página final, **só para incluídos** (S04: insumo da classificação,
   * sem nova requisição). `null` para excluídos — inclusive por robots, cujo
   * HTML não é guardado.
   */
  html: string | null;
  /**
   * Problema de certificado contornado para ler a página (ex.: `cert-expirado`),
   * ou `""` se o TLS estava válido / o site foi lido por http. O site continua
   * **incluído**: o conteúdo é público e o navegador permite acessá-lo.
   */
  tlsInvalido: string;
}

export interface RequestOptions {
  /** Aceita certificado inválido (só usado após uma falha de certificado). */
  insecure?: boolean;
}

/** Dependências de IO injetáveis (reais em produção, simuladas nos testes). */
export interface ProbeDeps {
  /** Resolve `true` se o host tem registro DNS; `false` caso contrário. */
  resolveDns(host: string): Promise<boolean>;
  /** Faz **um** hop HTTP (sem seguir redirects). Lança em timeout/erro de rede. */
  request(url: string, options?: RequestOptions): Promise<SingleResponse>;
}

/** Erro de timeout, distinguido de erros de conexão para o motivo de exclusão. */
export class TimeoutError extends Error {
  constructor(message = "timeout") {
    super(message);
    this.name = "TimeoutError";
  }
}

// ---------------------------------------------------------------------------
// Funções puras de decisão
// ---------------------------------------------------------------------------

/** `true` se o Content-Type é HTML (ou ausente, mas o corpo parece HTML). */
export function isHtmlContentType(contentType: string | undefined, body = ""): boolean {
  if (contentType) {
    return /^\s*text\/html\b/i.test(contentType) || /\bapplication\/xhtml\+xml\b/i.test(contentType);
  }
  // Sem Content-Type: aceita se o corpo começar como HTML.
  return /^\s*<(?:!doctype\s+html|html|\?xml)/i.test(body);
}

/**
 * Detecta página de autenticação (motivo `login`): sistemas institucionais
 * conhecidos no host/caminho (SIGAA/SIPAC/SIGRH/CAS/IdP) ou formulário com
 * campo de senha. Devolve o sinal casado, ou `null`.
 */
export function detectLogin(finalUrl: string, body: string): string | null {
  let urlLower = finalUrl.toLowerCase();
  try {
    const u = new URL(finalUrl);
    urlLower = `${u.host}${u.pathname}${u.search}`.toLowerCase();
  } catch {
    // mantém a string crua se não for uma URL válida
  }
  const sistemas = ["sigaa", "sipac", "sigrh", "sigadmin", "sigeleicao", "/cas/", "idp", "autenticacao"];
  for (const s of sistemas) {
    if (urlLower.includes(s)) return s.replace(/\//g, "");
  }
  if (/\blogin\b/.test(urlLower) || urlLower.includes("/auth")) return "login-na-url";
  if (/<input[^>]+type\s*=\s*["']?password\b/i.test(body)) return "campo-de-senha";
  return null;
}

/**
 * Detecta páginas padrão de servidor (motivo `pagina-padrao`): Apache, Nginx,
 * IIS. Devolve o rótulo da página casada, ou `null`.
 */
export function detectDefaultPage(body: string): string | null {
  const assinaturas: Array<[RegExp, string]> = [
    [/it works!/i, "apache-it-works"],
    [/apache2?\s+(?:debian|ubuntu)\s+default\s+page/i, "apache-default"],
    [/test page for the (?:apache|nginx)/i, "test-page"],
    [/welcome to nginx!/i, "nginx-default"],
    [/\bIIS\b[^<]*(?:Windows\s+Server|start page)/i, "iis-default"],
    [/this is the default (?:web|welcome) page/i, "default-web-page"],
  ];
  for (const [re, rotulo] of assinaturas) {
    if (re.test(body)) return rotulo;
  }
  return null;
}

/**
 * Classifica a resposta **terminal** (já seguidos os redirects) segundo o
 * ADR 002. Não checa robots.txt (precisa de outra requisição — feito em
 * `probeHost`) nem duplicata-redirect (precisa do lote — feito no runner).
 */
export function classifyResponse(params: {
  finalUrl: string;
  status: number;
  contentType: string | undefined;
  body: string;
}): { incluido: boolean; motivo: ExclusionReason | null; detalhe: string } {
  const { finalUrl, status, contentType, body } = params;

  if (status >= 400 && status < 500) return excluded("4xx", String(status));
  if (status >= 500) return excluded("5xx", String(status));
  // Qualquer coisa que não seja 2xx após seguir redirects é tratada como erro.
  if (status < 200 || status >= 300) return excluded("4xx", `status inesperado ${status}`);

  if (!isHtmlContentType(contentType, body)) {
    return excluded("nao-html", contentType ?? "(sem content-type)");
  }

  const login = detectLogin(finalUrl, body);
  if (login !== null) return excluded("login", login);

  const padrao = detectDefaultPage(body);
  if (padrao !== null) return excluded("pagina-padrao", padrao);

  return { incluido: true, motivo: null, detalhe: "" };
}

function excluded(motivo: ExclusionReason, detalhe: string) {
  return { incluido: false, motivo, detalhe };
}

/**
 * Decodifica o corpo respeitando o charset declarado (header `Content-Type`,
 * senão `<meta charset>`/`http-equiv` nos primeiros 2 KB); padrão UTF-8.
 * Sem isso, páginas ISO-8859-1 viram "PÃ³s-Graduação" e quebram a heurística
 * de título da classificação (S04). Charset desconhecido → UTF-8.
 */
export function decodeBody(bytes: Uint8Array, contentType: string | undefined): string {
  let charset = /charset\s*=\s*["']?([\w-]+)/i.exec(contentType ?? "")?.[1];
  if (charset === undefined) {
    const head = new TextDecoder("latin1").decode(bytes.subarray(0, 2048));
    charset = /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(head)?.[1];
  }
  try {
    return new TextDecoder(charset ?? "utf-8").decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

// ---------------------------------------------------------------------------
// Causa de falhas de rede
// ---------------------------------------------------------------------------

/** Códigos de erro TLS de certificado → rótulo da causa. */
const CAUSAS_CERT: Record<string, string> = {
  CERT_HAS_EXPIRED: "cert-expirado",
  CERT_NOT_YET_VALID: "cert-ainda-nao-valido",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: "cert-cadeia-incompleta",
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY: "cert-cadeia-incompleta",
  UNABLE_TO_GET_ISSUER_CERT: "cert-cadeia-incompleta",
  DEPTH_ZERO_SELF_SIGNED_CERT: "cert-autoassinado",
  SELF_SIGNED_CERT_IN_CHAIN: "cert-autoassinado",
  ERR_TLS_CERT_ALTNAME_INVALID: "cert-nome-divergente",
};

/** Códigos de erro de conexão → rótulo da causa. */
const CAUSAS_REDE: Record<string, string> = {
  UND_ERR_CONNECT_TIMEOUT: "connect-timeout",
  ETIMEDOUT: "connect-timeout",
  ECONNREFUSED: "conexao-recusada",
  ECONNRESET: "conexao-fechada",
  UND_ERR_SOCKET: "conexao-fechada",
  EHOSTUNREACH: "host-inalcancavel",
  ENETUNREACH: "rede-inalcancavel",
  ENOTFOUND: "dns",
  EAI_AGAIN: "dns",
};

/**
 * Traduz um erro de requisição na **causa** gravada no CSV, para auditar cada
 * exclusão URL por URL (antes ficava só "fetch failed"). `cert = true` quando
 * a falha é de certificado: o servidor respondeu, mas o TLS foi recusado.
 */
export function describeFetchError(err: unknown): { causa: string; cert: boolean } {
  if (err instanceof TimeoutError) return { causa: err.message, cert: false };
  // undici embrulha a causa real em `err.cause` (às vezes em dois níveis).
  let atual: unknown = err;
  for (let i = 0; i < 3 && atual !== null && typeof atual === "object"; i++) {
    const code = (atual as { code?: unknown }).code;
    if (typeof code === "string") {
      if (code in CAUSAS_CERT) return { causa: CAUSAS_CERT[code]!, cert: true };
      if (code in CAUSAS_REDE) return { causa: CAUSAS_REDE[code]!, cert: false };
      return { causa: `outro:${code}`, cert: false };
    }
    atual = (atual as { cause?: unknown }).cause;
  }
  return { causa: `outro:${(err as Error)?.message ?? String(err)}`, cert: false };
}

// ---------------------------------------------------------------------------
// robots.txt
// ---------------------------------------------------------------------------

export interface RobotsRule {
  allow: boolean;
  path: string;
}

/** Um grupo `User-agent` do robots.txt com suas regras. */
export interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
}

/**
 * Faz o parsing de um `robots.txt` em grupos. Simples, mas suficiente para o
 * alvo: agrupa linhas `User-agent` consecutivas e as regras `Allow`/`Disallow`
 * que as seguem; ignora comentários e diretivas não suportadas.
 */
export function parseRobots(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let esperandoAgente = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (line === "") continue;
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const field = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();

    if (field === "user-agent") {
      if (current === null || !esperandoAgente) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      esperandoAgente = true;
    } else if (field === "allow" || field === "disallow") {
      if (current === null) {
        current = { agents: ["*"], rules: [] };
        groups.push(current);
      }
      current.rules.push({ allow: field === "allow", path: value });
      esperandoAgente = false;
    } else {
      esperandoAgente = false;
    }
  }
  return groups;
}

/**
 * Decide se `path` é permitido ao nosso User-Agent segundo os grupos do
 * robots.txt. Escolhe o grupo mais específico (nosso token vence `*`) e aplica
 * a regra de **correspondência mais longa**; empate resolve a favor de `Allow`.
 * Sem regra aplicável → permitido.
 */
export function robotsAllows(
  groups: RobotsGroup[],
  path: string,
  userAgentToken = USER_AGENT_TOKEN,
): boolean {
  const ua = userAgentToken.toLowerCase();

  let especificas: RobotsRule[] | null = null;
  let curinga: RobotsRule[] | null = null;
  for (const g of groups) {
    for (const agent of g.agents) {
      if (agent === "*") {
        curinga = [...(curinga ?? []), ...g.rules];
      } else if (ua.startsWith(agent) || agent.startsWith(ua)) {
        especificas = [...(especificas ?? []), ...g.rules];
      }
    }
  }
  const rules = especificas ?? curinga;
  if (rules === null || rules.length === 0) return true;

  let melhor: RobotsRule | null = null;
  for (const r of rules) {
    // `Disallow:` vazio = permite tudo; não restringe.
    if (!r.allow && r.path === "") continue;
    if (matchesRobotsPath(r.path, path)) {
      if (melhor === null || r.path.length > melhor.path.length) {
        melhor = r;
      } else if (r.path.length === melhor.path.length && r.allow) {
        melhor = r; // empate favorece Allow
      }
    }
  }
  return melhor === null ? true : melhor.allow;
}

/** Correspondência de caminho do robots.txt com `*` e `$` (suporte básico). */
function matchesRobotsPath(pattern: string, path: string): boolean {
  if (pattern === "") return false;
  if (!pattern.includes("*") && !pattern.includes("$")) {
    return path.startsWith(pattern);
  }
  const anchoredEnd = pattern.endsWith("$");
  const body = anchoredEnd ? pattern.slice(0, -1) : pattern;
  const escaped = body.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}${anchoredEnd ? "$" : ""}`).test(path);
}

// ---------------------------------------------------------------------------
// Sondagem com IO (deps injetáveis)
// ---------------------------------------------------------------------------

/** Segue redirects manualmente a partir de `startUrl`, registrando a cadeia. */
async function follow(
  startUrl: string,
  deps: ProbeDeps,
  options: RequestOptions,
): Promise<{ resp: SingleResponse; chain: RedirectHop[] }> {
  let url = startUrl;
  const chain: RedirectHop[] = [];
  const visitados = new Set<string>([url]);

  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    let resp: SingleResponse;
    try {
      resp = await deps.request(url, options);
    } catch (err) {
      // Falha num destino de redirect: anota a URL, para o `detalhe` mostrar
      // onde quebrou (ex.: redirect para um host que não existe no DNS).
      if (url !== startUrl && err !== null && typeof err === "object") {
        (err as { urlFalha?: string }).urlFalha = url;
      }
      throw err;
    }
    const isRedirect = resp.status >= 300 && resp.status < 400 && resp.location !== null;
    if (!isRedirect) return { resp, chain };

    const next = new URL(resp.location as string, url).toString();
    chain.push({ from: url, to: next, status: resp.status });
    if (visitados.has(next)) {
      // Laço de redirect (ex.: http↔https): site quebrado, tratado como queda.
      throw new TimeoutError("redirect-loop");
    }
    visitados.add(next);
    url = next;
  }
  throw new TimeoutError("redirect-loop"); // excesso de redirects → tratado como queda
}

/** Checa o `robots.txt` da origem final; indisponível ou erro → não proíbe. */
async function checkRobots(
  finalUrl: string,
  deps: ProbeDeps,
  options: RequestOptions,
): Promise<{ allowed: boolean; detalhe: string }> {
  let origin: string;
  try {
    origin = new URL(finalUrl).origin;
  } catch {
    return { allowed: true, detalhe: "" };
  }
  try {
    const resp = await deps.request(`${origin}/robots.txt`, options);
    if (resp.status !== 200 || resp.body.trim() === "") {
      return { allowed: true, detalhe: "" };
    }
    const allowed = robotsAllows(parseRobots(resp.body), "/");
    return { allowed, detalhe: allowed ? "" : "robots proíbe /" };
  } catch {
    return { allowed: true, detalhe: "" };
  }
}

function excludedResult(
  host: string,
  motivo: ExclusionReason,
  detalhe: string,
): ProbeResult {
  return {
    host,
    urlFinal: null,
    status: null,
    scheme: null,
    redirectChain: [],
    incluido: false,
    motivoExclusao: motivo,
    detalhe,
    html: null,
    tlsInvalido: "",
  };
}

/**
 * Sonda um host: DNS → `https://` (com fallback para `http://`) → redirects →
 * classificação → robots. Nunca lança: todo erro vira um `ProbeResult` com
 * motivo de exclusão (o lote não pode ser derrubado por um site).
 *
 * **Certificado inválido** (expirado, cadeia incompleta, autoassinado…): o
 * servidor respondeu e o navegador deixa o usuário seguir, então o site não
 * está fora do ar. A partir da primeira falha de certificado, as tentativas
 * seguintes (inclusive redirects e robots) aceitam o certificado, e a causa
 * fica registrada em `tlsInvalido`.
 *
 * Em falha de rede, `detalhe` grava a **causa** de cada esquema tentado (ex.:
 * `https: connect-timeout; http: connect-timeout`), para revisão URL por URL.
 */
export async function probeHost(host: string, deps: ProbeDeps): Promise<ProbeResult> {
  let resolved: boolean;
  try {
    resolved = await deps.resolveDns(host);
  } catch {
    resolved = false;
  }
  if (!resolved) return excludedResult(host, "dns", "não resolve");

  // Tentativas em ordem; uma falha de certificado insere um retry inseguro do
  // mesmo esquema antes de seguir para o próximo.
  const fila: Array<{ scheme: "https" | "http"; insecure: boolean }> = [
    { scheme: "https", insecure: false },
    { scheme: "http", insecure: false },
  ];
  const causas: string[] = [];
  let tlsInvalido = "";

  while (fila.length > 0) {
    const { scheme, insecure } = fila.shift()!;
    const startUrl = `${scheme}://${host}/`;
    try {
      const { resp, chain } = await follow(startUrl, deps, { insecure });
      const verdict = classifyResponse({
        finalUrl: resp.url,
        status: resp.status,
        contentType: resp.contentType,
        body: resp.body,
      });

      let { incluido, motivo, detalhe } = verdict;
      if (incluido) {
        const robots = await checkRobots(resp.url, deps, { insecure });
        if (!robots.allowed) {
          incluido = false;
          motivo = "robots";
          detalhe = robots.detalhe;
        }
      }

      return {
        host,
        urlFinal: resp.url,
        status: resp.status,
        scheme,
        redirectChain: chain,
        incluido,
        motivoExclusao: motivo,
        detalhe,
        html: incluido ? resp.body : null,
        tlsInvalido: insecure ? tlsInvalido : "",
      };
    } catch (err) {
      const { causa, cert } = describeFetchError(err);
      const urlFalha = (err as { urlFalha?: string } | null)?.urlFalha;
      causas.push(
        `${scheme}${insecure ? " (sem verificar cert)" : ""}: ${causa}${urlFalha ? ` em ${urlFalha}` : ""}`,
      );
      if (cert && !insecure) {
        // Falha de certificado (inclusive num redirect http→https): repete o
        // mesmo esquema aceitando o certificado, e as tentativas seguintes também.
        tlsInvalido = causa;
        for (const t of fila) t.insecure = true;
        fila.unshift({ scheme, insecure: true });
      }
    }
  }

  // Todos os esquemas falharam: site fora do ar na data da triagem (ADR 002).
  return excludedResult(host, "timeout", causas.join("; "));
}

// ---------------------------------------------------------------------------
// Dependências reais (rede)
// ---------------------------------------------------------------------------

/** Tempo extra, além do timeout de conexão, para a resposta completa chegar. */
export const RESPONSE_MARGIN_MS = 5_000;

export interface RealProbeDepsOptions {
  timeoutMs?: number;
  limiter?: HostLimiter;
}

/**
 * Monta as `ProbeDeps` reais: DNS do SO + `undici` com limitador e User-Agent.
 * O timeout de **conexão** do undici é alinhado ao nosso (`timeoutMs`): o
 * padrão dele (10 s) era menor e cortava servidores lentos antes da hora.
 */
export function createRealProbeDeps(options: RealProbeDepsOptions = {}): ProbeDeps {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const limiter = options.limiter ?? defaultLimiter;
  const userAgent = buildUserAgent();
  const seguro = new Agent({ connect: { timeout: timeoutMs } });
  const inseguro = new Agent({ connect: { timeout: timeoutMs, rejectUnauthorized: false } });

  return {
    async resolveDns(host: string): Promise<boolean> {
      try {
        await lookup(host);
        return true;
      } catch {
        return false;
      }
    },

    async request(url: string, opts: RequestOptions = {}): Promise<SingleResponse> {
      const host = new URL(url).host;
      return limiter.schedule(host, async () => {
        const controller = new AbortController();
        // Margem sobre o timeout de conexão: assim uma conexão nunca aceita
        // sai como `connect-timeout`, e só uma resposta lenta vira `timeout`.
        const timer = setTimeout(() => controller.abort(), timeoutMs + RESPONSE_MARGIN_MS);
        try {
          const res = await undiciFetch(url, {
            redirect: "manual",
            signal: controller.signal,
            headers: { "User-Agent": userAgent },
            dispatcher: opts.insecure ? inseguro : seguro,
          });
          const status = res.status;
          const isRedirect = status >= 300 && status < 400;
          const contentType = res.headers.get("content-type") ?? undefined;
          // Não baixa o corpo em redirects (economia; o Location basta).
          const body = isRedirect ? "" : decodeBody(new Uint8Array(await res.arrayBuffer()), contentType);
          return {
            url,
            status,
            location: res.headers.get("location"),
            contentType,
            body,
          };
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") {
            throw new TimeoutError();
          }
          throw err;
        } finally {
          clearTimeout(timer);
        }
      });
    },
  };
}
