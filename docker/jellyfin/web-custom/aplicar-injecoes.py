#!/usr/bin/env python3
"""Gera o index.html do Taiflix a partir do index.html original de uma imagem.

O jellyfin-web referencia os bundles com hash no nome, que muda a cada versão.
Por isso o index.html montado no container precisa ser regerado a partir do
original da imagem em uso, e não reaproveitado entre versões.

Injeções aplicadas:
  - injecoes/head.html: ícones do Taiflix no lugar dos três do Jellyfin
    (apple-touch-icon, shortcut icon, msapplication-TileImage);
  - <title> Taiflix;
  - injecoes/body.html: tela de abertura e o <script> de custom/, inseridos
    logo após o fechamento de #reactRoot.

Uso (a partir deste diretório):
  docker run --rm --entrypoint cat jellyfin/jellyfin:<tag> \\
      /jellyfin/jellyfin-web/index.html | ./aplicar-injecoes.py > index.html

Falha (código 1, sem gerar saída) se algum ponto de encaixe não for encontrado
exatamente uma vez, o que indica mudança de estrutura no jellyfin-web.
"""
import re
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
HEAD = (AQUI / "injecoes/head.html").read_text().strip()
BODY = (AQUI / "injecoes/body.html").read_text().strip()

SUBSTITUICOES = [
    # Os três ícones originais são consecutivos; o bloco inteiro é trocado.
    (r'<link rel="apple-touch-icon"[^>]*>\s*<link rel="shortcut icon"[^>]*>\s*'
     r'<meta name="msapplication-TileImage"[^>]*>', HEAD),
    (r"<title>Jellyfin</title>", "<title>Taiflix</title>"),
    # #reactRoot contém apenas a .splashLogo estática; a injeção fica como
    # irmã de #reactRoot, fora da árvore controlada pelo React.
    (r'(<div id="reactRoot"><div class="splashLogo"></div></div>)', r"\1" + BODY.replace("\\", "\\\\")),
]


def main():
    html = sys.stdin.read()
    if "taiflix" in html.lower():
        sys.exit("entrada já contém injeções do Taiflix; use o index.html original da imagem")
    for padrao, novo in SUBSTITUICOES:
        html, n = re.subn(padrao, novo, html)
        if n != 1:
            sys.exit(f"ponto de encaixe encontrado {n} vezes (esperado 1): {padrao[:60]}")
    sys.stdout.write(html)


if __name__ == "__main__":
    main()
