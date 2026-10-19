import type { Settings } from '../core/types';
import type { AppState, ChapterReviewChange, FixChange, LineKindChange, MetaChange } from './state';

export interface EditorController {
  readonly state: AppState;
  open(file: File): void;
  selectSection(index: number): void;
  setLineKind(change: LineKindChange): void;
  setFix(change: FixChange): void;
  setMeta(change: MetaChange): void;
  revealHit(hitIndex: number): void;
  inferWithLlm(): void;
  reviewChapters(): void;
  applyChapterReview(change: ChapterReviewChange): boolean;
  openSettings(hint?: string): void;
  saveSettings(settings: Settings): void;
  exportEpub(): void;
}
