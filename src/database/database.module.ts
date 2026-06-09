import { DynamicModule, Global, Module } from '@nestjs/common';
import {
  createPersistenceProviders,
  createPersistenceExports,
} from './persistence.providers';

@Global()
@Module({})
export class DatabaseModule {
  static register(): DynamicModule {
    return {
      module: DatabaseModule,
      providers: createPersistenceProviders(),
      exports: createPersistenceExports(),
    };
  }
}
