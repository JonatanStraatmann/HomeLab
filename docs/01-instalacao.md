# Instalação do zero

Este documento cobre o que o `docker compose up` **não** faz por você: preparar o host
e configurar cada aplicativo na primeira execução.

Leia [00-arquitetura.md](00-arquitetura.md) antes, para entender por que as coisas
estão divididas como estão.

## 1. Host

### Docker

Docker Engine e o plugin Compose v2 (`docker compose`, sem hífen). O usuário que roda
as stacks precisa estar no grupo `docker`.

### O disco da biblioteca

Monte o disco **antes** de subir os containers e garanta que ele monta sozinho no boot,
pelo UUID em `/etc/fstab` (nunca por `/dev/sdX`, que pode mudar entre inicializações).
`MEDIA_ROOT`, `VIDEO_ROOT` e `ROMS_ROOT` apontam para pastas dentro dele.

Um sistema de arquivos nativo do Linux (ext4) é o caso simples: basta que as pastas da
biblioteca pertençam ao usuário de `PUID`/`PGID`. Para bibliotecas em disco externo
com NTFS, a montagem exige opções próprias e há comportamentos adicionais a tratar —
ver [03-problemas-conhecidos.md](03-problemas-conhecidos.md#biblioteca-em-disco-externo-ntfs).

### Pasta de estado dos containers

Bancos, metadados e cache dos aplicativos ficam fora do repositório, em `APPDATA_ROOT`
(ver [00-arquitetura.md](00-arquitetura.md#estado-dos-containers-no-disco-de-sistema)).
Crie a pasta num disco de acesso aleatório rápido, com o usuário das stacks como dono,
antes do primeiro `docker compose up`:

```bash
sudo install -d -o "$(id -u)" -g "$(id -g)" -m 755 /srv/homelab
```

Se a pasta não existir, o Docker a cria como `root` na primeira montagem, e os
serviços que rodam com `PUID`/`PGID` falham ao gravar a própria configuração.

### Tailscale

Instale e autentique. Depois, no painel do Tailscale, adicione uma rota de **Split
DNS** apontando o seu domínio interno (`INTERNAL_DOMAIN`) para o IP Tailscale deste
servidor. Sem isso os nomes `.jts` só funcionam se o AdGuard for o DNS do dispositivo.

## 2. Configuração

```bash
cp .env.example .env
${EDITOR:-nano} .env
```

Cada variável está comentada com o comando que obtém o valor correspondente. Requerem
atenção particular:

- `RENDER_GID` e `VIDEO_GID` variam conforme a distribuição (`getent group render`)
- `PUID` e `PGID` devem coincidir com `uid` e `gid` da montagem da biblioteca
- `ROMM_DB_PASSWORD`, `ROMM_DB_ROOT_PASSWORD` e `ROMM_AUTH_SECRET_KEY` são gerados
  localmente (`openssl rand -hex 16` para os dois primeiros, `-hex 32` para o
  terceiro) — não deixe em branco, o RomM não sobe sem eles
- as `HOMEPAGE_VAR_*_KEY` só podem ser obtidas após os serviços estarem em execução;
  deixe-as em branco nesta etapa e retorne no passo 5

## 3. Subir as stacks

```bash
for d in jellyfin infra arr-stack emulacao; do (cd docker/$d && docker compose up -d); done
```

Se faltar variável no `.env`, o Compose aborta dizendo o nome dela. Isso é proposital:
sem isso, uma variável ausente viraria string vazia e produziria montagens do tipo
`:/media:ro`, cujo diagnóstico é consideravelmente mais difícil. As `HOMEPAGE_VAR_*_KEY`
citadas acima são a exceção deliberada: ficam em branco sem abortar, porque nesta etapa
os serviços que gerariam essas chaves ainda nem subiram.

## 4. Primeira execução de cada aplicativo

Os aplicativos geram os próprios arquivos de configuração no primeiro boot, e é por
isso que eles não estão versionados: têm chaves de API, hashes de senha e estado que
são únicos por instalação.

### AdGuard Home (`http://<ip>:3000`)

Assistente inicial: defina usuário e senha. Depois:

1. **Filtros → Listas de bloqueio**: adicione as listas que quiser.
2. **Filtros → Reescritas de DNS**: crie `*.<seu-domínio>` apontando para o IP da LAN
   do servidor. É essa regra curinga que faz qualquer nome novo funcionar sem cadastro.
3. Lembre que reescritas adicionadas direto no YAML nascem desabilitadas — pela
   interface isso não acontece.

Há um exemplo higienizado da configuração completa em
`docker/infra/adguard/AdGuardHome.example.yaml`. Para usá-lo, pare o container antes
de copiar: o AdGuard sobrescreve o arquivo ao parar.

### Nginx Proxy Manager (`http://<ip>:81`)

Login padrão `admin@example.com` / `changeme` — troque imediatamente.

Crie um **Proxy Host** por serviço, apontando o nome (`filmes.jts`) para o IP da LAN e
a porta correspondente da tabela do README. São 10 no total.

### qBittorrent (`http://<ip>:8080`)

A senha temporária do primeiro boot aparece no log:

```bash
docker compose logs qbittorrent | grep -i password
```

Em **Downloads**, o caminho de salvamento precisa ficar dentro de `/data`, a mesma raiz
que Radarr e Sonarr enxergam — é isso que faz o import por hardlink funcionar. Se
estiver fora, tudo continua funcionando, mas os arquivos passam a ser copiados em vez
de vinculados:

```
Salvar em:                    /data/Downloads
Manter incompletos em:        (desabilitado)
```

### Radarr / Sonarr (`:7878` / `:8989`)

1. **Media Management → Root Folders**: adicione `/data/Filmes` e `/data/Series`.
2. **Settings → Download Clients**: adicione o qBittorrent pelo nome do container
   (`qbittorrent`, porta 8080) — eles estão na mesma rede bridge.
3. **Settings → Media Management**: ative "Use Hardlinks instead of Copy".
4. **Settings → General**: configure a lixeira (`Recycle Bin`) **antes** de mexer na
   organização de pastas. Veja [03-problemas-conhecidos.md](03-problemas-conhecidos.md) — o Sonarr apaga
   legendas permanentemente sem isso.

### Prowlarr (`:9696`)

Adicione seus indexadores e, em **Settings → Apps**, cadastre Radarr e Sonarr. O
Prowlarr empurra os indexadores para eles — você não precisa cadastrar nada duas vezes.

### Bazarr (`:6767`)

Conecte Radarr e Sonarr (host: nome do container, porta correspondente) e configure os
provedores de legenda. Prefira scan item a item ao scan em lote.

### Jellyfin (`:8096`)

Assistente inicial, e adicione as bibliotecas apontando para `/media`. Se for usar
transcodificação por hardware: **Painel → Reprodução** → VAAPI, dispositivo
`/dev/dri/renderD128`.

### Seerr (`:5055`)

Conecte ao Jellyfin, ao Radarr e ao Sonarr. Ele pede a API key de cada um.

### RomM (`:8090`)

Assistente inicial cria o usuário administrador. Depois:

1. **Fontes de metadados**: crie conta em cada provedor que quiser usar e preencha
   as variáveis `ROMM_*` correspondentes no `.env` (depois,
   `docker compose up -d romm`). O Hasheous já vem habilitado e não exige conta. O
   IGDB exige um aplicativo no [console de desenvolvedor do Twitch](https://dev.twitch.tv/console)
   (conta com autenticação em dois fatores; categoria *Application Integration*,
   tipo *Confidential*, redirect `http://localhost`, nome único).
2. **Administração → Gerenciamento da biblioteca → Escanear**: identifica os arquivos
   colocados em `${ROMS_ROOT}/roms/<plataforma>/` (a estrutura de pastas está em
   [00-arquitetura.md](00-arquitetura.md); os slugs de plataforma seguem a lista
   oficial do RomM, por exemplo `snes` e `gba`).
3. **Administração → Client API Tokens**: crie um token com escopo
   `platforms.read roms.read` para o card "Biblioteca (RomM)" do painel.

#### Streaming de emulador (PS2, Dreamcast, 3DS)

O EmulatorJS, que roda no navegador do cliente, não cobre PS2 nem Dreamcast. Esses
consoles, e o 3DS, rodam no container `romm-webstation`: o emulador executa no
servidor, com a GPU Intel integrada, e o navegador recebe apenas o vídeo.

1. Gere `ROMM_STREAMING_BROKER_SECRET` no `.env` (`openssl rand -hex 32`); o mesmo
   valor autentica o RomM junto ao broker do container.
2. Exponha o container **e o próprio RomM** em HTTPS, restritos à tailnet. O
   Selkies exige contexto seguro, e o navegador só o concede ao stream (embutido
   num iframe) se a página do RomM também estiver em HTTPS; aberto por
   `http://roms.jts`, o stream falha com *"This application requires a secure
   connection (HTTPS)"*:
   ```bash
   tailscale serve --bg --https=8443 http://127.0.0.1:3010   # webstation
   tailscale serve --bg --https=8444 http://127.0.0.1:8090   # RomM
   ```
   Para jogar via streaming, acesse o RomM por
   `https://<nome-do-servidor>.<tailnet>.ts.net:8444`.
3. Acrescente ao `config.yml` do RomM o bloco `streaming`, com `host` apontando
   para `https://<nome-do-servidor>.<tailnet>.ts.net:8443`, `subfolder: /streaming`,
   `broker_host: http://romm-webstation:3000` e as plataformas `ps2: pcsx2`,
   `dc: retroarch` e `3ds: retroarch`. O nome do emulador identifica os saves no
   RomM e não deve ser trocado depois.
4. Pelo RomM, abra uma **sessão de desktop** no container e configure cada
   emulador uma vez: o PCSX2 exige a BIOS do PS2; o núcleo Flycast do RetroArch
   aceita a BIOS do Dreamcast (`dc_boot.bin`, `dc_flash.bin`) em
   `/config/.config/retroarch/system/dc/`. O 3DS não exige BIOS, mas a ROM precisa
   estar descriptografada.

O streaming abre apenas arquivos soltos: jogos compactados (`.zip`, `.7z`) precisam
ser extraídos antes do scan. Jogos de Dreamcast em `.gdi` com várias faixas ficam
numa subpasta própria, tratada pelo RomM como um único jogo.

## 5. Preencher as chaves do painel

Com os serviços em execução, colete as API keys (em cada serviço, **Settings → General**)
e preencha as `HOMEPAGE_VAR_*` do `.env`. Depois:

```bash
(cd docker/infra && docker compose up -d)
```

Confira se os cards do painel mostram números. Se algum mostrar o texto literal
`{{HOMEPAGE_VAR_...}}`, falta aquela variável no `.env` — o Homepage não reclama no
log.

## 6. Verificação periódica (opcional)

Recomenda-se um timer que verifique periodicamente a integridade dos containers. A
verificação não deve se limitar ao estado `running`: convém confirmar que há rede
anexada e que as portas configuradas estão efetivamente publicadas. Já se observou
container reportado como `Up` pelo Docker sem rede nem portas ativas, condição que
apenas `docker compose up -d --force-recreate` corrige.

O script utilizado nesta instalação não é versionado por depender de identificadores
específicos do host; o desenho está descrito em [00-arquitetura.md](00-arquitetura.md).
