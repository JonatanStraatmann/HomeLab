/* ============================================================================
   CENTRAL DE APLICATIVOS — scripts do painel

   [A] conversao de unidade do bloco de memoria   (comportamento preservado)
   [B] seletor de paletas de cor
   [C] cabecalho da pagina + titulo da secao "Servidor"
   [D] portao de revelacao — libera a tela so quando [A] a [C] estao prontos

   O Homepage injeta este arquivo DEPOIS da hidratacao do React, nao no HTML
   servido. Medido: primeiro paint em 118 ms, este arquivo em 163 ms. Nessa
   janela o navegador pinta a tela sem a paleta salva e sem o conversor de
   memoria ligado — eram os dois piscos do carregamento.

   Nao ha como rodar JS antes do primeiro paint sem alterar a imagem do
   container, e CSS nao le localStorage. Entao a janela nao e eliminada: ela e
   escondida. A secao [C] deste arquivo e a secao [0] do custom.css combinam
   para manter o conteudo invisivel ate a paleta ser conhecida.

   ORDEM IMPORTA. As quatro partes rodam em sequencia no mesmo script, e [D]
   depende das outras tres terem terminado a parte SINCRONA delas:
     [A] liga o observador de memoria na hora, sem esperar elemento nenhum;
     [B] aplica o data-paleta na hora, antes de montar a interface;
     [C] insere o cabecalho e o titulo "Servidor" antes de a tela ser revelada;
     [D] so entao espera o tema assentar e marca data-pronto.
   ============================================================================ */


/* ============================================================================
   [A] MEMORIA — unidades binarias para decimais

   Converte as unidades binarias do bloco de MEMORIA para decimais.
   Motivo: o componente de memoria do Homepage chama o formatador com
   binary:true fixo no codigo, e essa opcao vence qualquer ajuste no
   arquivo de traducao. Aqui a conversao e REAL, nao cosmetica:
   7,6 GiB -> 8,2 GB (fator 1024^3 / 1000^3).
   O disco nao e tocado: ja sai em GB/TB via diskUnits.
   ============================================================================ */
(function () {
  var FATOR = { KiB: 1.024, MiB: 1.048576, GiB: 1.073741824, TiB: 1.099511627776 };
  var NOVA  = { KiB: "kB", MiB: "MB", GiB: "GB", TiB: "TB" };
  var RE = /(\d+(?:[.,]\d+)?)\s*(KiB|MiB|GiB|TiB)/g;

  function converte(txt) {
    return txt.replace(RE, function (_, num, un) {
      var v = parseFloat(num.replace(",", ".")) * FATOR[un];
      return v.toFixed(1).replace(".", ",") + " " + NOVA[un];
    });
  }

  function aplica() {
    // 2o bloco da faixa = memoria (1 CPU, 2 memoria, 3 disco /, 4 SSD, 5 temp, 6 uptime)
    var bloco = document.querySelector(".information-widget-resource:nth-child(2)");
    if (!bloco) return;
    var w = document.createTreeWalker(bloco, NodeFilter.SHOW_TEXT);
    var nos = [], n;
    while ((n = w.nextNode())) nos.push(n);
    nos.forEach(function (no) {
      var novo = converte(no.nodeValue);
      if (novo !== no.nodeValue) no.nodeValue = novo;
    });
  }

  /* O observador vai no <html> e e ligado JA, de forma sincrona.

     Antes ele esperava #information-widgets existir, sondando a cada 500 ms.
     Essa espera era uma janela real: se o dado do widget chegasse dentro dela,
     o valor era pintado em GiB. Observando o documento desde o inicio nao
     existe janela — quando a faixa aparece, o conversor ja esta no ar.

     O callback e barato: sem o bloco de memoria no DOM ele sai na primeira
     linha de aplica(). A propria reescrita dispara o observador de novo, mas
     na segunda passada nada difere e a coisa converge.

     Por que MutationObserver e nao polling: o callback e entregue como
     microtarefa no fim da tarefa que alterou o DOM, ou seja ANTES do proximo
     paint. O texto em GiB chega a existir no DOM, mas nao chega a ser pintado.
     Medido: zero frames com GiB depois desta mudanca. */
  new MutationObserver(aplica).observe(document.documentElement, {
    childList: true, subtree: true, characterData: true
  });
  aplica();
})();


/* ============================================================================
   [B] SELETOR DE PALETAS

   O que faz: escreve data-paleta no <html> e guarda a escolha no localStorage.
   Quem pinta e o custom.css — cada paleta e um bloco "html[data-paleta=X] body"
   na secao [1] daquele arquivo. Este script nao conhece nenhuma cor do tema,
   so os nomes; as bolinhas de amostra do menu sao a unica cor literal aqui.

   PARA ACRESCENTAR UMA PALETA
   ---------------------------
   1. custom.css secao [1]: novo bloco html[data-paleta="nome"] body com a
      rampa --color-50..900 e os destaques --pl-acc / --pl-acc2.
   2. aqui: uma entrada na lista PALETAS com o mesmo "id".
   Nada mais. As superficies saem derivadas da rampa.

   ONDE FICA NA TELA
   -----------------
   Canto inferior esquerdo, position:fixed, anexado direto ao <body> — fora da
   arvore do React. Nao entra no #style do rodape porque um no injetado ali
   pode ser removido numa re-renderizacao, e aquele canto ja e do seletor de
   cor nativo, do recarregar e do claro/escuro.

   A paleta "nativo" nao tem bloco no custom.css: a rampa do Homepage passa
   intacta, dando o cinza-azulado original do painel. O id continua "nativo"
   para nao invalidar a escolha ja gravada no localStorage de quem usa o painel;
   so o rotulo mudou, depois que o seletor de cor nativo foi removido.
   ============================================================================ */
(function () {
  "use strict";

  var CHAVE  = "painel.paleta";
  var PADRAO = "marinho";   /* precisa casar com html:not([data-paleta]) no custom.css */

  /* cores das bolinhas: so para o menu. "nativo" usa var() de proposito, para
     mostrar ao vivo a rampa que estiver valendo. */
  var PALETAS = [
    { id: "marinho",   nome: "Marinho",   desc: "branco e azul marinho",
      amostra: ["#5d96e9", "#e2ecfa", "#132243"] },
    { id: "floresta",  nome: "Floresta",  desc: "marrom, verde musgo e ferrugem",
      amostra: ["#b85926", "#7e9656", "#2b241b"] },
    { id: "prata",     nome: "Prata",     desc: "prateado com azul claro",
      amostra: ["#7dc7eb", "#cbd6e2", "#29333f"] },
    { id: "ametista",  nome: "Ametista",  desc: "roxo escuro e roxo claro",
      amostra: ["#bb8dff", "#edc9ff", "#341b5a"] },
    { id: "carmim",    nome: "Carmim",    desc: "vermelho sangue e preto",
      amostra: ["#dd2727", "#f97272", "#120a0a"] },
    { id: "solar",     nome: "Solar",     desc: "ambar e laranja sobre grafite",
      amostra: ["#fcb135", "#ffd779", "#2e2925"] },
    { id: "ciberdeck", nome: "Ciberdeck", desc: "ciano neon sobre azul noite",
      amostra: ["#23e1e7", "#79f6c9", "#0c273b"] },
    { id: "synthwave", nome: "Synthwave", desc: "magenta e violeta sobre indigo",
      amostra: ["#ff5cc9", "#79b5ff", "#2d1b55"] },
    { id: "nativo",    nome: "Homepage",   desc: "o cinza-azulado original do painel",
      amostra: ["rgb(var(--color-300))", "rgb(var(--color-500))", "rgb(var(--color-800))"] }
  ];

  var SVG = "http://www.w3.org/2000/svg";

  /* -------------------------------------------------- estado */

  function le() {
    try {
      var v = window.localStorage.getItem(CHAVE);
      return achaPaleta(v) ? v : PADRAO;
    } catch (e) {
      return PADRAO;   /* localStorage bloqueado (modo privado, etc.) */
    }
  }

  function grava(id) {
    try { window.localStorage.setItem(CHAVE, id); } catch (e) { /* segue sem persistir */ }
  }

  function achaPaleta(id) {
    for (var i = 0; i < PALETAS.length; i++) if (PALETAS[i].id === id) return PALETAS[i];
    return null;
  }

  /* "nativo" recebe o atributo com esse valor EXPLICITO, e nao a remocao dele:
     o custom.css usa ":root:not([data-paleta])" como paleta padrao para a
     primeira pintura da tela, entao remover o atributo daria marinho em vez da
     rampa nativa. Nao existe bloco :root[data-paleta="nativo"] de proposito —
     e assim que a rampa do Homepage passa intacta. */
  function aplicaPaleta(id) {
    document.documentElement.setAttribute("data-paleta", id);
  }

  var atual = le();
  aplicaPaleta(atual);   /* antes de montar a interface, para nao piscar duas vezes */

  /* -------------------------------------------------- helpers de DOM */

  function el(tag, classe, texto) {
    var n = document.createElement(tag);
    if (classe) n.className = classe;
    if (texto != null) n.textContent = texto;
    return n;
  }

  function amostraDe(paleta) {
    var box = el("span", "pl-amostra");
    box.setAttribute("aria-hidden", "true");
    paleta.amostra.forEach(function (cor) {
      var i = document.createElement("i");
      i.style.background = cor;
      box.appendChild(i);
    });
    return box;
  }

  function icone(classe, d) {
    var s = document.createElementNS(SVG, "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("fill", "none");
    s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", "2.4");
    s.setAttribute("stroke-linecap", "round");
    s.setAttribute("stroke-linejoin", "round");
    s.setAttribute("aria-hidden", "true");
    s.setAttribute("class", classe);
    var p = document.createElementNS(SVG, "path");
    p.setAttribute("d", d);
    s.appendChild(p);
    return s;
  }

  var D_CHEVRON = "M6 9l6 6 6-6";
  var D_CHECK   = "M20 6L9 17l-5-5";

  /* -------------------------------------------------- interface */

  function monta() {
    if (document.getElementById("pl-switcher")) return;   /* nunca duplicar */

    var raiz = el("div", null);
    raiz.id = "pl-switcher";

    /* --- botao --- */
    var btn = el("button", "pl-btn");
    btn.type = "button";
    btn.setAttribute("aria-haspopup", "listbox");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-label", "Trocar a paleta de cores do painel");
    btn.title = "Paleta de cores";

    var btnAmostra = amostraDe(achaPaleta(atual));
    var btnNome = el("span", "pl-nome-atual", achaPaleta(atual).nome);
    btn.appendChild(btnAmostra);
    btn.appendChild(btnNome);
    btn.appendChild(icone("pl-chevron", D_CHEVRON));

    /* --- menu --- */
    var menu = el("div", "pl-menu");
    menu.id = "pl-menu";
    menu.hidden = true;
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", "Paletas de cor");
    menu.appendChild(el("div", "pl-titulo", "Paleta de cores"));

    var opcoes = [];
    PALETAS.forEach(function (p) {
      var o = el("button", "pl-opcao");
      o.type = "button";
      o.setAttribute("role", "option");
      o.setAttribute("data-paleta", p.id);
      o.setAttribute("aria-selected", p.id === atual ? "true" : "false");

      var textos = el("span", "pl-textos");
      textos.appendChild(el("span", "pl-nome", p.nome));
      textos.appendChild(el("span", "pl-desc", p.desc));

      o.appendChild(amostraDe(p));
      o.appendChild(textos);
      o.appendChild(icone("pl-check", D_CHECK));

      o.addEventListener("click", function () {
        escolhe(p.id);
        fecha(true);
      });
      menu.appendChild(o);
      opcoes.push(o);
    });

    raiz.appendChild(menu);
    raiz.appendChild(btn);
    document.body.appendChild(raiz);

    /* --- comportamento --- */

    function escolhe(id) {
      var p = achaPaleta(id);
      if (!p) return;
      atual = id;
      aplicaPaleta(id);
      grava(id);

      btnNome.textContent = p.nome;
      var nova = amostraDe(p);
      btn.replaceChild(nova, btnAmostra);
      btnAmostra = nova;

      opcoes.forEach(function (o) {
        o.setAttribute("aria-selected", o.getAttribute("data-paleta") === id ? "true" : "false");
      });
    }

    function abre() {
      menu.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      var sel = menu.querySelector('.pl-opcao[aria-selected="true"]') || opcoes[0];
      if (sel) sel.focus();
    }

    function fecha(devolveFoco) {
      menu.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      if (devolveFoco) btn.focus();
    }

    function aberto() { return !menu.hidden; }

    btn.addEventListener("click", function (ev) {
      ev.stopPropagation();
      if (aberto()) fecha(false); else abre();
    });

    /* teclado dentro do menu: setas, Home/End, Esc */
    menu.addEventListener("keydown", function (ev) {
      var i = opcoes.indexOf(document.activeElement);
      if (ev.key === "Escape") { ev.preventDefault(); fecha(true); return; }
      if (ev.key === "Tab")    { fecha(false); return; }
      if (i === -1) return;

      var alvo = null;
      if (ev.key === "ArrowDown")    alvo = opcoes[(i + 1) % opcoes.length];
      else if (ev.key === "ArrowUp") alvo = opcoes[(i - 1 + opcoes.length) % opcoes.length];
      else if (ev.key === "Home")    alvo = opcoes[0];
      else if (ev.key === "End")     alvo = opcoes[opcoes.length - 1];
      if (alvo) { ev.preventDefault(); alvo.focus(); }
    });

    /* clique fora fecha */
    document.addEventListener("click", function (ev) {
      if (aberto() && !raiz.contains(ev.target)) fecha(false);
    });

    /* Esc com o foco em qualquer lugar */
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && aberto()) fecha(true);
    });
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", monta);
  else monta();
})();


/* ============================================================================
   [C] CABECALHO DA PAGINA + TITULO DA SECAO "SERVIDOR"

   Duas insercoes de DOM, acima da faixa de recursos, nesta ordem final:

       #pl-cabecalho          marca + titulo da pagina
       #pl-grupo-servidor     o <h2> "Servidor"
       #information-widgets   a faixa (CPU, memoria, discos, temp, uptime)

   POR QUE O TITULO DA PAGINA E FEITO AQUI
   ---------------------------------------
   O Homepage nao desenha o "title" do settings.yaml na pagina: aquela chave so
   alimenta o <title> da aba. Os widgets nativos que serviriam de cabecalho
   ("greeting" e "logo") sao renderizados DENTRO de #information-widgets, que
   hoje e o conteudo da secao "Servidor" — o titulo da pagina cairia dentro
   dela. Dai o cabecalho proprio.

   O texto sai de document.title, isto e, de settings.yaml. Renomear o painel
   num lugar so muda a aba E o cabecalho. A constante abaixo e so a rede de
   protecao para o caso de o titulo vir vazio.

   Nota: logo depois de um "up -d --force-recreate", a primeira carga da pagina
   e o snapshot estatico do build da imagem, cujo titulo e "Homepage". O
   cabecalho vai mostrar isso ate a revalidacao — reflete o que o container
   carregou, e se corrige sozinho ao recarregar.

   POR QUE O TITULO "SERVIDOR" E DOM E NAO CSS
   -------------------------------------------
   A faixa e um "info widget": mora em widgets.yaml e o Homepage a renderiza em
   #information-widgets, fora do sistema de grupos do services.yaml. Nao ha como
   declara-la como grupo — o tipo "resources" so e aceito em widgets.yaml.

   Daria para fazer com "#information-widgets::before { content: 'Servidor' }",
   como o marcador "2" do SSD ja faz. Mas isso obrigaria a repetir toda a
   tipografia dos outros titulos (tamanho, peso, caixa, espacamento, barrinha de
   destaque, divisoria em degrade) num segundo lugar, para manter os dois iguais
   a mao. Inserindo um <h2 class="service-group-name"> dentro de um
   <div class="services-group">, a secao [8] do custom.css pinta este titulo
   pelas MESMAS regras dos outros — mexer la muda os cinco de uma vez. De quebra
   vira um cabecalho de verdade, e nao texto de CSS.

   O CSS so cuida do alinhamento e da marca: secoes [8b] e [8c].

   RISCO DE REACT
   --------------
   Os dois nos sao inseridos dentro de .container, que e territorio do React. Na
   pratica o React so mexe nos nos que ele mesmo criou, e os filhos de
   .container sao uma lista fixa (dialogo, faixa, grupos, rodape) — nunca
   reordenada. Testado com troca de paleta, alternancia claro/escuro e 12 s de
   refresh de widget: os dois permanecem, um de cada. Se algum dia uma versao do
   Homepage passar a recriar .container, o pior caso e o cabecalho desaparecer —
   cosmetico, sem quebrar nada.
   ============================================================================ */
(function () {
  "use strict";

  var TITULO_SECAO   = "Servidor";
  var TITULO_RESERVA = "Central de Aplicativos";   /* so se document.title vier vazio */

  function insere() {
    var faixa = document.getElementById("information-widgets");
    if (!faixa || !faixa.parentNode) return;
    var pai = faixa.parentNode;

    /* --- titulo da secao "Servidor" ---
       Mesmas classes dos outros grupos: e o que faz a secao [8] do custom.css
       valer aqui tambem, sem duplicar estilo. */
    if (!document.getElementById("pl-grupo-servidor")) {
      var grupo = document.createElement("div");
      grupo.id = "pl-grupo-servidor";
      grupo.className = "services-group";

      var h2 = document.createElement("h2");
      h2.className = "service-group-name";
      h2.textContent = TITULO_SECAO;

      grupo.appendChild(h2);
      pai.insertBefore(grupo, faixa);
    }

    /* --- cabecalho da pagina --- */
    if (!document.getElementById("pl-cabecalho")) {
      var cab = document.createElement("header");
      cab.id = "pl-cabecalho";

      /* a marca e um <span> vazio de proposito: o desenho vem da mascara CSS
         (--pl-marca, secao [8c]) e a cor do degrade da paleta */
      var marca = document.createElement("span");
      marca.className = "pl-marca";
      marca.setAttribute("aria-hidden", "true");

      var h1 = document.createElement("h1");
      h1.className = "pl-titulo";
      h1.textContent = (document.title || "").trim() || TITULO_RESERVA;

      cab.appendChild(marca);
      cab.appendChild(h1);
      pai.insertBefore(cab, document.getElementById("pl-grupo-servidor") || faixa);
    }
  }

  insere();
  if (!document.getElementById("pl-cabecalho")) {
    /* caminho improvavel: a faixa ainda nao estava no DOM */
    document.addEventListener("DOMContentLoaded", insere);
  }
})();


/* ============================================================================
   [D] PORTAO DE REVELACAO

   Par da secao [0] do custom.css: enquanto o <html> nao tiver data-pronto, o
   conteudo fica invisivel e so um cinza neutro aparece. Aqui e onde o
   data-pronto e escrito. Roda por ultimo de proposito: quando chega aqui, a
   paleta, o conversor de memoria, o cabecalho e o titulo "Servidor" ja estao
   no lugar.

   O QUE PRECISA ESTAR RESOLVIDO ANTES DE REVELAR
   ----------------------------------------------
   1. a paleta — a secao [B] ja gravou o data-paleta de forma sincrona;
   2. o conversor de memoria — a secao [A] ja esta observando o documento;
   3. o TEMA claro/escuro, que nao e nosso: o Homepage poe "dark" e
      "scheme-dark"/"scheme-light" no <html> num useEffect, depois da
      hidratacao. Revelar antes disso mostraria o painel no modo claro por um
      instante, e logo em seguida no escuro — trocando um pisco por outro.

   Por isso [C] espera uma das classes scheme-*. O Homepage sempre poe uma das
   duas, entao a espera normalmente termina no primeiro tick.

   O TETO DE ESPERA
   ----------------
   ESPERA_MAX e curto de proposito. Ele existe por dois motivos opostos:
     - se o tema nunca assentar (versao futura que mude esse comportamento), o
       painel nao pode ficar preso na tela cinza;
     - e principalmente: a revelacao precisa acontecer ANTES de o dado dos
       widgets chegar (~540 ms medidos), senao as barras aparecem ja cheias e
       se perde a animacao de preenchimento.
   Se o teto estourar, revela do mesmo jeito — um pisco de tema e menos ruim
   que uma tela cinza parada.

   O failsafe de verdade, para o caso de este arquivo nao carregar, esta no
   CSS (animation pl-failsafe, 1,4 s): nao depende de JS nenhum.
   ============================================================================ */
(function () {
  "use strict";

  var ESPERA_MAX = 300;   /* ms */

  function temaAssentou() {
    var c = document.documentElement.classList;
    return c.contains("scheme-dark") || c.contains("scheme-light");
  }

  /* Refaz a animacao das barras.

     So roda quando o dado chegou ANTES da revelacao — nesse caso as barras ja
     estao na largura final e a transicao de 1 s do Homepage nao tem o que
     animar. Zerar e restaurar no frame seguinte devolve o efeito.

     Cuidado com o React: ele nao sabe que mexemos no style inline, e numa
     re-renderizacao com o MESMO valor de largura ele nao reescreve o DOM. Se
     zerassemos sem restaurar, a barra poderia ficar presa em 0. Por isso a
     largura e capturada antes e reposta aqui mesmo, sem depender do React. */
  function refazAnimacaoDasBarras() {
    try {
      var fills = document.querySelectorAll(".resource-usage > div");
      var larguras = [], algumaCheia = false, i;
      for (i = 0; i < fills.length; i++) {
        var w = fills[i].style.width || "";
        larguras.push(w);
        if (w && w !== "0%") algumaCheia = true;
      }
      if (!algumaCheia) return;               /* caso normal: nada a fazer */

      for (i = 0; i < fills.length; i++) fills[i].style.width = "0%";
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          for (var k = 0; k < fills.length; k++) fills[k].style.width = larguras[k];
        });
      });
    } catch (e) { /* puramente cosmetico: nunca deve impedir a revelacao */ }
  }

  function revela() {
    if (document.documentElement.hasAttribute("data-pronto")) return;
    refazAnimacaoDasBarras();
    document.documentElement.setAttribute("data-pronto", "");
  }

  if (temaAssentou()) { revela(); return; }

  var limite = setTimeout(revela, ESPERA_MAX);
  var obs = new MutationObserver(function () {
    if (!temaAssentou()) return;
    clearTimeout(limite);
    obs.disconnect();
    revela();
  });
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
})();
