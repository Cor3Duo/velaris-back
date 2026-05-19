// Substitua o conteúdo do seu src/chat/chat.gateway.ts por este:

import { WebSocketGateway, SubscribeMessage, MessageBody, ConnectedSocket, WebSocketServer } from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';
import { PrismaService } from '../prisma/prisma.service';

@WebSocketGateway()
export class ChatGateway {
  @WebSocketServer()
  server: Server;

  constructor(private prisma: PrismaService) { }

  // src/chat/chat.gateway.ts (Altere apenas a função sendMessage)
  @SubscribeMessage('sendMessage')
  async handleMessage(
    @MessageBody() data: { channelId: string; userId: string; content: string; replyToId?: string }, // Adicionado replyToId
    @ConnectedSocket() client: WebSocket
  ) {
    const message = await this.prisma.message.create({
      data: {
        content: data.content,
        userId: data.userId,
        channelId: data.channelId,
        replyToId: data.replyToId, // Salva o ID da mensagem respondida
      },
      include: {
        user: { select: { id: true, username: true, imageUrl: true } },
        replyTo: { // Traz a mensagem original junto para o Front-end
          include: { user: { select: { username: true } } }
        }
      }
    });

    const payload = JSON.stringify({ event: 'newMessage', data: message });
    this.broadcast(payload);
  }

  // 2. DELETAR MENSAGEM
  @SubscribeMessage('deleteMessage')
  async handleDeleteMessage(@MessageBody() data: { messageId: string }, @ConnectedSocket() client: WebSocket) {
    // Deleta do banco de dados
    await this.prisma.message.delete({
      where: { id: data.messageId }
    });

    // Avisa todos os clientes para removerem a mensagem da tela
    const payload = JSON.stringify({ event: 'messageDeleted', data: { messageId: data.messageId } });
    this.broadcast(payload);
  }

  // 3. EDITAR MENSAGEM
  @SubscribeMessage('editMessage')
  async handleEditMessage(@MessageBody() data: { messageId: string; newContent: string }, @ConnectedSocket() client: WebSocket) {
    // Atualiza o texto no banco de dados
    const updatedMessage = await this.prisma.message.update({
      where: { id: data.messageId },
      data: { content: data.newContent },
      include: {
        user: { select: { id: true, username: true, imageUrl: true } }
      }
    });

    // Avisa os clientes da nova versão da mensagem
    const payload = JSON.stringify({ event: 'messageEdited', data: updatedMessage });
    this.broadcast(payload);
  }

  // Função auxiliar para enviar a todos conectados
  private broadcast(payload: string) {
    this.server.clients.forEach((c) => {
      if (c.readyState === WebSocket.OPEN) {
        c.send(payload);
      }
    });
  }
}