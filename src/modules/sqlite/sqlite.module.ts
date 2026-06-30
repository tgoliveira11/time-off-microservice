import { Module } from '@nestjs/common';
import { SqliteController } from './sqlite.controller';

@Module({
  controllers: [SqliteController],
})
export class SqliteModule {}
