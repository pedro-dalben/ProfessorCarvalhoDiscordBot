# Configuração CSA para BigMonCraft — Modo Relay (Professor Carvalho)

Este diretório contém exemplos de configuração para integrar o
**Cobblemon Spawn Alerts 1.13.2** com o Professor Carvalho
no modo **relay interno (Modo A)**.

## Arquivos

- `server.json.example` — Config do servidor. Copie para `config/cobblemon-spawn-alerts/server.json`.
- `webhooks.json.example` — Config do webhook. Copie para `config/cobblemon-spawn-alerts/webhooks.json`.
- `marker-template.txt` — Template do marcador PC_CSA_V1 usado no campo `content`.

## Procedimento

1. **Antes de alterar qualquer arquivo, faça backup**:

   ```bash
   cp config/cobblemon-spawn-alerts/server.json config/cobblemon-spawn-alerts/server.json.bak
   cp config/cobblemon-spawn-alerts/webhooks.json config/cobblemon-spawn-alerts/webhooks.json.bak
   ```

2. **Substitua os placeholders**:
   - Em `webhooks.json.example`, troque `COLE_A_URL_DO_RELAY_AQUI` pela URL fornecida:
     ```
     http://<IP_DO_PROXY_NA_WIREGUARD>/v1/integrations/csa/<TOKEN>
     ```

3. **Copie os arquivos** para o diretório de configuração do servidor Minecraft:

   ```bash
   cp deploy/csa/server.json.example config/cobblemon-spawn-alerts/server.json
   cp deploy/csa/webhooks.json.example config/cobblemon-spawn-alerts/webhooks.json
   ```

4. **Reinicie o servidor** ou execute `/cobblemonspawnalerts reload`.

5. **Teste**: use o comando `/pokespawn <pokemon>` (com `enableSpawnCommandAlerts: true` temporariamente) para disparar um alerta de teste.

## Rollback

Para reverter, restaure os backups:

```bash
cp config/cobblemon-spawn-alerts/server.json.bak config/cobblemon-spawn-alerts/server.json
cp config/cobblemon-spawn-alerts/webhooks.json.bak config/cobblemon-spawn-alerts/webhooks.json
```

## Modo B — Fallback (Webhook Discord Direto)

Se o relay não puder ser utilizado, configure o `webhookURL` com um
webhook Discord padrão. A desvantagem: o Professor Carvalho não
consegue deduplicar, persistir ou enriquecer os alertas antes
de chegarem ao Discord.

Exemplo de URL de fallback:

```
https://discord.com/api/webhooks/ID_DO_WEBHOOK/TOKEN_DO_WEBHOOK
```

## Segurança

- O token de origem (`sourceToken`) nunca deve ser commitado.
- O tráfego CSA → relay trafega exclusivamente pela rede WireGuard.
- O Nginx no proxy permite apenas o CIDR do servidor Minecraft.
- Consulte `docs/csa-integration.md` para detalhes completos.
