import { parseC } from './parser';
import type { WorkerRequest, WorkerResponse } from './types';

self.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  let response: WorkerResponse;
  try {
    if (data.source.length > 100_000) throw new Error('コードは100,000文字以内にしてください。');
    response = { id: data.id, result: await parseC(data.source) };
  } catch (error) {
    response = { id: data.id, error: error instanceof Error ? error.message : '解析に失敗しました。もう一度お試しください。' };
  }
  self.postMessage(response);
};
