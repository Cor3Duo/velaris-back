import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    // Configuramos o Pool de conexão do Postgres apontando para o Supabase
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const adapter = new PrismaPg(pool);

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
      console.log('🌍 Servidor "Comunidade Global" gerado com sucesso no Supabase!');
    }
  }
}