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

**Causa.** O `index.html` versionado é o original da imagem com injeções do Taiflix
(ícones, título, tela de abertura e o `<script>` de `custom/`). O jellyfin-web
referencia seus bundles com hash no nome, que muda a cada versão; o bind mount
sobrepõe o arquivo da imagem nova e mantém referências a bundles inexistentes.

**Solução.** Regerar o arquivo a partir do original da imagem em uso, com o script
`web-custom/aplicar-injecoes.py`, que reaplica os fragmentos de `web-custom/injecoes/`:

```sh
cd docker/jellyfin/web-custom
docker run --rm --entrypoint cat jellyfin/jellyfin:<tag> \
    /jellyfin/jellyfin-web/index.html | ./aplicar-injecoes.py > index.html
```

O script encerra com erro, sem gerar saída, se algum ponto de encaixe não for
encontrado, o que indica mudança de estrutura no jellyfin-web. Como `index.html` é bind
mount de arquivo único, o container precisa ser recriado (`docker compose up -d`).

## Legendas de uma linha não aparecem em tela cheia no Chrome com aceleração de hardware

**Sintoma.** Em tela cheia, no Chrome para Windows com aceleração de hardware ativa, as
falas de uma única linha deixam de aparecer enquanto o mouse está parado; as de duas linhas
aparecem normalmente. As mesmas falas somem de forma repetível e reaparecem quando o mouse é
movido e a barra do player é exibida. Em janela o problema não ocorre. O elemento da legenda
consta como visível no DOM (exibição, tamanho, posição e texto corretos), e desligar a
aceleração de hardware do navegador elimina o sintoma.

**Causa.** Não confirmada. Os dados são compatíveis com uma falha de apresentação: a área
pequena atualizada por uma fala de uma linha não chega à tela até que uma atualização
maior, como a da barra do player, force a reapresentação. Não foi reproduzido em Chrome para
Linux com renderização por software. Os ajustes a seguir não tiveram efeito: estilo de
legenda (Automático, Personalizado e Nativo), posicionamento aplicado pelo plugin Jellyfin
Enhanced, a opção `direct-composition-video-overlays`, a decodificação de vídeo por
hardware e o Skia Graphite.

**Solução.** Acrescentar ao CSS personalizado do Jellyfin (Painel > Geral > CSS
personalizado) uma variação quase invisível sobre a faixa da legenda, que mantém a área
sendo reapresentada, e uma altura mínima para o contêiner, que define essa área:

```css
.videoSubtitles {
  min-height: 6vw !important;
  justify-content: flex-end !important;
  pointer-events: none !important;
}
@keyframes taiflix-legenda-pulso {
  0%   { background-color: rgba(0, 0, 0, .004); }
  50%  { background-color: rgba(0, 0, 0, .012); }
}
.videoSubtitles::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 100%;
  pointer-events: none;
  background-color: rgba(0, 0, 0, .004);
  animation: taiflix-legenda-pulso .2s step-end infinite;
}
```

O texto permanece na mesma posição e o contêiner não captura cliques. A regra só atua no
estilo de legenda Personalizado, único em que o elemento `.videoSubtitles` existe; por isso
o `taiflix-hero.js` define esse estilo por padrão, uma vez por usuário em cada navegador.
O CSS personalizado reside na configuração do servidor, fora do repositório; ele precisa ser
reaplicado em uma instalação nova.

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

## GPU trocada após atualização de kernel (máquina com duas GPUs)

**Sintoma.** O streaming de emulação exibe tela escura e o emulador encerra segundos
depois de abrir: PCSX2 com código -6 e *"Failed to create wl_display"*, RetroArch com
código -11. O log do `romm-webstation` registra *"GPU renderer failed to initialize"* e
*"[svc-de] ... found launching de"* repetido a cada segundo. No Jellyfin, a
transcodificação por hardware falha, e `vainfo` no dispositivo configurado responde
*"vaInitialize failed"*.

**Causa.** Os nomes `renderD128` e `renderD129` são atribuídos na ordem em que os
drivers de vídeo carregam no boot. Quando o initramfs de um kernel novo passa a incluir
o driver NVIDIA, ele carrega antes do `i915` e a GPU dedicada assume `renderD128`.
Configurações fixadas nesse nome passam a apontar para a NVIDIA, que não tem driver de
espaço de usuário nos containers. O compositor do webstation não inicia e os emuladores
ficam sem tela.

**Diagnóstico.** O endereço da GPU integrada Intel (`pci-0000:00:02.0`) mostra qual
nodo ela recebeu neste boot:

```bash
ls -l /dev/dri/by-path/
```

**Solução.** A GPU é escolhida pelo endereço PCI (`GPU_PCI` no `.env`), que não muda
entre boots. O Jellyfin recebe `/dev/dri/by-path` e usa `/dev/dri/by-path/<GPU_PCI>-render`
como dispositivo VAAPI. No webstation, o Selkies só aceita nomes no formato `renderD*`;
o script `docker/emulacao/webstation/custom-cont-init.d/10-gpu-por-pci` converte o
endereço no nome do boot atual e o exporta como `DRINODE` e `DRI_NODE`.

Mapear o nodo com outro nome dentro do container (`<GPU_PCI>-render:/dev/dri/renderD128`)
não resolve: a libdrm reconstrói o caminho a partir do número do dispositivo no host
(`renderD129`), que não existe no container, e o VA-API falha ao abrir o display.

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
