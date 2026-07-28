# Escopo executável do MVP

## Resultado esperado

O usuário conecta uma conta do WhatsApp por QR via Baileys, recebe novas conversas diretas no noter.donadio, organiza contatos e negociações em um Kanban e consulta sugestões produzidas por IA. Mensagens de áudio podem ser ouvidas e transcritas.

## Dentro do MVP

- login de um usuário administrador;
- conexão por QR e estado da sessão Baileys;
- ingestão de conversas individuais de texto e áudio;
- captura correta de mensagens recebidas e enviadas pelo próprio usuário;
- criação automática de contato e negociação inicial;
- cadastro e edição manual de contatos;
- Dashboard, lista de contatos, Kanban e detalhe da negociação;
- histórico de mensagens e player de áudio;
- transcrição assíncrona;
- extração de entidades, resumo, sentimento, objeções e próximas ações;
- sugestões de alteração sem aplicação automática;
- atualização em tempo real com reconciliação por REST;
- auditoria das ações manuais relevantes;
- política de retenção e remoção de mídia;
- health checks internos e observabilidade básica.

## Fora do MVP

- grupos, status, canais e newsletters;
- resposta automática ou ação autônoma da IA;
- análise de imagem, vídeo e documentos;
- múltiplos números simultâneos por workspace;
- sincronização integral do histórico anterior à conexão;
- transcrição sincronizada palavra a palavra;
- aplicativo iOS distribuído em loja;
- merge completamente automático;
- modelos alternativos como fallback automático;
- escalabilidade horizontal da conexão do WhatsApp.

## Jornadas críticas

### Receber texto

1. Uma mensagem direta chega.
2. O sistema a persiste uma única vez.
3. Um contato e uma negociação são criados se necessário.
4. A mensagem aparece imediatamente na interface como aguardando análise.
5. A IA processa o contexto e publica sugestões.
6. O usuário aceita, ignora ou edita as sugestões.

### Receber áudio

1. A mensagem e o estado pendente da mídia aparecem na interface.
2. O worker obtém e armazena o áudio de forma privada.
3. A transcrição é gerada e vinculada à mensagem.
4. O texto é analisado pela mesma capacidade de IA.
5. Falhas podem ser tentadas novamente sem duplicar a mensagem.

### Gerenciar pipeline

1. O usuário visualiza negociações por etapa.
2. Arrastar um card registra uma alteração manual auditável.
3. Uma sugestão da IA nunca move o card sem confirmação.
4. Cards fechados deixam de ser considerados negociações ativas.
5. O usuário define a próxima ação e identifica no Kanban acompanhamentos vencidos ou previstos para hoje.
6. Ao concluir uma ação, o sistema preserva descrição, prazo, autor e instante no histórico.
7. Fechar como ganho ou perda exige um motivo explícito.

### Acompanhar a operação

1. O dashboard consolida contatos, negociações ativas e valor do pipeline no servidor.
2. A tela destaca acompanhamentos vencidos, previstos para hoje e negociações sem próxima ação.
3. O administrador alterna o período de conversão entre 30, 90 e 365 dias.
4. Sessões ativas podem ser consultadas e revogadas individualmente.

## Critérios de aceite transversais

- recarregar a página ou reconectar o WebSocket não perde estado;
- processar duas vezes o mesmo evento não duplica contato, mensagem, áudio ou análise equivalente;
- indisponibilidade da IA mantém a mensagem consultável e permite retry;
- nenhum log contém conteúdo, credencial, QR ou telefone completo;
- o sistema diferencia dados extraídos de dados confirmados pelo usuário;
- todas as consultas e mutações respeitam `workspaceId`;
- integrações pagas e WhatsApp real são substituídos por fakes nos testes.

## Ordem inicial de entrega

1. Fundação do monorepo, qualidade e ambiente local.
2. Contratos de domínio e schema PostgreSQL.
3. API REST com autenticação e dados de demonstração.
4. Frontend navegável com Dashboard, Contatos, Kanban e Detalhe.
5. Eventos transacionais, BullMQ e atualização em tempo real.
6. Adapter Baileys, persistência criptografada da sessão e fluxo de QR.
7. Transcrição e análise por IA.
8. Segurança, retenção, observabilidade e empacotamento de produção.

## Estado da integração real

A direção aprovada é Baileys 7 com processo dedicado. O runtime real ainda não
está instalado ou habilitado; a VPS usa o simulador. A fronteira de texto já
normaliza mensagens recebidas e enviadas por `fromMe`, mas conexão, auth state
criptografado e mídia real ainda precisam ser implementados.
