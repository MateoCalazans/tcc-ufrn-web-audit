import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";

import { EASE, SplitText, gsap, reduzido } from "../movimento";

export type Carga<T> = { estado: "carregando" } | { estado: "ok"; dados: T } | { estado: "erro"; erro: string };

/** Carrega dados ao montar e quando `chave` muda; ignora respostas antigas. */
export function useCarga<T>(carregar: () => Promise<T>, chave: string): [Carga<T>, () => void] {
  const [carga, setCarga] = useState<Carga<T>>({ estado: "carregando" });
  const [rodada, setRodada] = useState(0);
  const atual = useRef(carregar);
  atual.current = carregar;
  useEffect(() => {
    let vivo = true;
    setCarga({ estado: "carregando" });
    atual.current().then(
      (dados) => vivo && setCarga({ estado: "ok", dados }),
      (e: unknown) => vivo && setCarga({ estado: "erro", erro: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      vivo = false;
    };
  }, [chave, rodada]);
  return [carga, () => setRodada((r) => r + 1)];
}

export function Carregando({ texto = "Carregando…" }: { texto?: string }) {
  return (
    <div role="status" className="esqueleto" data-carregando="">
      <span className="so-leitor">{texto}</span>
      <span className="esqueleto-linha" aria-hidden="true" />
      <span className="esqueleto-linha curta" aria-hidden="true" />
      <span className="esqueleto-bloco" aria-hidden="true" />
    </div>
  );
}

export function Erro({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="aviso aviso-erro">
      {children}
    </div>
  );
}

/**
 * Título principal da tela. Recebe o foco quando a tela muda, para o leitor de
 * tela anunciar a página nova (navegação sem recarregar). Ao entrar, as letras
 * sobem de dentro de uma máscara (SplitText); o leitor de tela lê o título
 * inteiro pelo `aria-label` que o SplitText põe no h1.
 */
export function TituloDaTela({ children, titulo }: { children: ReactNode; titulo: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    document.title = `${titulo} – Auditoria web UFRN`;
    ref.current?.focus({ preventScroll: true });
  }, [titulo]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || reduzido()) return;
    const ctx = gsap.context(() => {
      const partes = SplitText.create(el, { type: "words,chars", mask: "words", aria: "auto" });
      gsap.from(partes.chars, { yPercent: 115, duration: 0.9, ease: EASE, stagger: { each: 0.016 } });
    }, el);
    return () => ctx.revert();
  }, [titulo]);
  return (
    <h1 ref={ref} tabIndex={-1}>
      {children}
    </h1>
  );
}

/** Bloco de código com rolagem horizontal, alcançável pelo teclado. */
export function Codigo({ children, rotulo }: { children: ReactNode; rotulo: string }) {
  return (
    <pre className="codigo" tabIndex={0} role="region" aria-label={rotulo}>
      <code>{children}</code>
    </pre>
  );
}
