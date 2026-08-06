# Configuração CSA 1.13.2 para BigMonCraft (Modo Relay — Professor Carvalho)

Diretório de configuração no servidor Minecraft (confirmado no bytecode do JAR):

```text
config/cobblemon-spawn-alerts/
```

Arquivos gerenciados pelo servidor (common configs):

- `server.json` — alertas globais e envio de webhook
- `server_message_templates.json` — templates de mensagens
- `rarities.json` — listas de dex (lendários, míticos, ultra beasts, paradox, iniciais)
- `webhooks.json` — URL do webhook e conteúdo

## Arquivos deste diretório

| Arquivo                                | Destino no servidor                           | Descrição                                       |
| -------------------------------------- | --------------------------------------------- | ----------------------------------------------- |
| `server.json.example`                  | `config/cobblemon-spawn-alerts/server.json`   | Alertas recomendados                            |
| `webhooks.relay.json.example`          | `config/cobblemon-spawn-alerts/webhooks.json` | **Modo A (recomendado)** — relay interno        |
| `webhooks.discord-direct.json.example` | `config/cobblemon-spawn-alerts/webhooks.json` | **Modo B (fallback)** — webhook Discord direto  |
| `marker-template.txt`                  | — (referência)                                | Marcador PC_CSA_V1 com placeholders confirmados |

## Procedimento de instalação (manual, com autorização)

1. **Backup** dos arquivos atuais:

   ```bash
   cd config/cobblemon-spawn-alerts
   cp server.json "server.json.bak.$(date +%Y%m%d-%H%M%S)"
   cp webhooks.json "webhooks.json.bak.$(date +%Y%m%d-%H%M%S)"
   ```

2. **URL do relay** (fornecida pela equipe de rede):

   ```text
   http://<IP_WIREGUARD_DO_PROXY>/v1/integrations/csa/<CSA_SOURCE_TOKEN>
   ```

   HTTP é aceitável **somente** dentro da WireGuard. Se houver TLS na rede
   privada, use `https://` normalmente.

3. Copie os arquivos:

   ```bash
   cp deploy/csa/1.13.2/server.json.example  config/cobblemon-spawn-alerts/server.json
   cp deploy/csa/1.13.2/webhooks.relay.json.example config/cobblemon-spawn-alerts/webhooks.json
   ```

4. Permissões restritas (o arquivo contém o token):

   ```bash
   chmod 600 config/cobblemon-spawn-alerts/webhooks.json
   chmod 600 .env   # no proxy VPS
   ```

5. **Reload** (comando confirmado no JAR):

   ```text
   /csa-common reload
   ```

   - Console do servidor: sempre permitido.
   - In-game: requer nível de permissão 3 (op nível 3).
   - Sucesso: `[CSA] Common configs reloaded!`
   - Falha: `[CSA] Common configs reload failed.`

6. Validação local antes da produção:

   ```bash
   pnpm integrations:csa:doctor
   pnpm integrations:csa:test-fixture -- --fixture shiny
   ```

## Modo B — fallback

Troque `webhookURL` pela URL de um webhook Discord. O CSA 1.13.2 aceita
qualquer URL HTTP/HTTPS (sem validação de domínio); por isso o Modo B é
aceitável, porém sem deduplicação, persistência nem privacidade de
coordenadas — o payload chega direto ao Discord.

## Rollback

```bash
cp config/cobblemon-spawn-alerts/server.json.bak.<timestamp> config/cobblemon-spawn-alerts/server.json
cp config/cobblemon-spawn-alerts/webhooks.json.bak.<timestamp> config/cobblemon-spawn-alerts/webhooks.json
/csa-common reload
```

## Segurança

- O token de origem só existe em `.env` (proxy) e em `webhooks.json` (servidor).
- Nunca commite tokens ou URLs reais.
- Tráfego CSA → relay apenas pela WireGuard.
- Nginx no proxy aceita somente o CIDR WireGuard do servidor Minecraft.
- `access_log off` na rota tokenizada.
