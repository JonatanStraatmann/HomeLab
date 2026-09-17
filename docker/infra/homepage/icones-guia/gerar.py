#!/usr/bin/env python3
"""Gera o icone da guia do navegador a partir da marca do painel.

Desenha a MESMA marca do cabecalho — o "anel orbital" (custom.css, secao [8c]) —
adaptada para tamanho pequeno. Ver o LEIA-ME, secao "Icone da guia".

DUAS DECISOES DE ADAPTACAO, as duas aprendidas errando:

1. FIGURA-FUNDO PRESERVADA: ladrilho ESCURO com a marca CLARA, igual ao
   cabecalho. A primeira tentativa inverteu (ladrilho claro, marca vazada) e o
   resultado nao foi so "diferente": num ANEL, inverter transforma o traco fino
   num anel grosso escuro com miolo claro, e o desenho passa a ler como um
   botao de liga/desliga. Inverter funciona para marcas cheias, nao para
   contornos.

2. SEM O RAIO: no cabecalho existe um raio ligando o nucleo ao satelite de
   cima. Em 16px ele funde os dois num borrao unico. Os satelites ficam sobre o
   anel, que ja faz a ligacao visual — o raio e dispensavel nesse tamanho.

E o anel e mais grosso aqui (2,8 contra 1,9 unidades): a 1,9 ele daria 0,95px
em 16px e sumiria. E por isso que as coordenadas existem em dois lugares: sao
dois desenhos para dois tamanhos, de proposito.

Uso:
    pip install --quiet --target /tmp/pylib pillow
    PYTHONPATH=/tmp/pylib python3 gerar.py

Escreve, nesta pasta, os quatro arquivos que o Homepage referencia no <head>:
favicon-16x16.png, favicon-32x32.png, apple-touch-icon.png e homepage.ico. Eles
sao montados sobre /app/public/ pelo docker-compose.yml; depois de regerar:

    cd "$HOMELAB/docker/infra" && sudo docker compose restart homepage

O navegador guarda favicon com afinco: pode ser preciso Ctrl+Shift+R, ou abrir
/favicon-32x32.png direto para forcar a releitura.

As cores sao a paleta "marinho" do custom.css (secao [1]), a padrao do painel.
O icone da guia NAO acompanha a troca de paleta: e arquivo, nao CSS.
"""
from PIL import Image, ImageDraw
import os

ACC2 = (226, 236, 250)   # --pl-acc2 de marinho: o claro da marca
ACC  = ( 93, 150, 233)   # --pl-acc  de marinho
C900 = (  8,  16,  38)   # --color-900: o ladrilho
C800 = ( 19,  34,  67)   # --color-800: o topo do ladrilho, para dar profundidade

S = 8            # supersampling: desenha em 8x e reduz, para suavizar
N = 32 * S       # grid de 32 unidades, o mesmo viewBox do SVG do CSS

R   = 11.6       # raio do anel
ESP = 2.8        # espessura do anel (no cabecalho e 1,9 — ver o docstring)


def mistura(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def degrade(de, para):
    """Degrade diagonal, de canto a canto."""
    im = Image.new("RGB", (N, N)); px = im.load()
    for y in range(N):
        for x in range(N):
            px[x, y] = mistura(de, para, (x + y) / (2 * (N - 1)))
    return im


def disco(r, cx=16.0, cy=16.0):
    m = Image.new("L", (N, N), 0)
    ImageDraw.Draw(m).ellipse([(cx - r) * S, (cy - r) * S,
                               (cx + r) * S, (cy + r) * S], fill=255)
    return m


def desenha():
    # --- ladrilho escuro, com as quinas arredondadas como a marca do cabecalho
    forma = Image.new("L", (N, N), 0)
    ImageDraw.Draw(forma).rounded_rectangle(
        [1 * S, 1 * S, 31 * S - 1, 31 * S - 1], radius=int(8.5 * S), fill=255)
    icone = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    icone.paste(degrade(C800, C900), (0, 0), forma)

    # --- a marca, em degrade claro, aplicada por mascaras
    marca = degrade(ACC2, ACC)

    # anel: disco externo menos disco interno. Dois discos concentricos dao
    # borda mais limpa no downsample do que ellipse(outline=..., width=...),
    # que serrilha nas diagonais.
    anel = disco(R + ESP / 2)
    anel.paste(0, (0, 0), disco(R - ESP / 2))
    icone.paste(marca, (0, 0), anel)

    # nucleo e os dois satelites, os dois EXATAMENTE sobre o anel
    icone.paste(marca, (0, 0), disco(4.3))
    icone.paste(marca, (0, 0), disco(2.9, 16.0, 4.2))
    # o diagonal e maior que o de cima: sem um raio conduzindo o olho, um disco
    # da espessura do anel leria como engrossamento do traco, nao como no
    d = R / (2 ** 0.5)
    icone.paste(marca, (0, 0), disco(3.2, 16.0 + d, 16.0 + d))
    return icone


if __name__ == "__main__":
    aqui = os.path.dirname(os.path.abspath(__file__))
    icone = desenha()
    for nome, tam in {"favicon-16x16.png": 16,
                      "favicon-32x32.png": 32,
                      "apple-touch-icon.png": 180}.items():
        icone.resize((tam, tam), Image.LANCZOS).save(os.path.join(aqui, nome))
        print(f"  {nome:24s} {tam}x{tam}")
    icone.resize((256, 256), Image.LANCZOS).save(
        os.path.join(aqui, "homepage.ico"),
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print("  homepage.ico             16/32/48/64/128/256")
