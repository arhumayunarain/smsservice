import { Module } from '@nestjs/common';
import { ImportModule } from '../import/import.module';
import { RecipientListsController } from './recipient-lists.controller';
import { RecipientListsService } from './recipient-lists.service';

@Module({
  imports: [
    ImportModule, // Provides ImportService for file upload and import pipeline
  ],
  controllers: [RecipientListsController],
  providers: [RecipientListsService],
  exports: [RecipientListsService],
})
export class RecipientListsModule {}
