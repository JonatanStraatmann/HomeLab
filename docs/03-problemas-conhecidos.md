# Problemas conhecidos

Comportamentos não evidentes desta arquitetura, com sintoma, causa e solução. Vários
deles falham silenciosamente: o serviço continua respondendo, mas opera sobre dados
desatualizados ou incorretos.

## AdGuard Home sobrescreve o arquivo de configuração ao encerrar

**Sintoma.** Alterações feitas diretamente em `AdGuardHome.yaml` desaparecem após o
reinício do container.

**Causa.** O AdGuard Home mantém a configuração em memória e reescreve o arquivo YAML
durante o encerramento do processo.

**Solução.** Interromper o container antes de editar:

```bash
docker stop adguard
# editar conf/AdGuardHome.yaml
docker start adguard
```

**Observação adicional.** Reescritas de DNS inseridas diretamente no YAML assumem
`enabled: false` quando o campo é omitido. O valor deve ser declarado explicitamente,
caso contrário a regra aparece na interface sem efeito na resolução.

Por esse comportamento o arquivo em uso não é versionado — ele produziria alterações
espúrias a cada parada do container. O repositório mantém apenas um modelo de
referência em `docker/infra/adguard/AdGuardHome.example.yaml`.

## Bind mounts de arquivo único são invalidados por operações de git

**Sintoma.** Após `git pull` ou `git checkout`, o container continua servindo a versão
anterior do arquivo por tempo indeterminado. Nenhum erro é registrado.

**Arquivos afetados.**

- `docker/jellyfin/web-custom/index.html`
- `docker/infra/homepage/locales/pt-BR.json`
- os quatro ícones em `docker/infra/homepage/icones-guia/`

**Causa.** Um bind mount de arquivo referencia um inode específico. Ferramentas que
substituem o arquivo criando um novo e renomeando sobre o original — comportamento
padrão do git e da maioria dos editores — rompem a associação. O container permanece
vinculado ao inode anterior.

**Solução.** Após qualquer operação de git que afete esses caminhos:

```bash
for d in jellyfin infra; do (cd docker/$d && docker compose up -d --force-recreate); done
```

Bind mounts de diretório, como `web-custom/custom/`, não apresentam esse
comportamento: alterações nos arquivos internos são refletidas imediatamente.

## Atualização do Jellyfin torna o index.html customizado obsoleto

**Sintoma.** Após atualizar a imagem do Jellyfin, a interface apresenta comportamento
inconsistente ou o conteúdo customizado deixa de funcionar.

**Causa.** O `index.html` versionado é uma cópia extraída da imagem com uma linha
adicional de `<script>`. O bind mount sobrepõe o arquivo da imagem nova, mantendo em
uso o HTML de uma versão anterior do Jellyfin.

**Solução.** Ao atualizar a imagem, extrair o `index.html` da nova versão e reaplicar a
inclusão do script.

## Sonarr remove legendas durante rescan

**Sintoma.** Arquivos `.srt` adjacentes aos vídeos são excluídos permanentemente, sem
registro em log e sem possibilidade de recuperação.

**Causa.** Durante `RescanSeries`, quando os caminhos dos episódios foram alterados e a
lixeira (`Recycle Bin`) não está configurada, o Sonarr classifica os arquivos de
legenda como *extra files* órfãos e os remove.

**Solução.** Configurar o diretório de lixeira em **Settings → Media Management** antes
de qualquer reorganização da biblioteca.

## Varredura em lote do Bazarr é incompleta

**Sintoma.** Itens permanecem marcados como legenda ausente embora o arquivo exista em
disco.

**Causa.** A operação `scan-disk` sem identificador processa o conjunto de forma
incompleta e não sinaliza erro.

**Solução.** Utilizar a varredura individual por item, que não apresentou falhas nos
testes realizados.

## Locale pt_BR é inválido no Homepage

**Sintoma.** Valores de tamanho em bytes são exibidos sem formatação, como números
inteiros longos.

**Causa.** `pt_BR`, com sublinhado, não é uma tag de idioma válida segundo a BCP 47 e
provoca falha em `toLocaleString`. A forma correta é `pt-BR`, que, entretanto, não
inclui as traduções de Jellyfin e Seerr disponíveis apenas no conjunto `pt_BR`.

**Solução.** Utilizar `pt-BR` e montar um arquivo de tradução consolidado em
`homepage/locales/pt-BR.json`, combinando os dois conjuntos.

**Observação adicional.** A unidade de memória é fixada como `binary: true` no
componente e não responde a ajustes de locale; a conversão é feita em `custom.js`.

## Dependências posicionais na faixa de recursos do Homepage

**Sintoma.** Alterações na composição da faixa superior do painel quebram a numeração
do ícone de disco e a conversão de unidade de memória, sem erro visível.

**Causa.** Ambas as personalizações utilizam seletores `:nth-child()` sobre a faixa de
recursos, em `custom.css` e `custom.js`.

**Solução.** Revisar os dois arquivos ao adicionar ou remover elementos dessa faixa.

## Variáveis ausentes no Homepage falham silenciosamente

**Sintoma.** Um card do painel não apresenta dados, exibindo o texto literal
`{{HOMEPAGE_VAR_X}}`.

**Causa.** O Homepage resolve essas referências a partir do ambiente do container. Não
há registro em log quando a variável não existe.

**Verificação.** Consulta direta ao proxy de widgets, sem necessidade de navegador:

```bash
curl -s -G 'http://localhost:3001/api/services/proxy' \
  --data-urlencode 'group=Automação de Mídia' \
  --data-urlencode 'service=Filmes (Radarr)' \
  --data-urlencode 'endpoint=movie'
```

## Stream de emulador falha com "requires a secure connection (HTTPS)"

**Sintoma.** Ao iniciar um jogo por streaming, o emulador abre no container, mas o
navegador exibe *"Error: This application requires a secure connection (HTTPS)"*.

**Causa.** O stream do Selkies é embutido num iframe da página do RomM e exige contexto
seguro. O navegador só concede esse contexto ao iframe se a página que o contém também
estiver em HTTPS; aberto por `http://roms.jts`, o RomM torna o stream inseguro, mesmo
com o iframe apontando para um endereço HTTPS.

**Solução.** Acessar o RomM pelo endereço HTTPS do `tailscale serve` (porta 8444),
descrito em [01-instalacao.md](01-instalacao.md).

## ROM de 3DS "descriptografada" é recusada como criptografada

**Sintoma.** O streaming de 3DS não inicia; o núcleo Azahar registra *"This ROM is
encrypted and must be decrypted before use with Azahar"*, embora o arquivo tenha sido
distribuído como descriptografado.

**Causa.** Ferramentas antigas descriptografavam o conteúdo sem ligar o bit
`NoCrypto` do cabeçalho NCCH. O Azahar decide pelo cabeçalho, não pelo conteúdo.

**Solução.** Se o conteúdo estiver de fato em claro, ligar o bit com
`docker/emulacao/ferramentas/corrige-nocrypto-3ds.py "<arquivo>.3ds"`. O script altera
apenas 8 bytes por partição e recusa o arquivo se o cabeçalho estendido não estiver
legível (conteúdo realmente criptografado).

## Arquivo excluído pela interface do RomM passa a ser ignorado

**Sintoma.** Um jogo recolocado na biblioteca não aparece após o scan.

**Causa.** Ao excluir um jogo pela interface, o RomM acrescenta o nome do arquivo a
`exclude.roms.single_file.names` no `config.yml`. Um arquivo com o mesmo nome é
ignorado em silêncio nos scans seguintes.

**Solução.** Remover o nome da lista de exclusão no `config.yml` (via `docker exec`,
ver [00-arquitetura.md](00-arquitetura.md)) ou recolocar o arquivo com outro nome.

## Biblioteca em disco externo NTFS

Os itens desta seção não se aplicam à configuração atual, em que a biblioteca reside
em ext4 no disco interno. Permanecem documentados porque afetam qualquer instalação que
mantenha a biblioteca num disco externo formatado em NTFS e montado via `ntfs-3g`.

### Montagem

```
UUID=<uuid-do-disco>  /mnt/dados  ntfs-3g  defaults,uid=1000,gid=1000,umask=022,windows_names,big_writes,nofail,x-systemd.device-timeout=15  0 0
```

`uid` e `gid` devem coincidir com `PUID` e `PGID` do `.env`: o NTFS não armazena
propriedade de arquivo no modelo POSIX, e todos os arquivos são apresentados como
pertencentes ao usuário declarado na montagem. `nofail` impede que o boot trave com o
disco ausente.

### Reconexão do disco externo desconecta os volumes dos containers

**Sintoma.** Após desconectar e reconectar o disco da biblioteca, o host monta o
volume normalmente e `ls` no ponto de montagem funciona, mas todos os containers de
mídia passam a enxergar o diretório vazio. Nenhum erro é registrado.

**Causa.** Os binds utilizam propagação `rshared`, que propaga montagens criadas
*dentro* do ponto de montagem, mas não a substituição do ponto de montagem em si. Na
reconexão o dispositivo recebe outro nó `/dev/sdX` e a nova montagem é criada em outro
grupo de propagação. O bind do container permanece associado ao grupo anterior, já
destruído.

**Solução.** Recriar os containers:

```bash
docker compose up -d --force-recreate
```

`docker compose restart` não resolve o problema, pois preserva a configuração de
montagem inválida.

**Automação recomendada.** Uma regra `udev` que identifique o dispositivo pelo UUID —
nunca por `/dev/sdX`, que é justamente o identificador que varia — acionando um serviço
que aguarde a montagem responder a uma leitura efetiva antes de recriar as stacks. A
verificação de leitura é necessária porque o `ntfs-3g` conclui a montagem antes de o
dispositivo estar estável.

### Processos ntfs-3g órfãos após remoção do dispositivo

**Sintoma.** O log do kernel acumula mensagens `Buffer I/O error` referentes a um
dispositivo que não existe mais.

**Causa.** Ao remover o disco, o processo `mount.ntfs-3g` associado ao nó `/dev/sdX`
anterior permanece em execução.

**Solução.** Encerrar os processos `mount.ntfs-3g` cujo dispositivo não exista mais.

**Observação diagnóstica.** Ao investigar erros de I/O, verificar a qual nó `/dev/sdX`
a mensagem se refere antes de atribuir a falha ao disco. Processos órfãos produzem
volume significativo de erros referentes a dispositivos já removidos, o que pode ser
confundido com falha de hardware.

### Escrita aleatória em NTFS via ntfs-3g

**Sintoma.** Durante downloads, o sistema apresenta iowait elevado e degradação geral
de desempenho.

**Causa.** O protocolo BitTorrent grava blocos fora de ordem. Em `ntfs-3g`, que opera
em espaço de usuário via FUSE, a escrita aleatória de 64 KB atinge aproximadamente
6,9 MB/s, contra 24 MB/s em ext4 local. A escrita sequencial no mesmo volume NTFS
atinge 210 MB/s.

**Solução.** Direcionar o diretório de downloads em andamento para um volume ext4
(no qBittorrent, "Manter incompletos em", com um bind adicional no compose) e permitir
que o cliente mova o arquivo concluído em operação sequencial única. A
pasta de destino e a biblioteca devem permanecer no mesmo volume para preservar a
validade dos hardlinks.

### Compatibilidade UAS em adaptadores USB-NVMe

**Sintoma.** Erros `iuCRC` e quedas de conexão sob carga em disco externo.

**Causa.** Incompatibilidade entre o driver UAS e determinados adaptadores USB-NVMe,
agravada pelo padrão de leitura fragmentada do `ntfs-3g`.

**Solução.** Desabilitar UAS para o dispositivo específico:

```
# /etc/modprobe.d/usb-storage-quirks.conf
options usb-storage quirks=174c:2362:u
```

O identificador `174c:2362` corresponde ao par vendor:product do adaptador, obtido via
`lsusb`.

**Observação diagnóstica.** Instabilidade em disco externo deve ser investigada
primeiro no enlace USB e no adaptador, e só então no dispositivo de armazenamento.
`smartctl -d sntasmedia` permite distinguir as duas situações.
