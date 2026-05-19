import { Controller, Get, Param } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('channels')
export class ChatController {
  constructor(private prisma: PrismaService) { }

  @Get(':id/messages')
  async getChannelMessages(@Param('id') channelId: string) {
    return this.prisma.message.findMany({
      where: { channelId },
      include: {
        user: { select: { id: true, username: true, imageUrl: true } },
        replyTo: { // <-- ADICIONADO AQUI
          include: {
            user: { select: { id: true, username: true, imageUrl: true } },
            replyTo: {
              include: { user: { select: { username: true } } }
            },
            reactions: { // <-- ADICIONE ISSO
              include: { user: { select: { id: true, username: true } } }
            }
          },
        }
      },
      orderBy: { createdAt: 'asc' }
    });
  }
}