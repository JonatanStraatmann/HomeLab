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

Monte o disco **antes** de subir os containers e garanta que ele monta sozinho no boot.
Aqui a entrada de `/etc/fstab` usa o UUID (nunca `/dev/sdX`, que muda a cada replug) e
inclui `nofail` para o boot não travar se o disco estiver ausente:

```
UUID=<uuid-do-disco>  /mnt/dados  ntfs-3g  defaults,uid=1000,gid=1000,umask=022,windows_names,big_writes,nofail,x-systemd.device-timeout=15  0 0
```

`uid` e `gid` devem coincidir com `PUID` e `PGID` do `.env`. O NTFS não armazena
propriedade de arquivo no modelo POSIX, de modo que todos os arquivos são apresentados
como pertencentes ao usuário declarado na montagem.

Para bibliotecas em ext4, basta a montagem convencional; esta seção e a do quirk de USB
não se aplicam.

### Quirk de USB para adaptadores incompatíveis com UAS

Discos externos que apresentem erros `iuCRC` ou quedas de conexão sob carga podem
exigir a desativação do driver UAS para o dispositivo:

```
# /etc/modprobe.d/usb-storage-quirks.conf
options usb-storage quirks=174c:2362:u
```

`174c:2362` é o par vendor:product do adaptador — descubra o seu com `lsusb`.

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

Em **Downloads**, estas duas configurações são o que faz o import por hardlink
funcionar — se estiverem erradas, tudo continua funcionando mas passa a copiar arquivo
em vez de criar link:

```
Salvar em:                    /data/Downloads/completos
Manter incompletos em:        /incompletos     (habilitado)
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

1. **Administração → Fontes de metadados**: crie conta em cada provedor que quiser
   usar e cole as chaves. O Hasheous já vem habilitado e não exige conta.
2. **Administração → Gerenciamento da biblioteca → Escanear**: identifica os arquivos
   colocados em `${ROMS_ROOT}/roms/<plataforma>/` (a estrutura de pastas está em
   [00-arquitetura.md](00-arquitetura.md); os slugs de plataforma seguem a lista
   oficial do RomM, por exemplo `snes` e `gba`).
3. **Administração → Client API Tokens**: crie um token com escopo
   `platforms.read roms.read` para o card "ROMs por console" do painel.

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
