import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

// Живая рассылка новых сообщений по SSE (см. chats.controller.ts#stream/my-chat.controller.ts#stream) —
// обычный RxJS Subject в памяти процесса. Backend в проде — один Docker-контейнер (см.
// промпт проекта), внешний pub/sub (Redis и т.п.) для этого не нужен.
export interface ChatEvent {
  conversationId: number;
  individualUid: string;
  messageId: number;
}

@Injectable()
export class ChatEventsService {
  private readonly subject = new Subject<ChatEvent>();
  readonly events$ = this.subject.asObservable();

  emit(event: ChatEvent): void {
    this.subject.next(event);
  }
}
