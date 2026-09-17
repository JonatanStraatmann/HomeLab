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

O NTFS aceita hardlink, o que foi verificado antes de fechar esse desenho.

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

## Downloads incompletos em disco separado

O único bind que foge da regra acima é o de downloads em andamento
(`DOWNLOADS_INCOMPLETE`), que aponta para o disco **interno**, não para o da
biblioteca. O motivo está detalhado em
[03-problemas-conhecidos.md](03-problemas-conhecidos.md): a escrita aleatória em
`ntfs-3g` apresenta desempenho insuficiente e eleva o iowait a ponto de degradar o
sistema.

O arquivo pronto é movido para a biblioteca numa única passada sequencial, onde o
mesmo ntfs-3g rende 210 MB/s. Como a pasta de completos e a biblioteca ficam no mesmo
disco, os hardlinks continuam válidos.

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

## Recuperação automática do disco externo

A biblioteca reside em um SSD externo. Sua reconexão desassocia os volumes de todos os
containers, condição que `docker compose restart` não corrige — ver
[03-problemas-conhecidos.md](03-problemas-conhecidos.md). A recuperação é automatizada
pela seguinte cadeia:

```
udev (casa pelo UUID do disco)
   └─> serviço systemd
          └─> script que espera o disco montar E responder a uma leitura real
                 ├─> mata processos ntfs-3g órfãos
                 └─> recria as stacks com --force-recreate
```

Um timer executa a mesma verificação a cada 30 minutos, como medida redundante.

Os scripts dessa camada não integram este repositório, por dependerem de
identificadores específicos deste host (UUID do disco, porta USB e número de série).
O desenho é documentado aqui por ser reaproveitável independentemente da implementação.
