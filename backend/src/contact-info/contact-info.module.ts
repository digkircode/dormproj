import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ContactInfoController } from './contact-info.controller';

@Module({
  imports: [AuthModule],
  controllers: [ContactInfoController],
})
export class ContactInfoModule {}
