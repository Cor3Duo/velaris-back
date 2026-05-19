// src/users/users.service.ts

import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) { }

  // Criação de convidados
  async createGuest(usernameParam?: string) {
    const actualUsername = usernameParam || `Visitante_${Math.floor(Math.random() * 10000)}`;

    const user = await this.prisma.user.create({
      data: {
        username: actualUsername,
      },
    });

    const globalServer = await this.prisma.server.findFirst({
      where: { name: 'Comunidade Global' },
      include: { channels: true }
    });

    if (globalServer) {
      await this.prisma.member.create({
        data: {
          userId: user.id,
          serverId: globalServer.id,
        }
      });
    }

    return { user, globalServer };
  }

  // Criação de usuário padrão
  async create(createUserDto: CreateUserDto) {
    if (createUserDto.email) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: createUserDto.email }
      });
      if (existingUser) throw new ConflictException('Este e-mail já está em uso.');
    }

    let hashedPassword: string | undefined;

    if (createUserDto.password) {
      hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    }

    const user = await this.prisma.user.create({
      data: {
        email: createUserDto.email,
        username: createUserDto.username,
        password: hashedPassword,
      },
      select: {
        id: true,
        email: true,
        username: true,
        imageUrl: true,
        createdAt: true,
        updatedAt: true,
      }
    });

    return user;
  }

  findAll() {
    return this.prisma.user.findMany({
      select: { id: true, email: true, username: true, imageUrl: true }
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, username: true, imageUrl: true, createdAt: true }
    });

    if (!user) throw new NotFoundException('Usuário não encontrado.');
    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    if (updateUserDto.password) {
      updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
    }

    return this.prisma.user.update({
      where: { id },
      data: updateUserDto,
      select: { id: true, email: true, username: true, imageUrl: true }
    });
  }

  async remove(id: string) {
    return this.prisma.user.delete({ where: { id } });
  }
}