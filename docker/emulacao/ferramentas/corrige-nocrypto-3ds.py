#!/usr/bin/env python3
"""Liga o bit NoCrypto nas partições NCCH de um .3ds já descriptografado.

Ferramentas antigas descriptografavam o conteúdo mas deixavam o cabeçalho
dizendo "criptografado"; o Azahar confia no cabeçalho e recusa a ROM.
Altera só 8 bytes por partição (offset 0x188 do cabeçalho NCCH).

Uso: python3 corrige-nocrypto-3ds.py "arquivo.3ds"
"""
import struct
import sys

caminho = sys.argv[1]
with open(caminho, "r+b") as f:
    f.seek(0x100)
    if f.read(4) != b"NCSD":
        sys.exit("não é um .3ds (NCSD)")
    for i in range(8):
        f.seek(0x120 + i * 8)
        offset, tamanho = struct.unpack("<II", f.read(8))
        if not tamanho:
            continue
        base = offset * 0x200
        f.seek(base + 0x100)
        if f.read(4) != b"NCCH":
            continue
        # Só mexe se o conteúdo estiver de fato em claro: o exheader de uma
        # partição descriptografada começa com o nome do título em ASCII.
        f.seek(base + 0x200)
        titulo = f.read(8).rstrip(b"\0")
        if i == 0 and not (
            titulo and titulo.isascii() and titulo.decode("ascii").isprintable()
        ):
            sys.exit("conteúdo parece criptografado de verdade; nada alterado")
        f.seek(base + 0x188)
        flags = bytearray(f.read(8))
        antes = flags.hex()
        flags[3] = 0
        flags[7] = (flags[7] & ~0x01) | 0x04
        f.seek(base + 0x188)
        f.write(flags)
        print(f"partição {i}: {antes} -> {flags.hex()}")
print("ok")
