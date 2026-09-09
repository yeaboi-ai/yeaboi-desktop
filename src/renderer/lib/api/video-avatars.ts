export interface VideoAvatar {
  id: string;
  org_id: string | null;
  name: string;
  description: string | null;
  provider: string;
  replica_id: string;
  preview_url: string | null;
  gender: string | null;
  voice_id: string | null;
  realtime_voice: string | null;
  voice_sample_url: string | null;
  is_system: boolean;
  sort_order: number;
  created_at: string;
}

type AuthFetch = (url: string, options?: RequestInit) => Promise<Response>;

export async function listVideoAvatars(authFetch: AuthFetch): Promise<VideoAvatar[]> {
  const resp = await authFetch('/api/video-avatars');
  if (!resp.ok) return [];
  return resp.json();
}
