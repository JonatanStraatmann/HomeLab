# HomeLab

Servidor doméstico 24/7 rodando num notebook Dell G3 com Linux Mint: streaming de
mídia, automação de downloads, catálogo de ROMs, DNS com bloqueio de anúncios e um
painel central — tudo acessível por nomes curtos (`taiflix.jts`, `pedidos.jts`) dentro
de casa e pela VPN, sem expor nada à internet.

São quatro stacks Docker independentes, um painel bastante customizado e uma camada de
recuperação automática para o disco externo que guarda a biblioteca.

## Serviços

| Nome interno | Serviço | Porta | Para que serve |
|---|---|---|---|
| `central.jts` | Homepage | 3001 | Painel inicial, com status de tudo |
| `taiflix.jts` | Jellyfin | 8096 | Streaming (com branding próprio, veja abaixo) |
| `pedidos.jts` | Seerr | 5055 | Onde se pede um filme ou série |
| `filmes.jts` | Radarr | 7878 | Biblioteca de filmes |
| `series.jts` | Sonarr | 8989 | Biblioteca de séries |
| `legendas.jts` | Bazarr | 6767 | Legendas automáticas |
| `indexadores.jts` | Prowlarr | 9696 | Fontes de busca para Radarr/Sonarr |
| `torrent.jts` | qBittorrent | 8080 | Cliente de download |
| `roms.jts` | RomM | 8090 | Catálogo de ROMs |
| `dns.jts` | AdGuard Home | 3000 | DNS da rede + bloqueio |
| `proxy.jts` | Nginx Proxy Manager | 81 | Traduz os nomes `.jts` para as portas |

## Pré-requisitos

- Docker e Docker Compose v2
- Tailscale (usado para acesso remoto e para entregar o DNS interno só a quem está
  na VPN — veja [docs/00-arquitetura.md](docs/00-arquitetura.md))
- Um disco para a biblioteca, montado no host antes de subir os containers
- Opcional: uma GPU com VAAPI para transcodificação por hardware no Jellyfin

## Instalação

```bash
git clone https://github.com/JonatanStraatmann/HomeLab.git
cd HomeLab
cp .env.example .env
${EDITOR:-nano} .env          # todos os valores são explicados ali dentro
for d in jellyfin infra arr-stack emulacao; do (cd docker/$d && docker compose up -d); done
```

Quase nenhuma variável tem valor padrão silencioso: se faltar alguma no `.env`, o
Compose aborta dizendo qual é. A exceção são as `HOMEPAGE_VAR_*_KEY` (e usuário/senha
equivalentes) do painel — essas só existem depois que cada serviço já está no ar e gera
sua própria chave, então ficam em branco na primeira subida sem abortar o Compose; o
card correspondente mostra o texto literal `{{HOMEPAGE_VAR_...}}` até ser preenchida.
Depois de subir, cada aplicativo precisa de uma configuração inicial pela própria
interface — o passo a passo está em [docs/01-instalacao.md](docs/01-instalacao.md).

## Mapa do repositório

```
docker/
  jellyfin/      Jellyfin + o branding "Taiflix" em web-custom/
  arr-stack/     Radarr, Sonarr, Bazarr, Prowlarr, qBittorrent, Seerr
  emulacao/      RomM + banco próprio, catálogo de ROMs
  infra/         AdGuard Home, Nginx Proxy Manager, Homepage
docs/            Arquitetura, instalação, operação do painel e problemas conhecidos
.env.example     Contrato de configuração; copie para .env
```

Os três `docker/*/.env` são symlinks para o `.env` da raiz. É de propósito: um `.env`
por stack divergiria em silêncio, e o script de health check roda `docker compose` sem
flags, então o arquivo precisa estar onde o Compose procura sozinho.

## Aviso importante: bind mounts de arquivo único

Seis arquivos são montados individualmente dentro dos containers (o `index.html` do
Jellyfin, o `pt-BR.json` do Homepage e quatro favicons). Ferramentas que reescrevem um
arquivo trocando o inode — **incluindo `git checkout` e `git pull`** — descolam esses
mounts em silêncio: o container continua servindo o conteúdo antigo, sem erro nenhum.

Depois de qualquer operação de git que toque `docker/`, rode:

```bash
for d in jellyfin infra; do (cd docker/$d && docker compose up -d --force-recreate); done
```

Este e outros comportamentos não evidentes estão documentados em
[docs/03-problemas-conhecidos.md](docs/03-problemas-conhecidos.md).

## Limites de reprodutibilidade

Parte da configuração depende do hardware e da rede específicos desta instalação:

- **Os GIDs `render` e `video`** (`RENDER_GID`, `VIDEO_GID`) variam por distribuição.
  Os valores do `.env.example` são os do Linux Mint 22; confira os seus com
  `getent group render`.
- **A transcodificação por hardware** depende de uma iGPU Intel com Quick Sync. Sem
  ela, remova o bloco `devices:` do compose do Jellyfin.
- **A biblioteca aqui está em NTFS**, num SSD externo. Isso motiva metade dos cuidados
  do repositório (downloads incompletos em disco separado, quirk de USB, recuperação
  automática no replug). Em ext4 local, boa parte disso não se aplica.
- **O domínio `.jts` e o DNS em três camadas** pressupõem Tailscale com Split DNS. Dá
  para trocar por `/etc/hosts` ou pelo DNS do roteador, com as ressalvas explicadas em
  [docs/00-arquitetura.md](docs/00-arquitetura.md).
- **Os widgets "VPN", "Painel Wakfu" e "ROMs por console"** consultam um serviço HTTP
  na porta 8099 do host, externo a este repositório. Servem como exemplo de widget
  `customapi` e podem ser removidos do `services.yaml` caso não haja serviço
  equivalente.

São diretamente reaproveitáveis os três `docker-compose.yml`, comentados com a
justificativa de cada decisão; a customização completa do Homepage (`custom.css`,
`custom.js` e o arquivo de tradução pt-BR); a personalização da interface do Jellyfin;
e a documentação de problemas conhecidos.

## Componentes e créditos

Este repositório contém apenas configuração, documentação e personalização visual. Todo
o software é de terceiros, sob as licenças indicadas:

| Projeto | Licença | Função |
|---|---|---|
| [Jellyfin](https://github.com/jellyfin/jellyfin) | GPL-2.0 | Servidor de mídia |
| [Radarr](https://github.com/Radarr/Radarr) | GPL-3.0 | Gerenciamento de filmes |
| [Sonarr](https://github.com/Sonarr/Sonarr) | GPL-3.0 | Gerenciamento de séries |
| [Bazarr](https://github.com/morpheus65535/bazarr) | GPL-3.0 | Legendas |
| [Prowlarr](https://github.com/Prowlarr/Prowlarr) | GPL-3.0 | Gerenciamento de indexadores |
| [qBittorrent](https://github.com/qbittorrent/qBittorrent) | GPL-2.0+ (binário GPL-3.0+) | Cliente de transferência |
| [Seerr](https://github.com/seerr-team/seerr) | MIT | Interface de solicitações |
| [AdGuard Home](https://github.com/AdguardTeam/AdGuardHome) | GPL-3.0 | Servidor DNS com filtragem |
| [Nginx Proxy Manager](https://github.com/NginxProxyManager/nginx-proxy-manager) | MIT | Proxy reverso |
| [Homepage](https://github.com/gethomepage/homepage) | GPL-3.0 | Painel |
| [RomM](https://github.com/rommapp/romm) | AGPL-3.0 | Catálogo de ROMs |
| [MariaDB](https://github.com/MariaDB/server) | GPL-2.0 | Banco de dados do RomM |

As imagens de container da stack de automação são as mantidas pela
[LinuxServer.io](https://github.com/linuxserver).

A configuração se apoia em duas fontes de documentação:

- [Servarr Wiki](https://wiki.servarr.com/) — documentação oficial de Radarr, Sonarr,
  Bazarr e Prowlarr ([repositório](https://github.com/Servarr/Wiki))
- [TRaSH Guides](https://trash-guides.info/) — referência para a organização de pastas
  que viabiliza o import por hardlink descrito em
  [docs/00-arquitetura.md](docs/00-arquitetura.md)
  ([repositório](https://github.com/TRaSH-Guides/Guides))

## Sobre o uso

A stack é agnóstica quanto ao conteúdo: ela indexa e transfere o que for configurado
pelo operador. Este repositório não inclui, não sugere e não distribui indexadores,
listas de fontes, ROMs ou material protegido — a configuração de indexadores do
Prowlarr e a biblioteca do RomM não são versionadas.

A responsabilidade pelas fontes utilizadas e pela conformidade com a legislação de
direitos autorais aplicável é de quem opera a instalação.

## Ordem de leitura sugerida

`README` → [00-arquitetura](docs/00-arquitetura.md) →
[01-instalacao](docs/01-instalacao.md) →
[03-problemas-conhecidos](docs/03-problemas-conhecidos.md).

[02-painel](docs/02-painel.md) é material de consulta sobre a operação do painel.
