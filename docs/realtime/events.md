# Atualização em tempo real

## Fluxo implementado

```text
Mutação REST
  → transação PostgreSQL + outbox
  → dispatcher da outbox
  → fila BullMQ realtime-events
  → worker de tempo real
  → Redis emitter
  → sala Socket.IO do workspace
  → invalidação no React
  → reconciliação pela API REST
```

O evento apenas avisa que algum agregado mudou. O frontend não trata o payload como fonte de verdade: ele consulta novamente a API após cada evento válido e depois de toda reconexão.

## Autenticação e isolamento

O handshake Socket.IO reutiliza o cookie opaco `noter_session`. O servidor valida a sessão no PostgreSQL e deriva a sala `workspace:<workspaceId>` da identidade autenticada. O cliente não informa nem escolhe o workspace.

Conexões ausentes, expiradas ou malformadas recebem somente `unauthorized`. Logout desmonta o provider React e encerra o socket.
A sessão de cada conexão também é revalidada no servidor a cada minuto; sessões revogadas ou usuários desabilitados são desconectados.

## Contratos permitidos

Todos são emitidos como `crm.updated`:

```json
{
  "type": "contact.updated",
  "workspaceId": "uuid",
  "contactId": "uuid",
  "changedFields": ["displayName", "tags"]
}
```

```json
{
  "type": "negotiation.stage.changed",
  "workspaceId": "uuid",
  "negotiationId": "uuid",
  "stage": "qualified"
}
```

O worker valida uma lista fechada de eventos e reconstrói o payload. Campos extras são descartados; telefone, notas, mensagens e transcrições nunca atravessam a notificação.

## Processos locais

Além da API e do frontend, execute:

```bash
npm run start:outbox -w @noter/backend
npm run start:realtime -w @noter/backend
```

O primeiro processo move eventos transacionais para BullMQ. O segundo consome `realtime-events` e publica nas salas Socket.IO via Redis.

## Garantias e limites

- Redis e Socket.IO são transporte descartável; PostgreSQL continua sendo a fonte de verdade;
- eventos repetidos são seguros porque apenas invalidam consultas;
- eventos perdidos são recuperados na reconexão por REST;
- nesta fatia, somente edição de contato e mudança de etapa geram notificações de CRM;
- ingestão, transcrição e análise deverão publicar eventos próprios quando seus workers forem implementados.
