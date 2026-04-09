
export interface Soundtrack {
  id: string;
  url: string;
  createdAt: number;
  duration: number;
  label: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  tracks: Soundtrack[];
}

export interface AudioVisualizerProps {
  stream: MediaStream | null;
  isRecording: boolean;
}
