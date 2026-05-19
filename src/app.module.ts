// src/app.module.ts

import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';

// Importe o que acabamos de criar
import { ChatGateway } from './chat/chat.gateway';
import { ChatController } from './chat/chat.controller';

@Module({
  imports: [PrismaModule, UsersModule],
  controllers: [AppController, ChatController],
  providers: [AppService, ChatGateway], // Gateway entra como provider
})
export class AppModule { }