import { Controller, Get, Param, Query, Post, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { PrismaService } from '../prisma/prisma.service';

@Controller('channels')
export class ChatController {
  constructor(private prisma: PrismaService) { }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const cleanName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
          cb(null, `${uniqueSuffix}-${cleanName}`);
        },
      }),
    }),
  )
  async uploadFile(@UploadedFile() file: any) {
    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado!');
    }
    return {
      url: `/uploads/${file.filename}`,
      name: file.originalname,
      size: file.size,
    };
  }

  @Get(':id/messages')
  async getChannelMessages(
    @Param('id') channelId: string,
    @Query('before') before?: string,
    @Query('limit') limitStr?: string,
  ) {
    const limit = limitStr ? parseInt(limitStr, 10) : 50;

    const queryOptions: any = {
      where: { channelId },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, username: true, imageUrl: true } },
        reactions: {
          include: { user: { select: { id: true, username: true } } }
        },
        replyTo: {
          include: {
            user: { select: { id: true, username: true, imageUrl: true } },
            replyTo: {
              include: { user: { select: { username: true } } }
            },
            reactions: {
              include: { user: { select: { id: true, username: true } } }
            }
          },
        }
      }
    };

    if (before) {
      queryOptions.cursor = { id: before };
      queryOptions.skip = 1;
    }

    const messages = await this.prisma.message.findMany(queryOptions);
    return messages.reverse();
  }
}