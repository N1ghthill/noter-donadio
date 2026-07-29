# Homologação controlada do novo número WhatsApp

Este roteiro prepara a validação real do Baileys sem conectar uma conta,
enviar mensagens ou transmitir conteúdo para IA por iniciativa do sistema.
Execute-o somente quando o responsável estiver com o novo número e autorizar o
pareamento.

## Pré-condições

- usar um número controlado, sem conversas de clientes;
- manter OpenAI e o profile `assistive` desligados;
- confirmar que `https://leadcontrol.online/health` responde com sucesso;
- conferir `sudo /opt/noter-donadio/scripts/status-vps.sh`;
- entrar na aplicação como administrador e abrir a tela WhatsApp;
- não registrar, copiar ou fotografar QR, telefone, mensagem ou mídia em
  tickets e logs.

## Pareamento

1. Se a tela indicar credenciais antigas desconectadas, usar “Preparar troca”
   com a confirmação explícita solicitada. Essa ação preserva CRM, mensagens e
   mídias e remove somente o auth state antigo.
2. Iniciar a configuração e ler o QR pelo aparelho do novo número.
3. Aguardar o estado “Conectado”; não gerar um segundo QR.
4. Recarregar a página e confirmar que o estado continua conectado.

O sistema não conecta, desconecta nem substitui uma sessão automaticamente.

## Matriz funcional

Use conteúdo inteiramente fictício e marque cada linha como aprovada ou
reprovada, sem copiar o conteúdo para a evidência:

| Caso | Ação no aparelho | Resultado esperado no noter.donadio |
| --- | --- | --- |
| Texto recebido | outro número envia texto | contato, negociação e mensagem `inbound` aparecem uma vez |
| Texto enviado | operador responde pelo próprio WhatsApp | mensagem `outbound` aparece; o app não envia resposta |
| Áudio | enviar áudio curto | original fica reproduzível; transcrição informa que não está ativada |
| Imagem | enviar JPEG ou PNG | cartão aparece em Arquivos e a prévia abre somente sob demanda |
| Documento | enviar PDF controlado | cartão aparece e o navegador oferece download, não execução inline |
| Legenda | enviar imagem com legenda | legenda aparece na conversa e pode ser localizada em Arquivos |
| Navegação | abrir a mídia e a conversa | contato, conversa, follow-up e negociação permanecem vinculados |
| Grupo/status | gerar evento controlado | nada é criado no CRM |

## Continuidade e falhas

Após os casos funcionais:

1. reiniciar somente pelo procedimento operacional autorizado;
2. confirmar que a sessão reconecta sem novo QR;
3. verificar que mensagens anteriores não foram duplicadas;
4. executar os diagnósticos agregados:

```bash
sudo /opt/noter-donadio/scripts/status-vps.sh --diagnose-baileys
sudo /opt/noter-donadio/scripts/status-vps.sh --diagnose-media
```

Os diagnósticos não podem imprimir telefone, texto, nome de arquivo, referência
Baileys ou chave. Um código terminal `401` encerra a sessão sem loop e exige
novo pareamento autorizado; erros transitórios podem usar backoff.

## Critérios de saída

A homologação termina somente quando:

- texto recebido e enviado têm direção correta;
- áudio, imagem e documento ficam preservados e privados;
- evento repetido não cria uma segunda mensagem;
- grupos, status, newsletters e protocolo continuam filtrados;
- reinício não exige QR enquanto a sessão for válida;
- logs permanecem sanitizados;
- o operador consegue ir de conversa para follow-up, arquivos e pipeline;
- nenhuma mensagem foi enviada pelo aplicativo e nenhuma chamada OpenAI
  ocorreu.

Registre apenas data, responsável, resultado de cada caso, commit implantado e
contagens agregadas. Não registre dados da conversa.
