export interface FrameScheduler {
  request: (callback: (now: number) => void) => number;
  cancel: (id: number) => void;
}
