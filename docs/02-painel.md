# Central de Aplicativos — como funciona e onde configurar

Painel que lista os serviços hospedados neste notebook (servidor 24/7).
Software: **Homepage** (gethomepage.dev), versão 2.2.0, em container Docker.

## Endereços

| Como | URL |
|---|---|
| Nome interno | `http://central.jts` |
| Direto por IP | `http://$LAN_IP:3001` |
| Pela VPN | `http://$TS_IP:3001` |

O nome `.jts` só resolve para dispositivos na tailnet do Tailscale. A cadeia é:
Split DNS do Tailscale → AdGuard (reescrita `*.jts` → $LAN_IP) → Nginx Proxy
Manager (nome → porta 3001).

## Onde ficam os arquivos

Tudo em `$HOMELAB/docker/infra/`:

```
docker-compose.yml              servico "homepage": portas, volumes, variaveis
homepage/config/
    settings.yaml               titulo, idioma, layout das secoes
    services.yaml               os cards: nome, descricao, link, icone, widget
    widgets.yaml                a faixa de recursos do topo (CPU, RAM, disco...)
    custom.css                  TODO o visual: paletas de cor, fundo da pagina,
                                vidro dos cards, faixa do topo (ver adiante)
    custom.js                   [A] conversao de unidade da memoria
                                [B] seletor de paletas (ver adiante)
    bookmarks.yaml              vazio de proposito (remove os links padrao)
    docker.yaml                 conexao com o socket do Docker (status dos containers)
homepage/locales/pt-BR.json     traducoes (arquivo mesclado, ver adiante)
homepage/icones-guia/           icone da guia do navegador + gerar.py
homepage/backups/<data-hora>/   copias de seguranca (ver adiante)
```

### Backups

Cada mudança grande no painel deixa uma cópia em
`homepage/backups/AAAAMMDD-HHMMSS/`, com um `.tar.gz` de `config/` + `locales/`
(permissões preservadas, inclusive o `chmod 600` do `services.yaml`) e uma cópia
do `docker-compose.yml`.

Para voltar ao estado de um backup:

```bash
cd $HOMELAB/docker/infra
tar -xzf homepage/backups/<data-hora>/homepage-config-<data-hora>.tar.gz
# custom.css e custom.js valem na hora; se restaurou YAML, revalidar:
curl -s -o /dev/null -H "Host: central.jts" http://localhost:3001/api/revalidate
```

O `.tar.gz` cobre `config/` e `locales/`. Se precisar voltar o
`docker-compose.yml` também, aí sim é `sudo docker compose up -d
--force-recreate homepage`.

Backups existentes:

| Quando | Estado guardado |
|---|---|
| `20260907-012656` | antes da repaginação visual (painel original) |
| `20260907-024507` | depois da repaginação, antes de remover o seletor de cor |
| `20260907-035215` | antes do ícone da guia e da mudança do marcador "2" |
| `20260907-040150` | antes do link do Wakfu e do tema claro escurecido |

## Como aplicar mudanças

Depende do arquivo. São três casos, e **só o último precisa de `sudo`**:

| Arquivo | O que fazer |
|---|---|
| `custom.css`, `custom.js` | nada — só recarregar o navegador |
| `settings.yaml`, `services.yaml`, `widgets.yaml` | `curl .../api/revalidate` |
| `docker-compose.yml` | recriar o container (pede `sudo`) |
| `homepage/icones-guia/*` | **nada** — só recarregar o navegador |

**`custom.css` e `custom.js`** são servidos por rota de API
(`/api/config/custom.css` e `/api/config/custom.js`), lidos do disco a cada
requisição. Salvar o arquivo já basta. Confere com:

```bash
curl -s -H "Host: central.jts" http://localhost:3001/api/config/custom.css \
  | cmp - $HOMELAB/docker/infra/homepage/config/custom.css && echo igual
```

**Os YAML** são lidos por `getStaticProps` do Next, e a rota de revalidação
refaz essa leitura — é o que o botão de recarregar do rodapé faz. Não precisa
reiniciar o container:

```bash
curl -s -o /dev/null -H "Host: central.jts" http://localhost:3001/api/revalidate
```

Testado com um campo temporário no `settings.yaml`: apareceu em
`initialSettings` só com o `revalidate`, sem tocar no container.

**Os arquivos de ícone** são montados por *arquivo*, e o `gerar.py` sobrescreve
cada um no lugar (mesmo inode). O container passa a servir os bytes novos na
hora — verificado. Só o navegador precisa de `Ctrl+Shift+R`, e ele guarda
favicon com afinco: se insistir no antigo, abrir `/favicon-32x32.png` direto
força a releitura.

**O `docker-compose.yml`** (volumes, portas) é o único que exige recriar:

```bash
cd $HOMELAB/docker/infra
sudo docker compose up -d --force-recreate homepage
```

### Depois de recriar, a primeira carga vem errada

Logo após um `up -d --force-recreate`, a primeira requisição devolve a página
**estática gerada no build da imagem**: título "Homepage", `initialSettings`
vazio, idioma inglês (a faixa de recursos mostra "FREE" em vez de "LIVRE") e o
seletor de cor reaparecendo. Não é config quebrada — é ISR do Next servindo o
snapshot antigo enquanto revalida em segundo plano.

Basta recarregar, ou forçar:

```bash
curl -s -o /dev/null -H "Host: central.jts" http://localhost:3001/api/revalidate
```

Para conferir o que o container realmente carregou:

```bash
curl -s -H "Host: central.jts" http://localhost:3001 \
 | grep -o '"initialSettings":{[^}]*}'
```

**No navegador, sempre recarregar com `Ctrl+Shift+R`** — CSS e JS ficam em cache.

### Sobre o sudo

Esta máquina pede senha para `sudo` e não tem sessão interativa no terminal do
Claude. O contorno usado é um helper gráfico com `zenity`, que abre um diálogo
na tela do usuário:

```bash
export DISPLAY=:0
export SUDO_ASKPASS=/caminho/askpass.sh    # script que roda: zenity --password
sudo -A docker compose restart homepage
```

O `sudo` guarda a credencial por ~15 minutos. Se expirar no meio de um comando
longo, o diálogo fica aberto esperando na tela e o comando trava.

---

## APARÊNCIA — é aqui que se mexe

O visual **não** vem mais do `settings.yaml`: está todo em
`homepage/config/custom.css`, que é servido a cada requisição (não precisa
reiniciar o container, só recarregar a página).

O arquivo é dividido em seções numeradas `[1]` a `[13]`, com um cabeçalho longo
explicando as regras do jogo. Vale ler esse cabeçalho antes de mexer.

### Paletas de cor

Nove paletas, escolhidas por um seletor no **canto inferior esquerdo** da tela.
A escolha fica no `localStorage` do navegador (chave `painel.paleta`), ou seja é
por dispositivo, não global.

| Paleta | Cores |
|---|---|
| Marinho | branco e azul marinho — **é a padrão** |
| Floresta | marrom, verde musgo e ferrugem |
| Prata | prateado com azul claro |
| Ametista | roxo escuro e roxo claro |
| Carmim | vermelho sangue e preto |
| Solar | âmbar e laranja sobre grafite |
| Ciberdeck | ciano neon sobre azul noite |
| Synthwave | magenta e violeta sobre índigo |
| Homepage | o cinza-azulado original do painel (rampa `slate`) |

Todas funcionam nos dois modos, claro e escuro. O botão de claro/escuro do
rodapé continua sendo o do Homepage e é independente da paleta.

A paleta "Homepage" ainda é gravada como `nativo` no `localStorage` — o id foi
mantido para não invalidar escolhas já salvas; só o rótulo mudou, depois que o
seletor de cor nativo foi removido.

### Título e marca no topo

O topo da página tem um cabeçalho próprio: uma marca gráfica e o título
**Central de Aplicativos**.

**Para renomear, mude `title` no `settings.yaml`.** O texto do cabeçalho sai de
`document.title`, então aquela chave passou a controlar a aba do navegador *e* o
cabeçalho de uma vez. Depois é só `curl .../api/revalidate` e recarregar.

Por que não é widget nativo: o Homepage não desenha o `title` na página (aquela
chave só alimentava o `<title>`), e os widgets que serviriam de cabeçalho
(`greeting` e `logo`, de `widgets.yaml`) são renderizados **dentro** de
`#information-widgets` — que hoje é o conteúdo da seção "Servidor". O título da
página cairia dentro dela. Daí o cabeçalho ser inserido pelo `custom.js`
(seção `[C]`), acima de tudo.

#### A marca

O **anel orbital**: um anel com núcleo e dois satélites em órbita — um no topo,
ligado ao núcleo por um raio, e outro a 45° embaixo à direita. Os dois satélites
ficam *exatamente* sobre o anel (o de 45° em `16 + r/√2`, não num valor
chutado). **Não é arquivo**: é um SVG inline guardado em `--pl-marca`
(`custom.css`, seção `[8c]`) e aplicado como **máscara**. O desenho entra pelo
canal alfa e a cor vem do `background`, que é o degradê da paleta. Resultado: a
marca acompanha as nove paletas e os dois modos, sem imagem no disco e sem
volume novo no `docker-compose.yml`. É a mesma técnica que o Homepage usa nos
ícones `mdi-` (seção `[10b]`).

Outras cinco variações foram desenhadas e comparadas antes da escolha desta. Ao
avaliar alternativas, convém renderizar cada marca em 44, 22 e 16 px: o que
funciona no tamanho maior costuma perder legibilidade em 16 px.

Para trocar o desenho, basta o valor de `--pl-marca`. Duas regras:

- use `fill`/`stroke` opacos — a máscara lê o alfa, não a cor;
- **percent-encode o apóstrofo** (`%27`) além de `<` e `>`. Assim o data URI
  funciona dentro de `url('...')` e de `url("...")`. Foi o que quebrou a
  primeira montagem de comparação: o SVG usa aspas simples nos atributos, e
  envolver o `url()` também em aspas simples terminava a string do CSS cedo.

Alinhamento: a marca começa em `left: 143`, a mesma coluna de "SERVIDOR",
"MÍDIA" e dos cards. No celular tudo cai para `1,1rem` de recuo, com a marca em
`2,1rem` e o título em `1,15rem`.

### Ícone da guia do navegador

A guia usa a mesma marca do cabeçalho. São **arquivos reais** em
`homepage/icones-guia/`, montados sobre os quatro caminhos que o Homepage
referencia no `<head>`:

| Arquivo | Monta sobre | Referenciado como |
|---|---|---|
| `favicon-16x16.png` | `/app/public/favicon-16x16.png` | `<link rel=icon sizes=16x16>` |
| `favicon-32x32.png` | `/app/public/favicon-32x32.png` | `<link rel=icon sizes=32x32>` |
| `homepage.ico` | `/app/public/homepage.ico` | `<link rel="shortcut icon">` |
| `apple-touch-icon.png` | `/app/public/apple-touch-icon.png` | tela inicial no celular |

São montagens de **arquivo**, uma a uma, e não de pasta: montar um diretório
sobre `/app/public` esconderia todo o resto que vive lá.

Os quatro são sobrescritos de propósito. Assim não importa qual link o
navegador escolhe — todos apontam para a marca. Verificado: os quatro respondem
com os bytes locais e carregam como imagem nos tamanhos certos (16, 32, 256, 180).

#### Por que arquivo e não JavaScript

A primeira tentativa foi gerar o favicon como SVG em data URI pelo `custom.js`,
o que teria dado uma guia que troca de cor junto com a paleta. **Foi
descartado:** o Next **restaura** os `<link rel=icon>` dele depois que o script
os remove — eles reaparecem *depois* do injetado, e aí o navegador
provavelmente prefere os originais. Além disso aquele caminho produziu um
recarregamento de página não explicado durante o teste. Arquivo é confiável e
funciona antes de qualquer JS, inclusive em favoritos.

**Consequência honesta:** o ícone da guia tem cor **fixa** (a paleta Marinho, a
padrão). Só a marca do cabeçalho acompanha a troca de paleta.

#### Para regerar

O desenho é a mesma marca, adaptada para tamanho pequeno. **Duas decisões, as
duas aprendidas errando:**

1. **Figura-fundo preservada**: ladrilho *escuro* com a marca *clara*, igual ao
   cabeçalho. A primeira tentativa inverteu (ladrilho claro, marca vazada) e o
   resultado não foi só "diferente": num **anel**, inverter transforma o traço
   fino num anel grosso escuro com miolo claro, e o desenho passa a ler como um
   botão de liga/desliga. Inverter funciona para marcas cheias, não para
   contornos.
2. **Sem o raio**: no cabeçalho existe um raio ligando o núcleo ao satélite de
   cima. Em 16 px ele funde os dois num borrão. Os satélites ficam sobre o anel,
   que já faz a ligação visual.

E o anel é mais grosso ali (2,8 contra 1,9 unidades): a 1,9 daria 0,95 px em
16 px e sumiria. É por isso que as coordenadas existem em dois lugares — são
dois desenhos para dois tamanhos, de propósito.

```bash
pip install --quiet --target /tmp/pylib pillow
cd $HOMELAB/docker/infra/homepage/icones-guia
PYTHONPATH=/tmp/pylib python3 gerar.py
cd $HOMELAB/docker/infra && sudo docker compose restart homepage
```

As cores estão em três constantes no topo do `gerar.py`. O script desenha em 8×
e reduz com LANCZOS, por isso as bordas saem suaves. É determinístico —
rodá-lo de novo reproduz os arquivos byte a byte.

### A seção "Servidor"

A faixa do topo (CPU, memória, disco `/`, disco SSD, temperatura, tempo ativo)
ganhou o título **Servidor**, e passa a ler como a primeira seção da página.

Ela **não** é um grupo do `services.yaml` — é um *info widget*, mora em
`widgets.yaml` e o Homepage a renderiza em `#information-widgets`, fora do
sistema de grupos. Não há como declará-la como grupo: o tipo `resources` só é
aceito em `widgets.yaml`, e `services.yaml` só aceita widgets de serviço.

Então o título é inserido pelo `custom.js` (seção `[C]`) como um `<h2>` de
verdade, dentro de um `<div class="services-group">`, imediatamente antes da
faixa. Por carregar as mesmas classes dos outros grupos, **toda a tipografia vem
da seção `[8]` do `custom.css`** — mexer lá muda os cinco títulos de uma vez, e
não há estilo duplicado. O `custom.css` seção `[8b]` só resolve o alinhamento,
porque esse nó é filho direto de `.container` e os outros grupos vivem num
contêiner com padding próprio.

Verificado: `left 143, right 1331`, tipografia e barrinha idênticas ao "MÍDIA".

**Para renomear**, mude `TITULO` na seção `[C]` do `custom.js` — vale ao
recarregar, sem restart.

Detalhe que custou um diagnóstico: o `<h2>` do Homepage vem com a classe `flex`
do Tailwind, e o inserido pelo `custom.js` não. Sem contexto flex, o `::before`
da barrinha de destaque fica inline e perde a dimensão — a barra não aparecia.
Por isso a seção `[8]` declara `display: flex` explicitamente, em vez de
depender daquela classe utilitária.

### Carregamento sem pisco

O Homepage injeta o `custom.js` **depois** da hidratação, não no HTML servido.
Medido no localhost: primeiro paint em **131 ms**, `custom.js` em **161 ms**.
Nessa janela o navegador já pintava a tela sem duas coisas — a paleta salva
(saía Marinho, e no modo claro) e o conversor de unidade da memória (o valor
saía em GiB). Eram os dois piscos do carregamento. Pelo IP local a janela é de
~30-45 ms; por Tailscale ou no celular, bem maior.

Não dá para eliminar a janela: CSS não lê `localStorage`, e não há como rodar JS
antes do primeiro paint sem alterar a imagem do container. Então ela é
**escondida**: enquanto o `<html>` não tiver `data-pronto`, o conteúdo e as
camadas de fundo ficam em `opacity: 0` e só o `<html>` pinta, num cinza neutro
de propósito sem relação com nenhuma paleta. O `custom.js` marca `data-pronto`
depois de aplicar a paleta, esperar o tema assentar e ligar o conversor.

- `custom.css` seção `[0]` — o portão e o failsafe
- `custom.js` seção `[D]` — quem marca `data-pronto`

**As barras continuam animando.** A revelação acontece em ~161 ms, antes de o
dado dos widgets chegar (~540 ms), então elas ainda sobem do zero. Verificado:
29 larguras distintas renderizadas ao longo de ~700 ms. Se num cliente lento o
dado chegar antes, a seção `[D]` refaz a animação na revelação.

**Se o `custom.js` não carregar**, uma animação CSS (`pl-failsafe`) revela tudo
em 1,4 s — verificado. O painel fica com a paleta padrão e a memória em GiB:
degradado, mas visível. É o único motivo pelo qual a seção `[0]` usa `animation`
em vez de só `opacity`.

**O que sobrou:** o *fundo* ainda muda uma vez, do cinza neutro para a cor da
paleta. No modo escuro é escuro→escuro, imperceptível. O caso ruim é ter o
sistema operacional em tema claro e o painel em escuro: aí o cinza de espera sai
claro (ele segue `prefers-color-scheme`, a única pista disponível antes do
primeiro paint) e depois vai para escuro. Mesmo aí, nenhum conteúdo aparece com
a cor errada.

### Ajustar o brilho do tema claro

O tema claro foi escurecido em set/2026 — a primeira versão lia como lavada,
quase toda branca. Tudo mora num bloco só, `:root:not(.dark)` na seção `[2]` do
`custom.css`:

| Token | O que controla |
|---|---|
| `--pl-page` | o campo da página — hoje `--color-200` (era `--color-100`) |
| `--pl-glass` | quanto branco tem o card; menos branco = mais fundo aparece |
| `--pl-well` | os poços internos dos widgets |
| `--pl-line` / `--pl-line-hi` | força das bordas |
| `--pl-vinheta` | escurecimento das quinas da tela |

**Para escurecer mais**, o de maior efeito é `--pl-page` (`--color-200` →
`--color-300`) e depois baixar `--pl-glass`. Vale na hora, só recarregando.

Os **textos não entram nessa conta**: seguem em `--color-700` (títulos de seção)
e `--color-900` (título da página e valores da faixa). Escurecer o fundo sem
mexer no texto aumenta o contraste, não diminui.

### Como uma paleta funciona

O `custom.js` escreve `data-paleta="nome"` no `<html>`. O `custom.css` tem um
bloco por paleta que redefine a rampa de cor que o Homepage inteiro usa:

```css
:root[data-paleta="carmim"] {
  --color-50:  255 245 245;   /* mais claro */
  ...
  --color-900:  18  10  10;   /* mais escuro */
  --pl-acc:  221  39  39;     /* destaque */
  --pl-acc2: 249 114 114;     /* destaque secundario */
}
```

São só essas doze linhas. Tudo o mais — fundo, vidro dos cards, bordas,
sombras, barras — é derivado delas na seção `[2]`. **Para criar uma paleta
nova:** um bloco desses na seção `[1]` do `custom.css`, e uma entrada com o
mesmo `id` na lista `PALETAS` do `custom.js`. Nada além disso.

### Fundo da página

Vem de gradientes no `custom.css`, seção `[3]`: três manchas radiais em deriva
lenta ("aurora") sobre a cor base da paleta, mais uma grade fina, um granulado
e uma vinheta. A animação respeita `prefers-reduced-motion`.

A chave `background:` do `settings.yaml` continua funcionando para pôr uma
**imagem**, mas ela cobre a aurora: o Homepage desenha a imagem numa div
`#background` com `z-index: 0`, e a aurora vive em camada negativa. Os cards
seguem de vidro por cima da imagem, o que combina bem. Se um dia usar imagem
local, montar o volume no `docker-compose.yml`:

```yaml
      - ./homepage/images:/app/public/images:ro
```

e referenciar como `/images/nome-do-arquivo.jpg`.

### Cor e tema no settings.yaml

```yaml
color: slate       # DEFINIDO: remove o seletor de cor nativo do rodape
# theme:           # AUSENTE de proposito: e o que mantem o botao claro/escuro
```

O **seletor de cor nativo foi removido** (set/2026, a pedido). O motivo: com as
paletas do `custom.css` no ar, o único efeito visível que restava a ele era
pintar o ícone do Painel Wakfu — e só aquele, porque ícones `mdi-` são
desenhados como máscara CSS colorida por `--color-logo-start/stop`, as duas
únicas variáveis da rampa que as paletas não redefiniam. Hoje as paletas também
cobrem essas duas (`custom.css`, logo antes da seção `[3]`).

O valor `slate` continua importando: é a rampa que a paleta **Homepage** deixa
passar.

**O botão de claro/escuro continua lá** — depende de `theme` seguir ausente.

### Ícone do Painel Wakfu

O card usa `icon: mdi-chart-line`, pintado com as **cores da logo do jogo**,
fixas, na seção `[10b]` do `custom.css`:

| | |
|---|---|
| realce | `#a4e5e2` menta claro do traço |
| meio | `#7abab2` |
| base | `#57887f` verde-petróleo do corpo |

São médias dos pixels opacos da logo
(`wakfu_market_bot/assets/icone/wakfu_simbolo.png`) por faixa de luminância. O
ícone **não** segue a paleta: fica com a cor do jogo nas nove paletas e nos dois
modos — verificado.

A regra se ancora em `.service-icon[aria-label="mdi-chart-line"]`, porque o
Homepage preenche o `aria-label` com o próprio valor de `icon` quando o card tem
`href`. Trocar o ícone no `services.yaml` faz a regra parar de casar em silêncio,
sem pintar nada errado — mas aí é preciso ajustar o `aria-label` lá também.

A logo **não** é usada como imagem: chegou a ser (com um volume
`./homepage/icons:/app/public/icons`), e isso foi revertido — o `docker-compose.yml`
não tem esse volume.

### Desfoque dos cards

Não use `cardBlur:` do `settings.yaml`: o vidro fosco já é feito no
`custom.css` com `backdrop-filter`, controlado pela variável `--pl-blur`.

## Pontos frágeis — cuidado ao mexer

### 1. Dependência de posição na faixa de recursos

A ordem dos blocos em `widgets.yaml` é fixa e **duas customizações dependem dela**:

```
1 CPU | 2 Memória | 3 Disco / | 4 Disco SSD | 5 Temperatura | 6 Uptime
```

- `custom.css` seção `[7]` põe o marcador **"2"** no canto superior direito do
  ícone do 4º bloco (o SSD). A posição é *derivada*, não medida a olho: ancora
  em `left = padding do bloco + caixa do ícone` e em `top: 50%`, que é o centro
  vertical do bloco e também o do ícone. Mudar o tamanho do ícone (variável
  `--pl-faixa-icone`) reposiciona o marcador junto
- `custom.css` seção `[6]` esconde a barra do **último** bloco (uptime — a barra
  não tem significado ali, é componente genérico reaproveitado)
- `custom.js` seção `[A]` converte a unidade do **2º** bloco (memória)

Acrescentar `network:` ou remover `cputemp:` desloca tudo e quebra os três,
**silenciosamente, sem erro no log**. Se mexer na composição, reajustar os
`:nth-child()`.

### 1b. Nomes de classe do Homepage 2.2.0

Duas regras da versão anterior do `custom.css` miravam
`.information-widget-resources` (no plural). **Essa classe não existe na 2.2.0** —
as regras eram letra morta, e por isso os blocos da faixa apareciam agrupados no
centro em vez de distribuídos. A cadeia verdadeira é:

```
#information-widgets > #widgets-wrap > div.widget-container > div.flex-row
                                          > div.information-widget-resource  x6
```

Moral: ao mexer em seletor, conferir contra o HTML servido de verdade —
`curl -s -H "Host: central.jts" http://localhost:3001` — e não confiar em nome
de classe deduzido.

### 1c. custom.css carrega ANTES do CSS do Homepage

```html
<link rel="stylesheet" href="/api/config/custom.css">
<link rel="stylesheet" href="/_next/static/css/....css">
```

Em empate de especificidade, **quem ganha é o Homepage**. Um seletor de classe
puro como `.service-card` não tem efeito. Por isso as regras do `custom.css` se
ancoram em ID (`#inner_wrapper`, `#information-widgets`) ou usam `!important`.

### 1d. A rampa de cor tem de ir no `<html>`, não no `<body>`

O Homepage declara `.dark { --bg-color: var(--color-800) }` no `<html>`. Uma
custom property é resolvida no elemento onde é **declarada**, então uma rampa
posta no `<body>` não é vista por `--bg-color`: o fundo da página ficava
`slate-800` fixo, ignorando a paleta. Daí as paletas usarem `:root[data-paleta=…]`.

Junto com isso: o Homepage pinta `#__next, body, html` com
`background-color: rgb(var(--bg-color))`, e o `#__next` tem `height: 100%`. Sendo
opaco, ele tapava a aurora. A seção `[3]` do `custom.css` resolve dividindo as
camadas — `html` pinta a cor base, `body` e `#__next` ficam transparentes.

### 1e. A tela só aparece depois do custom.js

A seção `[0]` do `custom.css` mantém o conteúdo invisível até o `custom.js`
marcar `data-pronto` no `<html>`. Se mexer no `custom.js` e ele lançar exceção
**antes** da seção `[D]`, o painel fica 1,4 s num cinza e só então aparece — pelo
failsafe em CSS. Não fica preso, mas fica lento, sem paleta e sem o título
"Servidor".

Esta máquina não tem `node`, então não há `node --check`. Para validar a
sintaxe antes de recarregar:

```bash
pip install --quiet --target /tmp/pylib esprima tinycss2
PYTHONPATH=/tmp/pylib python3 -c "
import esprima, tinycss2
d='$HOMELAB/docker/infra/homepage/config/'
esprima.parseScript(open(d+'custom.js').read()); print('JS OK')
r=tinycss2.parse_stylesheet(open(d+'custom.css').read(), skip_whitespace=True, skip_comments=True)
print('CSS erros:', len([x for x in r if x.type=='error']))
"
```

A ordem das quatro seções do `custom.js` importa: `[A]`, `[B]` e `[C]` fazem a
parte síncrona delas antes de `[D]` marcar `data-pronto`. Não reordenar.

### 2. A memória é convertida por JavaScript

O componente de memória do Homepage chama o formatador com `binary: true` fixo
no código-fonte, forçando GiB. Essa opção vence qualquer ajuste no arquivo de
tradução — foi testado. O `custom.js` faz a conversão real no DOM
(7,6 GiB → 8,2 GB, fator 1,0737), não é máscara cosmética.

O observador fica no `<html>` e é ligado de forma síncrona, sem esperar a faixa
de recursos existir. Antes ele sondava `#information-widgets` a cada 500 ms, e
essa espera era uma janela real: dado chegando dentro dela era pintado em GiB.

O texto em GiB **chega a existir** no DOM — o que não acontece é ele ser
pintado: o callback do `MutationObserver` é entregue como microtarefa no fim da
tarefa que alterou o DOM, ou seja antes do próximo paint. Verificado com
amostragem por frame: zero frames com GiB.

### 3. O arquivo de tradução é um merge manual

`homepage/locales/pt-BR.json` é montado sobre o locale do container. Existe
porque os locales do Homepage são inconsistentes:

- `pt_BR` (sublinhado) tem as traduções de jellyfin e seerr, mas **não é uma tag
  BCP 47 válida** — quebra `toLocaleString` e todos os valores de bytes viram
  números crus
- `pt-BR` (hífen) é válido, mas não tem essas traduções nem os formatadores

A solução foi partir do `pt-BR` e preencher as 113 chaves faltantes com o
conteúdo do `pt_BR`. Atualizações da imagem não chegam a esse arquivo.

### 4. Senhas em texto puro

`services.yaml` contém usuário e senha do qBittorrent e do AdGuard — é como os
widgets do Homepage funcionam. O arquivo está em `chmod 600`. Manter assim.

---

## Widgets que dependem de serviço externo

Três cards não usam widget nativo, e sim um serviço criado à mão:

```
~/.local/bin/painel-status.py          servidor HTTP em 0.0.0.0:8099
~/.local/bin/painel-status.env         token do RomM, fora do repositório
~/.config/systemd/user/painel-status.service
```

| Endpoint | Alimenta |
|---|---|
| `http://$LAN_IP:8099/vpn` | card "VPN (Tailscale)" — dispositivos conectados |
| `http://$LAN_IP:8099/wakfu` | card "Painel Wakfu" — última e próxima coleta |
| `http://$LAN_IP:8099/roms` | card "ROMs por console" — contagem por plataforma no RomM |

O card "Biblioteca (RomM)" é widget nativo (`type: romm`) e não depende deste serviço;
só o detalhamento por console (que o widget nativo não oferece) passa por ele.

Gerenciado por `systemctl --user`. O usuário tem `linger` habilitado, então sobe
no boot mesmo sem login gráfico.

## Diagnóstico rápido

```bash
sudo docker logs homepage --tail 30           # erros de widget e de host
sudo docker ps --filter name=homepage         # saude do container
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Host: central.jts" http://localhost:3001
```

Se aparecer **"API Error"** num card, é aquele widget específico falhando ao
consultar seu serviço — é mensagem de estado, não contador.

Se o log trouxer `Host validation failed`, o nome usado para acessar não está em
`HOMEPAGE_ALLOWED_HOSTS`, no `docker-compose.yml`.
