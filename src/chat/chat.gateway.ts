import { WebSocketGateway, SubscribeMessage, MessageBody, ConnectedSocket, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

@WebSocketGateway()
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private activeConnections = new Map<WebSocket, string>();
  private userCache = new Map<string, { id: string; username: string; imageUrl: string | null }>();
  private queue: Array<{
    id: string;
    content: string;
    userId: string;
    channelId: string;
    replyToId?: string;
    createdAt: Date;
  }> = [];
  private isProcessingQueue = false;

  constructor(private prisma: PrismaService) { }

  handleConnection(client: WebSocket) {
    console.log('🟢 Novo cliente conectado ao WebSocket');
  }

  handleDisconnect(client: WebSocket) {
    const userId = this.activeConnections.get(client);
    if (userId) {
      this.activeConnections.delete(client);
      console.log(`🔴 Usuário ${userId} desconectado`);
      
      const payload = JSON.stringify({
        event: 'userStatusChanged',
        data: { userId, status: 'offline' }
      });
      this.broadcast(payload);
    }
  }

  @SubscribeMessage('identify')
  async handleIdentify(
    @MessageBody() data: { userId: string },
    @ConnectedSocket() client: WebSocket
  ) {
    this.activeConnections.set(client, data.userId);
    console.log(`👤 Usuário ${data.userId} identificado no WebSocket`);

    // Busca o usuário do banco e armazena em cache para otimização de mensagens instantâneas
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: data.userId },
        select: { id: true, username: true, imageUrl: true }
      });
      if (user) {
        this.userCache.set(data.userId, user);
      }
    } catch (err) {
      console.error(`Erro ao buscar usuário ${data.userId} para o cache:`, err);
    }

    const payload = JSON.stringify({
      event: 'userStatusChanged',
      data: { userId: data.userId, status: 'online' }
    });
    this.broadcast(payload);

    // Envia a lista de todos os usuários online para o cliente que se conectou
    const onlineUserIds = Array.from(new Set(this.activeConnections.values()));
    client.send(JSON.stringify({
      event: 'onlineUsersList',
      data: { onlineUserIds }
    }));
  }

  // src/chat/chat.gateway.ts (Altere apenas a função sendMessage)
  @SubscribeMessage('sendMessage')
  async handleMessage(
    @MessageBody() data: { channelId: string; userId: string; content: string; replyToId?: string }, // Adicionado replyToId
    @ConnectedSocket() client: WebSocket
  ) {
    const messageId = crypto.randomUUID();
    const createdAt = new Date();

    // Obtém informações do usuário do cache ou faz lookup rápido no banco
    let user: { id: string; username: string; imageUrl: string | null } | null = this.userCache.get(data.userId) || null;
    if (!user) {
      user = await this.prisma.user.findUnique({
        where: { id: data.userId },
        select: { id: true, username: true, imageUrl: true }
      });
      if (user) {
        this.userCache.set(data.userId, user);
      }
    }

    // Se for resposta a uma mensagem, busca a mensagem referenciada
    let replyTo: any = null;
    if (data.replyToId) {
      replyTo = await this.prisma.message.findUnique({
        where: { id: data.replyToId },
        include: { user: { select: { username: true } } }
      });
    }

    // Cria o payload idêntico ao formato que o Prisma retornaria
    const broadcastMessage = {
      id: messageId,
      content: data.content,
      createdAt,
      updatedAt: createdAt,
      userId: data.userId,
      channelId: data.channelId,
      replyToId: data.replyToId || null,
      user,
      replyTo,
      reactions: []
    };

    // Transmite a mensagem IMEDIATAMENTE (Latência Zero percebida pelo usuário)
    const payload = JSON.stringify({ event: 'newMessage', data: broadcastMessage });
    this.broadcast(payload);

    // Enfileira a operação de persistência no banco de dados
    this.queue.push({
      id: messageId,
      content: data.content,
      userId: data.userId,
      channelId: data.channelId,
      replyToId: data.replyToId,
      createdAt
    });

    // Dispara o processamento da fila sem bloquear a conexão websocket
    this.processQueue().catch(err => {
      console.error('Erro assíncrono no processamento da fila de mensagens:', err);
    });
  }

  private async processQueue() {
    if (this.isProcessingQueue || this.queue.length === 0) return;
    this.isProcessingQueue = true;

    try {
      while (this.queue.length > 0) {
        const batch = [...this.queue];
        this.queue = [];

        await this.prisma.message.createMany({
          data: batch.map(msg => ({
            id: msg.id,
            content: msg.content,
            userId: msg.userId,
            channelId: msg.channelId,
            replyToId: msg.replyToId || null,
            createdAt: msg.createdAt,
          }))
        });

        console.log(`💾 [Banco de Dados] Lote de ${batch.length} mensagens salvas com sucesso.`);
      }
    } catch (err) {
      console.error('❌ Erro crítico ao salvar fila de mensagens no banco:', err);
    } finally {
      this.isProcessingQueue = false;
    }
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

  @SubscribeMessage('toggleReaction')
  async handleToggleReaction(@MessageBody() data: { messageId: string; userId: string; emoji: string }, @ConnectedSocket() client: WebSocket) {
    // Verifica se já existe a reação
    const existingReaction = await this.prisma.reaction.findUnique({
      where: {
        messageId_userId_emoji: { messageId: data.messageId, userId: data.userId, emoji: data.emoji }
      }
    });

    if (existingReaction) {
      await this.prisma.reaction.delete({ where: { id: existingReaction.id } });
    } else {
      await this.prisma.reaction.create({
        data: { messageId: data.messageId, userId: data.userId, emoji: data.emoji }
      });
    }

    // Busca a mensagem atualizada com todas as reações
    const updatedMessage = await this.prisma.message.findUnique({
      where: { id: data.messageId },
      include: {
        user: { select: { id: true, username: true, imageUrl: true } },
        replyTo: { include: { user: { select: { username: true } } } },
        reactions: { include: { user: { select: { id: true, username: true } } } }
      }
    });

    const payload = JSON.stringify({ event: 'reactionUpdated', data: updatedMessage });
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