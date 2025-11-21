export interface TranscriptionItem {
  id: string;
  role: 'user' | 'model';
  text: string;
  isComplete: boolean;
}

export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR',
}

export interface AudioVolume {
  input: number;
  output: number;
}