// Domain types mirroring the Supabase schema.

export type EpisodeType = "episode" | "short";

export type JobStage = "extract" | "transcribe" | "generate" | "thumbnails";
export type JobStatus = "queued" | "running" | "done" | "error";

export type GenerationKind =
  | "title"
  | "thumbnail_title"
  | "thumbnail"
  | "description"
  | "carousel"
  | "quote"
  | "idea";

export type InputMode = "transcript" | "srt" | "audio" | "video";

export interface Channel {
  id: string;
  name: string;
  created_at: string;
}

export interface StyleProfile {
  id: string;
  channel_id: string;
  language_guidelines: string;
  visual_guidelines: string;
  canva_covers_url: string;
  submagic_dictionary?: string | null;
  updated_at: string;
}

export interface Episode {
  id: string;
  channel_id: string;
  type: EpisodeType;
  title: string;
  source_path: string | null;
  source_filename: string | null;
  status: string;
  title_chosen: string | null;
  description_chosen: string | null;
  duration_seconds: number | null;
  thumbnail_path: string | null;
  video_key: string | null;
  video_size: number | null;
  audio_key: string | null;
  youtube_video_id: string | null;
  youtube_status: string | null;
  youtube_error: string | null;
  publish_at: string | null;
  youtube_upload_url: string | null;
  youtube_uploaded_bytes: number;
  spotify_published_at: string | null;
  created_at: string;
}

export interface Transcript {
  id: string;
  episode_id: string;
  language: string;
  text: string;
  segments: { start: number; end: number; text: string }[];
  created_at: string;
}

// content shapes per kind
export interface TitleContent { text: string }
export interface DescriptionContent { text: string }
export interface QuoteContent { text: string }
export interface IdeaContent { text: string; format?: string }
export interface CarouselContent { title: string; slides: string[] }
export interface ThumbnailContent { concept: string; overlay_text: string; visual: string }

export interface Generation {
  id: string;
  episode_id: string;
  kind: GenerationKind;
  content: Record<string, unknown>;
  image_path: string | null;
  version: number;
  selected: boolean;
  created_at: string;
}

export interface Job {
  id: string;
  episode_id: string;
  stage: JobStage;
  status: JobStatus;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface StyleExample {
  id: string;
  channel_id: string;
  kind: string;
  content: Record<string, unknown>;
  source_episode_id: string | null;
  created_at: string;
}
