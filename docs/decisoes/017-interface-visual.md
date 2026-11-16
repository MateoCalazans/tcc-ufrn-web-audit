# ADR 017 — Interface visual: análises avulsas, isolamento dos dados do TCC e uso só local

**Data:** 2026-11-16 · **Status:** proposto

## Contexto
O autor pediu (2026-11-16, Fase 7 do `docs/ROTEIRO.md`) uma interface para colar o link
de um site, da UFRN ou de qualquer outro, e ver métricas, problemas e recomendações. Ela
precisa reaproveitar o sistema existente. Há quatro restrições:

- **Código congelado.** A `v1.0` (S18) e a `v1.0.1-regras` (S18b) são o resultado do TCC.
  A interface não pode alterar a lógica dos módulos 0 a 4, sob pena de os resultados deixarem
  de corresponder ao código descrito no texto.
- **Dados do TCC.** `data/raw/` é imutável (regra 8). O `dataset.csv` e o `llm-runs.csv`
  são evidência versionada. Uma análise avulsa não pode entrar neles.
- **Ética da coleta.** As regras 1 a 5 do `CLAUDE.md` (2 hosts em paralelo, pausa de 2 s,
  User-Agent identificado, `robots.txt`, só páginas públicas, só a página inicial) foram
  pensadas para a UFRN. Uma interface que aceita qualquer URL as estende a terceiros.
- **Custo.** A regra `landmarks-llm` chama uma API paga, com teto de US$ 4,50 sobre o
  crédito de US$ 5 do autor (ADR 016). O TCC gastou US$ 0,0133 (`llm-runs.csv`, S19).

Levantamento no código (S20):

- Todos os módulos resolvem os caminhos de dados e de log a partir do diretório de trabalho
  (`data/corpus.csv`, `data/raw`, `data/processed`, `data/interim`, `logs`). O
  `package.json` é achado a partir do próprio arquivo-fonte (`src/shared/pkg.ts`).
- A normalização da triagem mantém domínios fora de `ufrn.br`. Num teste, `www.exemplo.com.br`
  saiu como `exemplo.com.br`, com situação `mantido`.
- O teto do `recommend` soma o `custo_usd` do `data/processed/llm-runs.csv` **do diretório
  de trabalho** e aceita `--teto-usd`.
- Dos 242 sites do corpus, só 24 têm `recommendations.json` em `data/processed/sites/`. São
  os sites das amostras das S14 a S18.

## Opções consideradas
1. **Como rodar o pipeline para uma URL.**
   - *Reescrever o pipeline dentro do servidor*, chamando as funções em processo: dá mais
     controle, mas duplica a orquestração e corre o risco de divergir do código congelado.
   - *Acrescentar uma opção `--data-dir` aos módulos*: é limpo, mas mexe no código congelado
     e exigiria nova tag e uma nova rodada dos testes de todo o pipeline.
   - *Chamar os módulos existentes como processos filhos, com o diretório de trabalho numa
     pasta própria da análise*: o código dos módulos não muda, e o isolamento vem do sistema
     de arquivos. Em troca, depende de os caminhos continuarem relativos ao diretório de
     trabalho, o que um teste precisa garantir.
2. **Onde gravar.** As análises avulsas vão para `data/avulsos/<site>/<carimbo>/`, fora do
   git, com a mesma estrutura de `data/` dentro. O roteiro previa `<data>`. Com só a data, uma
   segunda análise no mesmo dia sobrescreveria a primeira.
3. **Sites do corpus.**
   - *(a) Só ler `data/processed/`*: métricas para os 242 sites, mas recomendações só para 24.
   - *(b) Também rodar as regras, sem LLM, numa pasta avulsa com uma cópia do
     `data/raw/<id>`*: recomendações para os 242 sites, sem nova coleta e sem tocar no bruto.
4. **Teto da LLM.**
   - *Teto por análise*: cada pasta avulsa começa com gasto zero, e o teto deixa de proteger
     o crédito.
   - *Teto global*: o servidor soma o gasto do TCC com o de todas as análises avulsas e passa
     o saldo em `--teto-usd`.
5. **Exposição.**
   - *Publicar*: o servidor viraria um coletor aberto. Qualquer pessoa poderia fazê-lo
     visitar terceiros (abuso) ou endereços internos da rede onde ele roda (SSRF), em nome
     do User-Agent do TCC.
   - *Escutar só em `127.0.0.1`*: só o próprio autor usa.

## Decisão
1. **Processos filhos com o diretório de trabalho isolado.** O servidor (`src/ui/server.ts`)
   roda os mesmos comandos do README (`src/triage/index.ts`, `src/collect/index.ts`,
   `src/analyze/index.ts`, `src/recommend/index.ts`, via `tsx`), com o cwd em
   `data/avulsos/<site>/<carimbo>/`. O `<carimbo>` tem o formato `AAAA-MM-DDTHH-MM-SS`, em
   UTC. O `src/` dos módulos 0 a 4 não muda.
2. **Pipeline de uma análise avulsa:**
   1. grava `data/input/registros-ufrn.txt` com a linha da URL;
   2. roda `triage` (normalização), `triage --probe` e `triage --classify`;
   3. se o site sair excluído (`robots`, `login`, `dns`, `4xx`, `pagina-padrao`…), a análise
      **para** e mostra o motivo;
   4. roda `collect --site <id>` (página + Lighthouse 3×, mobile, mediana);
   5. roda `analyze` (sem `--vnu` por padrão; `--vnu` opcional, porque depende do Java);
   6. roda `recommend --site <id>` e, se pedido, `--llm`.
3. **Fila de uma análise por vez.** Com um site por vez, a regra 1 (no máximo 2 hosts em
   paralelo) vale com folga. As pausas, o User-Agent e o `robots.txt` são os do código
   existente: a interface não tem caminho de rede próprio até o site analisado.
4. **Sites do corpus: opção (b).** O servidor lê `data/processed/` e o `dataset.csv` para as
   métricas e lê os resultados do módulo 3 quando eles existem. Se não existirem, pode rodar
   `recommend` **sem `--llm`** numa pasta avulsa com uma **cópia** de `data/raw/<id>/` e
   `data/corpus.csv`. Não há nova coleta, e nada é gravado em `data/raw/` nem em
   `data/processed/`.
5. **LLM opcional por análise, com teto global.** O saldo é US$ 4,50 menos a soma do
   `custo_usd` do `data/processed/llm-runs.csv` do TCC (só leitura) e de todos os
   `data/avulsos/**/data/processed/llm-runs.csv`. O servidor passa esse saldo em
   `--teto-usd`. Sem saldo, a opção fica desabilitada.
6. **Só local e só URLs públicas.** O servidor escuta apenas em `127.0.0.1`. A URL de
   entrada passa por quatro filtros:
   - só `http`/`https`;
   - sem credenciais na URL;
   - sem `localhost` nem IP literal;
   - o host não pode resolver (DNS) para endereço privado, de loopback, link-local ou
     reservado (IPv4 e IPv6).
   
   Só a origem é usada: caminho, query e fragmento são descartados, como na triagem (regra 5).
7. **Fora das evidências do TCC.** `data/avulsos/` fica no `.gitignore`. Nada dali entra no
   `dataset.csv`, no `llm-runs.csv` do TCC, nos notebooks nem no texto como resultado.

## Justificativa
- **Os processos filhos com cwd isolado** mantêm a afirmação do texto de que a ferramenta
  usa o mesmo código medido no TCC, sem nova versão dos módulos. O isolamento por pasta é
  fácil de auditar: tudo o que uma análise grava fica sob uma pasta só.
- **A fila de 1** e a reutilização do código de rede aplicam a terceiros as mesmas regras de
  cortesia aplicadas à UFRN, sem uma segunda implementação que possa divergir.
- **O teto global** protege o crédito do autor, que é um só para o TCC e a interface.
- **Só local, com o bloqueio de endereços internos**, evita que a ferramenta vire um proxy
  aberto ou um meio de varrer a rede local. A verificação de DNS é feita antes da triagem.
  Ela não elimina a troca do DNS entre a checagem e a coleta (*DNS rebinding*), e por isso o
  uso local continua obrigatório.

## Consequências
- **Positivas:**
  - interface sem mudança no código congelado;
  - análises avulsas reprodutíveis pela pasta, que traz `meta` em todo JSON, como os
    módulos já gravam;
  - recomendações para os 242 sites do corpus sem nova coleta.
- **Negativas / limitações:**
  - **Tempo.** Uma análise avulsa leva cerca de 1 a 2 minutos (estimativa pela coleta da
    S08: 45 a 70 s por site no piloto, mais a triagem). A fila de 1 faz o segundo pedido
    esperar.
  - **Comparabilidade.** O resultado de um site de fora da UFRN não é comparável ao
    panorama do TCC: outra data, outra rede, outra carga na máquina.
  - **Dependência de caminhos relativos.** Se uma versão futura de um módulo gravar fora do
    cwd, o isolamento quebra em silêncio. Um teste do servidor confere que a pasta da análise
    é o único lugar alterado.
  - **DNS rebinding.** Não é coberto pela checagem de DNS, e por isso a decisão 6 proíbe
    publicar o servidor.
  - **Página de login.** A triagem detecta login por heurística (ADR 002). Um site de
    terceiros com tela de login não detectada seria coletado, mas só a página inicial
    pública, sem envio de formulário (regra 4).

## Onde aparece no TCC
Apêndice ou seção "Ferramenta" (Fase 7). Não entra em Metodologia nem em Resultados: a
interface não produz dados do estudo.
