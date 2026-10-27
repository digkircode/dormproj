import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

export interface ChatEvent {
  conversationId: number;
  individualUid: string;
  messageId?: number;
}

@Injectable()
export class ChatEventsService {
  private readonly subject = new Subject<ChatEvent>();
  readonly events$ = this.subject.asObservable();

  emit(event: ChatEvent): void {
    this.subject.next(event);
  }
}
