import { ChatBroadcastService } from './chat-broadcast.service';

describe('ChatBroadcastService', () => {
  it('stores one uploaded file and a fixed recipient list', async () => {
    const create = jest.fn().mockResolvedValue({ id: 7 });
    const createMany = jest.fn().mockResolvedValue({ count: 2 });
    const prisma = {
      $transaction: (callback: (tx: unknown) => Promise<unknown>) => callback({
        user: { upsert: jest.fn() },
        chatBroadcast: { create },
        chatBroadcastRecipient: { createMany },
      }),
    };
    const service = new ChatBroadcastService(prisma as never, {} as never, {} as never);
    const sender = { id: 3, fullName: 'Сотрудник' };
    const file = { storageKey: 'one-file', kind: 'VIDEO', mimeType: 'video/mp4', fileName: 'video.mp4', sizeBytes: 50_000_000 };

    await service.create('request-id', sender as never, 'Текст', ['resident-1', 'resident-2'], [file as never]);

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      requestId: 'request-id', senderUserId: 3,
      files: { create: [{
        kind: 'VIDEO', mimeType: 'video/mp4', fileName: 'video.mp4', sizeBytes: 50_000_000,
        file: { create: { storageKey: 'one-file' } },
      }] },
    }) }));
    expect(createMany).toHaveBeenCalledWith({
      data: [
        { broadcastId: 7, individualUid: 'resident-1' },
        { broadcastId: 7, individualUid: 'resident-2' },
      ],
      skipDuplicates: true,
    });
  });

  it('retries a failed recipient without creating a second message', async () => {
    let status: 'PENDING' | 'FAILED' | 'SENT' = 'PENDING';
    let messageId: number | null = null;
    let failConversation = true;
    const createMessage = jest.fn().mockResolvedValue({ id: 41 });
    const enqueueChat = jest.fn().mockResolvedValue(undefined);
    const emit = jest.fn();
    const prisma = {
      $transaction: (callback: (tx: unknown) => Promise<unknown>) => callback({
        chatBroadcastRecipient: {
          updateMany: async ({ where }: { where: { status: string } }) => {
            if (status !== where.status) return { count: 0 };
            return { count: 1 };
          },
          findUniqueOrThrow: async () => ({
            id: 8, individualUid: 'resident-1', messageId,
            broadcast: { senderUserId: 3, body: 'Текст', files: [{
              fileId: 12, kind: 'VIDEO', mimeType: 'video/mp4', fileName: 'video.mp4', sizeBytes: 50_000_000,
            }] },
          }),
          update: async ({ data }: { data: { status: 'SENT'; messageId: number } }) => {
            status = data.status;
            messageId = data.messageId;
          },
        },
        chatConversation: { upsert: async () => {
          if (failConversation) { failConversation = false; throw new Error('temporary failure'); }
          return { id: 5 };
        } },
        chatMessage: { create: createMessage },
      }),
      chatBroadcastRecipient: {
        findMany: async () => status === 'PENDING' ? [{ id: 8 }] : [],
        updateMany: async ({ where, data }: { where: { status: string }; data: { status: 'FAILED' | 'PENDING' } }) => {
          if (status === where.status) status = data.status;
          return { count: 1 };
        },
        groupBy: async () => [{ status, _count: { _all: 1 } }],
      },
      chatBroadcast: { findUnique: async () => ({ id: 7, createdAt: new Date() }) },
    };
    const service = new ChatBroadcastService(prisma as never, { enqueueChat } as never, { emit } as never);

    await service.runPending();
    expect(status).toBe('FAILED');
    expect(createMessage).not.toHaveBeenCalled();
    await service.retry(7);
    expect(status).toBe('PENDING');
    await service.runPending();
    await service.runPending();
    expect(status).toBe('SENT');
    expect(createMessage).toHaveBeenCalledTimes(1);
    expect(createMessage).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      attachments: { create: [{ fileId: 12, kind: 'VIDEO', mimeType: 'video/mp4', fileName: 'video.mp4', sizeBytes: 50_000_000 }] },
    }) }));
    expect(enqueueChat).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledTimes(1);
  });
});
