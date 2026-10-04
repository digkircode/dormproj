import { runSoffice } from './docx-to-pdf';

describe('PDF conversion process', () => {
  it('stops a hung child before rejecting the conversion', async () => {
    await expect(runSoffice(['-e', 'setInterval(() => {}, 1000)'], 250, process.execPath))
      .rejects.toThrow('Конвертация в PDF не уложилась в таймаут');
  });

  it('accepts a completed child process', async () => {
    await expect(runSoffice(['-e', 'process.exit(0)'], 5_000, process.execPath)).resolves.toBeUndefined();
  });
});
