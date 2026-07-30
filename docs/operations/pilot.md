# Piloto controlado

Este roteiro prepara uma rodada de uso assistido do noter.donadio em
`https://leadcontrol.online`. Ele valida produto e operação sem liberar envio
autônomo, chamadas de IA, dados não autorizados ou exclusões reais.

## Responsabilidades

- o responsável pelo produto autoriza os contatos e conteúdos do teste;
- o operador executa as jornadas e registra horário e resultado;
- o responsável técnico verifica saúde, logs sanitizados e restauração local;
- somente uma decisão explícita promove o piloto para uso mais amplo.

## Preparação

1. Confirmar que todos os participantes podem usar os dados escolhidos.
2. Verificar aplicação, PostgreSQL, Redis, Baileys, workers, proxy e
   observabilidade com `sudo scripts/status-vps.sh`.
3. Executar `scripts/run-acceptance-vps.sh` a partir de um checkout confiável.
4. Entrar na aplicação e abrir `/piloto`.
5. Não solicitar QR, substituir número, consolidar contato ou apagar dados
   durante uma rodada de leitura sem autorização específica.

## Jornadas

1. **Acesso e sessão:** entrar, conferir o usuário e testar revogação de uma
   segunda sessão controlada.
2. **WhatsApp:** confirmar o estado existente, sem desconectar ou solicitar um
   novo QR.
3. **Conversa e mídias:** localizar texto, áudio, imagem e documento; renovar
   um acesso temporário expirado sem expor URL permanente.
4. **Pipeline:** criar uma oportunidade controlada, editar valor e próxima
   ação e mover a etapa manualmente.
5. **Follow-up:** localizar pendências pela central, filtrar na Agenda e
   concluir uma ação confirmando seu histórico.
6. **Arquivos:** filtrar por contato e tipo, abrir a conversa relacionada e
   conferir a retenção.

Responder mensagens continua sendo uma ação do operador no próprio WhatsApp.
O aplicativo não envia respostas.

## Registro da rodada

Para cada jornada, registre fora do sistema:

| Campo | Conteúdo |
| --- | --- |
| Data e horário | ISO 8601 com fuso |
| Jornada | Número e nome |
| Resultado | aprovado, aprovado com ressalva ou reprovado |
| Evidência | tela e ação, sem copiar mensagem, telefone, QR ou credencial |
| Severidade | bloqueante, alta, média ou baixa |
| Responsável | pessoa que acompanhará a correção |
| Próxima decisão | corrigir, repetir ou aceitar risco |

Não cole conteúdo real em issues, screenshots compartilhados ou fixtures.

## Severidade

- **bloqueante:** perda, exposição ou mistura de dados; acesso indevido;
  mensagem original ausente; indisponibilidade geral;
- **alta:** jornada principal impossível sem alternativa segura;
- **média:** resultado incorreto ou experiência degradada com alternativa;
- **baixa:** texto, alinhamento ou melhoria sem impacto na conclusão.

Achado bloqueante encerra a rodada e exige preservação do estado para
diagnóstico. Não tente reparar apagando mensagens, contatos ou mídias.

## Critérios de saída

O piloto pode avançar quando:

- as seis jornadas foram executadas;
- não há achado bloqueante ou alto aberto;
- mensagens e mídias originais permanecem consultáveis;
- as pendências reconciliam com a Agenda após recarregar;
- nenhuma sugestão move etapa ou envia mensagem sem ação humana;
- saúde e alertas internos permanecem estáveis durante a rodada;
- limitações externas foram comunicadas e aceitas.

OpenAI, alertas externos e backup fora da VPS continuam gates separados. A
conclusão deste piloto não os ativa automaticamente.
