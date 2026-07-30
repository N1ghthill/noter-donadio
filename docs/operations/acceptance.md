# Aceitação da demonstração v0.2.0

Marco histórico: tag `v0.2.0-mvp`, publicada em 21/07/2026. Apesar do nome
original da tag, este marco aceita somente a demonstração com dados fictícios;
o MVP funcional depende da conexão Baileys e dos adapters reais descritos no
escopo. As evidências abaixo acompanham o estado atual da `main`.

Atualização de 29/07/2026: Baileys, QR, reconexão, texto, identidade LID,
referência cifrada e download privado de áudio foram implantados na VPS. Os
workers falsos foram removidos do profile real. Transcrição e análise reais
continuam fora desta aceitação até configuração da chave OpenAI, autorização do
corte temporal e nova homologação.

Atualização de 29/07/2026: os adapters OpenAI de transcrição e análise
estruturada foram implementados com corte obrigatório de autorização, chave
restrita aos workers e bloqueio do backlog. A validação local aprovou 208 testes
(1 contratos, 161 backend e 46 frontend), lint, typecheck, build, auditoria de
produção e os perfis Compose `baileys+assistive`. A aceitação real depende da
injeção interativa da chave e de uma chamada homologada no áudio autorizado.

Atualização de 29/07/2026: a preparação do piloto acrescentou central de
pendências reconciliada com a Agenda, relatório de entrada e resultado e seis
jornadas guiadas sem mutação comercial. A validação local passou a 211 testes
(1 contratos, 161 backend e 49 frontend), mantendo lint e typecheck sem erros.

Atualização de 29/07/2026: referências de mídia expiradas passaram a solicitar
uma renovação única ao processo Baileys somente para respostas `403`, `404` ou
`410`. JID, URL e chave permanecem cifrados; Redis transporta apenas IDs e a
operação não envia mensagem. A validação local passou a 216 testes (1
contratos, 166 backend e 49 frontend).

Atualização de 29/07/2026: a superfície web deixou de depender de estilo inline,
restringiu WebSocket ao próprio domínio e passou a publicar isolamento de
origem e bloqueio de frames. O diagnóstico padrão da VPS informa apenas o
estado agregado do Baileys persistido no PostgreSQL, sem identificadores ou
credenciais.

Atualização de 30/07/2026: a chave OpenAI foi injetada externamente e os
workers reais foram ativados depois da validação sem inferência dos modelos
`gpt-4o-mini-transcribe` e `gpt-5.6-sol`. O backlog anterior permanece
bloqueado pelo corte temporal. A homologação paga de uma nova mensagem e de um
novo áudio aguarda a liberação do número controlado.

O hardening seguinte passou em 217 testes de código (1 de contratos, 167 de
backend e 49 de frontend), além do teste de script para sucesso, `401`, chave
inválida e identificador de modelo inseguro. Lint, typecheck, build e auditoria
de produção permaneceram aprovados sem realizar inferência.

Na evolução da biblioteca de arquivos, o mesmo pipeline privado passou a
receber também imagens e documentos novos, com filtros por contato, direção,
período e tipo. Documentos usam download forçado, imagens exigem ação explícita
para carregar a prévia e nenhuma mídia é exposta por URL pública permanente.

Na mesma auditoria, API e interface passaram a impedir uma nova configuração
por QR quando a sessão Baileys já está conectada. Essa proteção elimina o fluxo
inútil que aguardava um novo código e terminava em erro, sem desconectar ou
alterar a sessão real existente.

Depois do encerramento terminal da sessão anterior, o responsável realizou novo
pareamento por QR e validou manualmente a conexão. A rodada seguinte confirmou
texto e uma unidade de áudio, imagem e documento, todos preservados e com
download privado concluído. O fluxo de substituição continua separado: exige
confirmação, recusa sessão conectada e preserva o histórico ao remover apenas
as credenciais antigas.

Na consolidação desta fase, as listagens críticas receberam paginação
explícita, o histórico passou a carregar páginas anteriores e o acesso
temporário de mídia pode ser renovado. Contatos manuais repetidos são recusados;
duplicados existentes podem ser consolidados somente por confirmação explícita,
com preservação de mensagens e negociações e auditoria. Duas negociações ativas
não são resolvidas silenciosamente pela mesclagem.

## Resultado

Os fluxos comerciais e administrativos implementados estão aceitos para demonstração com dados fictícios. Isso não constitui liberação para dados reais ou provedores externos.

Evidências automatizadas repetidas sobre a candidata da fase VPS em 28/07/2026:

- lint e TypeScript estrito sem erros;
- 172 testes aprovados: 1 de contratos, 139 de backend e 32 de frontend;
- build dos três workspaces aprovado;
- 18 migrations aplicadas em PostgreSQL vazio;
- fluxo integrado validado com PostgreSQL, Redis, BullMQ e adapters falsos;
- imagens de backend e frontend construídas, configuração do Compose e sintaxe do Nginx validadas;
- backup sintético restaurado com sucesso em PostgreSQL 16 isolado;
- Prisma CLI, client e adapter atualizados e sem achados próprios no `npm audit`;
- o audit de produção aceita temporariamente somente
  `GHSA-qwww-vcr4-c8h2`, restrito às APIs RSC não utilizadas pela SPA; formato
  inesperado, falha da consulta ou qualquer outro advisory continuam
  reprovando o CI. A exceção não libera a VPS para dados reais.
- runtime, rotas e configuração da integração oficial removidos; o contrato
  Baileys de texto cobre entrada, saída e filtros sem importar SDK no domínio;
- Baileys 7 fixado, conectado e com auth state PostgreSQL validado por
  criptografia autenticada, rotação e isolamento por workspace;
- build do backend limpa `dist` antes de compilar, impedindo execução de
  artefatos correspondentes a fontes removidas.

Evidências executadas no ambiente publicado em `https://leadcontrol.online` em 28/07/2026:

- certificado TLS válido, redirecionamento de HTTP e cookie `Secure`;
- leituras autenticadas de dashboard, contatos, pipeline, conversas e auditoria;
- segunda sessão criada, listada e revogada;
- contato e negociação fictícios criados, editados, movidos, fechados com motivo e reabertos;
- próxima ação concluída com histórico persistido;
- QR e conexão simulados, mensagem idempotente e análise falsa concluída;
- sugestão aceita apenas por decisão explícita;
- áudio fictício transcrito, analisado e lido por URL curta assinada e sessão autenticada;
- exportação `workspace-export-v1` e auditoria minimizada validadas;
- PostgreSQL, Redis, workers, proxy TLS e observabilidade permaneceram saudáveis.

O procedimento reproduzível e o roteiro da reunião estão em [`client-demo.md`](client-demo.md).

## Jornadas cobertas

- login, sessão opaca, listagem e revogação de sessões;
- exportação administrativa versionada e auditada, sem credenciais ou chaves internas;
- auditoria global minimizada e isolada por workspace;
- métricas Prometheus agregadas, autenticadas e bloqueadas no proxy público;
- criação e edição de contato e negociação;
- filtros, busca, Kanban, dashboard e agregações do PostgreSQL;
- próxima ação, conclusão imutável e histórico de auditoria;
- fechamento ganho/perdido com motivo e reabertura;
- ingestão idempotente de texto e áudio fictícios;
- transcrição e análise falsas, aceite ou descarte explícito de sugestões;
- atualização em tempo real seguida de reconciliação REST;
- acesso assinado a mídia fictícia, retenção e exclusão de contato.

## Aceitação manual

O responsável pelo produto informou que testou manualmente pipeline, mensagens
e demais jornadas principais com resultado satisfatório. No ambiente Baileys
publicado, repetir as jornadas sem usar os endpoints locais de simulação:

1. entrar e revogar uma segunda sessão;
2. criar contato e negociação com próxima ação;
3. filtrar e localizar a negociação no pipeline;
4. concluir a ação e conferir o histórico;
5. fechar como ganho e perdido, confirmar a exigência do motivo e reabrir;
6. conferir texto e áudio controlados já persistidos e sua deduplicação;
7. aceitar uma sugestão editada e confirmar que ela não sobrescreve dado manual;
8. recarregar as telas após eventos em tempo real e conferir reconciliação REST.

Use somente dados controlados autorizados. Não envie mensagens pelo aplicativo;
chamadas pagas não fazem parte desta aceitação.

## Critérios que ainda bloqueiam dados reais

Consulte [`provider-readiness.md`](provider-readiness.md) e [`production.md`](production.md). A liberação exige adapters aprovados, mídia privada externa, backup restaurado, alertas configurados, exportação assíncrona para grandes volumes, exclusão integral de workspace e revisão formal de segurança e privacidade.
