// src/prisma/prisma.service.ts

import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    const adapter = new PrismaBetterSqlite3({
      // Mesmo caminho que colocamos no prisma.config.ts!
      url: "file:./prisma/dev.db"
    });

    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
    await this.seedGlobalServer();
  }

  private async seedGlobalServer() {
    const serverCount = await this.server.count({
      where: { name: 'Comunidade Global' }
    });

    if (serverCount === 0) {
      const systemUser = await this.user.create({
        data: {
          username: 'Sistema',
          email: 'system@comunidadeglobal.com',
          password: 'none',
        }
      });

      await this.server.create({
        data: {
          name: 'Comunidade Global',
          imageUrl: 'https://cdn-icons-png.flaticon.com/512/618/618303.png',
          ownerId: systemUser.id,
          channels: {
            create: [
              { name: 'geral', type: 'TEXT' },
              { name: 'apresentações', type: 'TEXT' },
              { name: 'off-topic', type: 'TEXT' },
            ]
          }
        }
      });
      console.log('🌍 Servidor "Comunidade Global" gerado com sucesso!');
    }
  }
}