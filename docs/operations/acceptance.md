# Aceitação da demonstração v0.2.0

Marco histórico: tag `v0.2.0-mvp`, publicada em 21/07/2026. Apesar do nome
original da tag, este marco aceita somente a demonstração com dados fictícios;
o MVP funcional depende da conexão Baileys e dos adapters reais descritos no
escopo. As evidências abaixo acompanham o estado atual da `main`.

Atualização de 29/07/2026: Baileys, QR, reconexão, texto, identidade LID,
referência cifrada e download privado de áudio foram implantados na VPS. Os
workers falsos foram removidos do profile real. Transcrição e análise reais
continuam fora desta aceitação até escolha de provedor, decisão sobre backlog e
nova homologação.

Atualização de 29/07/2026: os adapters OpenAI de transcrição e análise
estruturada foram implementados com corte obrigatório de autorização, chave
restrita aos workers e bloqueio do backlog. A validação local aprovou 179 testes
(1 contratos, 146 backend e 32 frontend), lint, typecheck, build, auditoria de
produção e os perfis Compose `baileys+assistive`. A aceitação real depende da
injeção interativa da chave e de uma chamada homologada no áudio autorizado.

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

O responsável pelo produto informou que testou manualmente pipeline, mensagens e demais jornadas principais com resultado satisfatório. Em cada nova candidata a release, repetir ao menos:

1. entrar e revogar uma segunda sessão;
2. criar contato e negociação com próxima ação;
3. filtrar e localizar a negociação no pipeline;
4. concluir a ação e conferir o histórico;
5. fechar como ganho e perdido, confirmar a exigência do motivo e reabrir;
6. simular texto e áudio duplicados e confirmar uma única mensagem;
7. aceitar uma sugestão editada e confirmar que ela não sobrescreve dado manual;
8. recarregar as telas após eventos em tempo real e conferir reconciliação REST.

Use somente fixtures fictícias. Conta real do WhatsApp, áudio real e chamadas pagas não fazem parte desta aceitação.

## Critérios que ainda bloqueiam dados reais

Consulte [`provider-readiness.md`](provider-readiness.md) e [`production.md`](production.md). A liberação exige adapters aprovados, mídia privada externa, backup restaurado, alertas configurados, exportação assíncrona para grandes volumes, exclusão integral de workspace e revisão formal de segurança e privacidade.
