import type { ExileQuestingApi } from '../electron/preload';

declare global {
  interface Window {
    exileQuesting: ExileQuestingApi;
  }
}

export {};

