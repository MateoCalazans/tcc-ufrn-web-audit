# landmarks-v1 — propor landmarks a partir de `<div>` existentes

```
modelo: claude-haiku-5-5
temperatura: padrão do modelo (o Claude Haiku 5.5 rejeita `temperature`; ver ADR 016)
effort: low
max_tokens: 4000
data: 2026-11-16
usado_em: S16 (amostra de teste; ver data/processed/llm-runs.csv)
```

Componente do sistema (módulo 3, S16, [ADR 016](../decisoes/016-llm-para-landmarks.md)).
O código (`src/recommend/llm.ts`) lê **deste arquivo** o cabeçalho acima e os dois
blocos `text` abaixo. Não editar depois de usado em resultados: criar `landmarks-v2.md`.

- **Entrada:** um esqueleto da página com os `<div>` candidatos, e não o HTML inteiro.
  Os candidatos são `<div>` visíveis, sem `role`, com as tags de abertura e de fechamento
  no arquivo, fora de landmarks e de elementos secionadores. Vão no máximo 150, em
  ordem de largura (os mais rasos primeiro).
- **Saída:** JSON estruturado (`output_config.format`), nunca HTML. O campo `candidato`
  faz o papel do seletor: é o identificador do esqueleto (`c1`, `c2`…), que o código
  resolve de volta para a posição da tag no arquivo.
- **Placeholders:** `{{url}}`, `{{titulo}}`, `{{presentes}}`, `{{ausentes}}`, `{{n}}`,
  `{{total}}`, `{{esqueleto}}`.

## Prompt de sistema

```text
Você analisa a estrutura da página inicial de sites institucionais de uma universidade para propor landmarks HTML5. A página não usa os elementos semânticos; o conteúdo está em elementos <div>.

Você recebe um esqueleto da página: uma lista de elementos <div> candidatos, um por linha, na ordem em que aparecem (os mais rasos primeiro). Cada linha tem o identificador (c1, c2…), a profundidade, o candidato pai, a tag de abertura com id e classes, os tipos de filhos, quantos links, títulos, formulários e imagens há dentro, e o começo do texto.

Para cada landmark AUSENTE indicado pelo usuário, escolha o candidato que já cumpre esse papel na página:
- header: cabeçalho do site (logotipo ou nome do site, no topo; pode conter o menu).
- nav: bloco formado principalmente por links de navegação do site (menu principal). No máximo 2.
- main: o conteúdo principal e exclusivo da página, inteiro; não contém o cabeçalho, o menu principal nem o rodapé.
- footer: rodapé do site (endereço, contato, direitos, links institucionais), no fim da página.

Regras:
1. Use só identificadores da lista. Nunca invente um identificador.
2. Proponha só os landmarks listados como ausentes. header, main e footer: no máximo 1 cada.
3. Se nenhum candidato cumpre bem o papel, não proponha nada para esse landmark. Omitir é melhor do que errar.
4. Um candidato proposto não pode estar dentro de outro candidato proposto, exceto nav dentro de header ou de footer.
5. Prefira o elemento mais externo que cumpre o papel inteiro, sem incluir conteúdo de outro papel.
6. justificativa: uma frase curta em português com as evidências (id ou classe, posição, conteúdo).
```

## Prompt do usuário

```text
Página: {{url}}
Título: {{titulo}}
Landmarks já presentes: {{presentes}}
Landmarks ausentes (proponha só estes): {{ausentes}}
Candidatos: {{n}} de {{total}} <div> elegíveis

Esqueleto:
{{esqueleto}}
```

## Esquema JSON de saída

Enviado em `output_config.format` (`json_schema`); o código revalida tudo (ADR 016).

```json
{
  "type": "object",
  "properties": {
    "propostas": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "candidato": { "type": "string" },
          "elemento": { "type": "string", "enum": ["header", "nav", "main", "footer"] },
          "justificativa": { "type": "string" }
        },
        "required": ["candidato", "elemento", "justificativa"],
        "additionalProperties": false
      }
    }
  },
  "required": ["propostas"],
  "additionalProperties": false
}
```

## Exemplo (documentação; não é enviado ao modelo)

Entrada (trecho do esqueleto):

```text
c1 prof=0 pai=- <div id="pagina"> filhos=[div×3] links=40 títulos=[h1,h2×3] form=1 img=5 texto="Departamento de Exemplo Início Cursos Contato Notícias …"
c2 prof=1 pai=c1 <div id="topo" class="cabecalho"> filhos=[img×1,div×1] links=8 títulos=[h1] form=0 img=1 texto="Departamento de Exemplo Início Cursos Contato"
c3 prof=1 pai=c1 <div id="conteudo"> filhos=[div×4] links=20 títulos=[h2×3] form=0 img=4 texto="Notícias Seleção 2027 aberta …"
c4 prof=1 pai=c1 <div id="rodape"> filhos=[p×2] links=12 títulos=[] form=1 img=0 texto="Av. Senador Salgado Filho, Natal/RN …"
c5 prof=2 pai=c2 <div class="menu"> filhos=[ul×1] links=8 títulos=[] form=0 img=0 texto="Início Cursos Contato"
```

Saída esperada:

```json
{
  "propostas": [
    { "candidato": "c2", "elemento": "header", "justificativa": "id \"topo\" e classe \"cabecalho\", no início, com o logotipo e o h1 do site." },
    { "candidato": "c5", "elemento": "nav", "justificativa": "classe \"menu\" com uma lista só de links do site, dentro do cabeçalho." },
    { "candidato": "c3", "elemento": "main", "justificativa": "id \"conteudo\" com as notícias e os títulos h2 da página." },
    { "candidato": "c4", "elemento": "footer", "justificativa": "id \"rodape\", último bloco, com endereço e links institucionais." }
  ]
}
```
