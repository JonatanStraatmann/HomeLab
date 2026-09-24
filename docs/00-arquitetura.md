# Arquitetura

## Por que quatro stacks e não uma

Os serviços estão divididos em quatro `docker-compose.yml` porque têm requisitos de
rede incompatíveis entre si:

- **`jellyfin/`** roda em `network_mode: host`. Precisa disso para a descoberta DLNA
  funcionar e para enxergar os IPs reais da LAN.
- **`infra/`** tem o AdGuard também em `host`, pelo mesmo motivo invertido: ele precisa
  ver o IP de origem real de cada consulta para aplicar regras por cliente. Numa rede
  bridge, tudo chegaria com o IP do gateway do Docker e as regras por dispositivo
  seriam inúteis.
- **`arr-stack/`** fica numa rede bridge própria, onde os serviços se enxergam por
  nome de container.
- **`emulacao/`** também fica numa rede bridge própria, pelo mesmo motivo do
  `arr-stack`: o RomM só precisa enxergar o próprio banco (`romm-db`), por nome de
  container.

A consequência prática: o Homepage (em `infra`) e as demais stacks não se enxergam por
nome. Por isso os widgets do painel usam o IP do host — todos publicam porta nele.

## Conflitos de porta contornados

| Porta | Quem já ocupa | Solução |
|---|---|---|
| 53 | `systemd-resolved`, mas só em 127.0.0.53/54 | AdGuard escuta nos IPs reais; não é preciso desabilitar o stub |
| 443 | `tailscaled` (Serve/Funnel) no IP do Tailscale | Nginx Proxy Manager publica 443 só no IP da LAN |
| 3000 | AdGuard | Homepage usa 3001 no host, 3000 dentro do container |

## Import por hardlink

Todos os serviços do `arr-stack` montam a mesma raiz (`VIDEO_ROOT`) no mesmo caminho
interno (`/data`). Isso não é detalhe de estilo: com um único volume, Radarr e Sonarr
importam os arquivos por **hardlink** em vez de copiar — instantâneo e sem duplicar
espaço em disco.

Se cada serviço montasse um caminho diferente, o Docker apresentaria os arquivos como
sistemas de arquivos distintos e o hardlink falharia silenciosamente, caindo em cópia.

O hardlink exige apenas que origem e destino estejam no mesmo sistema de arquivos. A
biblioteca reside em ext4 no disco interno; NTFS montado via `ntfs-3g` também aceita
hardlink, mas traz as restrições descritas em
[03-problemas-conhecidos.md](03-problemas-conhecidos.md#biblioteca-em-disco-externo-ntfs).

O qBittorrent grava diretamente em `/data/Downloads`, dentro da mesma raiz, sem
diretório temporário em outro volume. Em ext4, a escrita fora de ordem do BitTorrent
não degrada o sistema a ponto de justificar essa separação.

## Estado dos containers no disco de sistema

A biblioteca e o estado dos aplicativos têm padrões de acesso opostos. A mídia é lida
em sequência, em blocos grandes, o que um HD mecânico atende bem. Bancos SQLite e
MariaDB, metadados, logs e segmentos de transcodificação produzem gravações pequenas e
aleatórias, que no HD custam um deslocamento da cabeça de leitura cada uma e disputam o
disco com a reprodução em curso.

Por isso o estado gerado pelos containers fica em `APPDATA_ROOT`, no disco de sistema
(NVMe), enquanto a mídia permanece em `MEDIA_ROOT`:

| Stack | Caminho em `APPDATA_ROOT` | Conteúdo |
|---|---|---|
| `jellyfin` | `jellyfin/config`, `jellyfin/cache` | banco da biblioteca, metadados, imagens, `cache/transcodes` |
| `arr-stack` | `arr-stack/<serviço>/config` | bancos SQLite, logs e backups automáticos de cada serviço |
| `emulacao` | `emulacao/romm-db/data`, `emulacao/romm/{resources,redis-data,assets}` | banco MariaDB, capas e metadados, fila de tarefas, saves |

O que é escrito à mão continua no repositório: a configuração do painel, o
`index.html` e os scripts do Jellyfin e a stack `infra` inteira, cujo estado é
pequeno e de baixa taxa de escrita. O `config.yml` do RomM é exceção: fica em
`docker/emulacao/romm/config/`, mas fora do git, porque o próprio RomM o regrava
(como root) ao salvar ajustes pela interface. Para editá-lo sem sudo, use
`docker exec romm ...` sobre `/romm/config/config.yml`.

A transcodificação é o caso de maior volume: cada sessão grava vários gigabytes de
segmentos em `cache/transcodes`, que o Jellyfin remove ao final. Com o cache no NVMe, o
HD fica dedicado à leitura do arquivo de origem.

O tamanho total do estado é da ordem de 3 a 4 GB. O que cresce com o uso é
`jellyfin/config` (metadados e imagens por item da biblioteca) e
`emulacao/romm/resources` (capas por ROM); convém acompanhar o espaço livre em `/`.

## Estrutura da biblioteca de ROMs

O RomM espera, dentro de `ROMS_ROOT`, uma pasta `roms/` com uma subpasta por
plataforma, nomeada pelo slug que o próprio RomM usa internamente — não pelo nome
comum do console. Os dois relevantes aqui:

```
ROMS_ROOT/
  roms/
    snes/
    gba/
```

Um nome de pasta fora da lista de slugs conhecida não é reconhecido no escaneamento;
nesse caso, o mapeamento manual fica em `system.platforms`, dentro do `config.yml`
gerado pelo próprio RomM.

## DNS em três camadas

Os nomes `.jts` resolvem assim:

```
dispositivo na tailnet
   └─> Split DNS do Tailscale  (rota: domínio .jts -> este servidor)
          └─> AdGuard Home     (reescrita curinga: *.jts -> IP da LAN)
                 └─> Nginx Proxy Manager  (nome -> porta do serviço)
```

Só a terceira camada exige cadastro por serviço. As duas primeiras são configuradas
uma vez e valem para qualquer nome novo.

O TLD escolhido foi `.jts` justamente por não existir de verdade. `.casa` e `.lan`
**são TLDs reais** — usá-los faz consultas vazarem para a internet quando o DNS
interno não responde.

## Distribuição do DNS restrita à tailnet

O DNS do AdGuard é entregue **apenas aos dispositivos da tailnet**, nunca pelo DHCP do
roteador.

A decisão é deliberada e trata de disponibilidade. Distribuir o servidor DNS via DHCP
tornaria toda a rede doméstica dependente deste host: uma indisponibilidade do servidor
deixaria sem resolução de nomes todos os dispositivos, inclusive os que não têm relação
com os serviços aqui hospedados. Na configuração atual, a falha do servidor implica
apenas a perda dos nomes internos e da filtragem de anúncios.

Como efeito secundário, **desativar o Tailscale no dispositivo restaura imediatamente o
DNS do roteador**, o que constitui o procedimento de contorno mais rápido em caso de
falha e não requer acesso ao servidor.
