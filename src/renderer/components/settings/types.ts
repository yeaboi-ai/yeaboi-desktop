export interface MeProfile {
  id: string;
  email: string;
  name: string | null;
  display_name: string | null;
  avatar_url: string | null;
  pronouns: string | null;
  job_title: string | null;
  bio: string | null;
  timezone: string | null;
}

export interface OrgMember {
  user_id: string;
  email: string;
  name: string | null;
  avatar_url?: string | null;
  pronouns?: string | null;
  job_title?: string | null;
  role: string;
  invite_claimed: boolean;
}

export interface OrgDetails {
  id: string;
  name: string;
  billing_email: string | null;
  plan: string | null;
}

export interface TeamDetails {
  id: string;
  name: string;
  description: string | null;
}

export interface TeamMemberEntry {
  user_id: string;
  email: string;
  name: string | null;
  avatar_url?: string | null;
  pronouns?: string | null;
  job_title?: string | null;
  role: string;
}
