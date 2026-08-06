# Arquitetura

O bot é a autoridade PostgreSQL para identidades, snapshots e eventos. Redis
guarda somente cooldowns e nonces de replay. O Fabric nunca abre servidor HTTP,
não recebe token Discord e não acessa bancos do bot ou do Essentials.
