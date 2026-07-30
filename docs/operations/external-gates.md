# Portões externos da fase VPS

Este documento separa trabalho pronto no repositório de decisões que dependem
de fornecedor, credencial, destino externo ou aceite formal. Nenhum portão é
ativado silenciosamente.

## Alertas externos

O Prometheus e o Alertmanager locais estão prontos, mas ainda não existe
destinatário externo. Para ativar, são necessários:

- canal escolhido (e-mail, webhook ou serviço de incidentes);
- endereço/URL e segredo injetados fora do Git;
- responsável e janela de atendimento;
- teste controlado de alerta e resolução sem dados de negócio.

## Backup fora da VPS

O backup local e a restauração sintética existem. O proprietário decidiu, nesta
fase, não manter cópia fora da VPS. A ativação futura exige destino, credencial,
criptografia, retenção, frequência, responsável e teste de restauração a partir
do destino externo.

## Armazenamento externo de mídia

O volume privado local atende à fase atual. Migrar mídia para object storage
exige provedor/região, política de retenção e exclusão, chave com privilégio
mínimo, adapter testável e migração que não quebre referências já persistidas.

## OpenAI

Adapters, limites, kill switch, chave e corte temporal estão ativos. O
configurador validou autenticação e acesso aos dois modelos sem inferência, e
os workers assistivos estão em execução. Resta homologar uma nova mensagem e
um novo áudio controlados depois da conexão do novo número; nenhuma sugestão
pode ser aplicada automaticamente.

## Baileys e revisão formal

O fluxo técnico está homologado, mas o aceite do risco de bloqueio e dos termos
aplicáveis precisa ser registrado pelo responsável antes de ampliar o uso. Uma
revisão formal de segurança e privacidade continua obrigatória antes de dados
de clientes em escala.
