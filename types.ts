export interface SlideItem {
  id: string;
  url: string;
  pageNum: number;
  isKey?: boolean;
  blob?: Blob;
  mediaType?: 'image' | 'video';
}

export interface Deck {
  id: string;
  title: string;
  slides: SlideItem[];
}

export interface AudioTrack {
  id: string;
  name: string;
  url: string;
  file?: File;
  blob?: Blob;
}

export interface MediaItem {
  id: string;
  url: string;
  type: 'image' | 'video';
  name: string;
  blob?: Blob;
  thumbnail?: string;
}

export interface LiveContent {
  type: 'slide' | 'image' | 'video' | 'none';
  url: string;
  mediaType?: string;
  isPlaying?: boolean;
  currentTime?: number;
}

export interface WorkflowSlideItem {
  id: string;
  pageNum: number;
  isKey?: boolean;
  mediaType?: 'image' | 'video';
  dataUrl?: string;
  blob?: Blob;
}

export interface WorkflowDeck {
  id: string;
  title: string;
  slides: WorkflowSlideItem[];
}

export interface WorkflowAudioTrack {
  id: string;
  name: string;
  dataUrl?: string;
  blob?: Blob;
}

export interface WorkflowMediaItem {
  id: string;
  name: string;
  type: 'image' | 'video';
  dataUrl?: string;
  blob?: Blob;
}

export interface WorkflowState {
  decks: WorkflowDeck[];
  activeDeckId: string | null;
  audioTracks: WorkflowAudioTrack[];
  photos: WorkflowMediaItem[];
  videos: WorkflowMediaItem[];
  liveContent?: LiveContent;
  selectedSlideId?: string | null;
  keyOnly?: boolean;
}

export interface SavedWorkflow {
  id: string;
  name: string;
  savedAt: string;
  username?: string;
  state: WorkflowState;
}

export type UserRole = 'master' | 'normal';

export interface AuthSession {
  username: string;
  role: UserRole;
  token: string;
  loginTime: string;
}
