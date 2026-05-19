// src/users/dto/create-user.dto.ts

export class CreateUserDto {
  email?: string; // Opcional agora
  username: string;
  password?: string; // Opcional agora
}