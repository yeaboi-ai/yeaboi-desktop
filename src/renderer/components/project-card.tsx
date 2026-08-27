import Link from 'next/link';

interface ProjectCardProps {
  id: string;
  name: string;
  description?: string | null;
  createdAt: string;
  featured?: boolean;
}

export function ProjectCard({ id, name, description, createdAt, featured }: ProjectCardProps) {
  const formatted = new Date(createdAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  if (featured) {
    return (
      <Link href={`/projects/${id}`} className="group block">
        <div className="relative border border-border rounded-lg p-8 bg-card hover:border-primary/40 transition-all duration-300 overflow-hidden min-h-[180px] flex flex-col justify-between">
          {/* Ambient glow on hover */}
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none bg-[radial-gradient(ellipse_at_top_left,hsl(36_96%_64%_/_0.04)_0%,transparent_60%)]" />

          <div className="relative">
            <div className="flex items-start justify-between gap-4 mb-4">
              <p className="text-[10px] font-body font-medium tracking-[0.18em] uppercase text-primary/80">
                Featured
              </p>
              <span className="text-xs text-muted-foreground font-body tabular-nums">
                {formatted}
              </span>
            </div>
            <h2 className="font-display text-4xl italic leading-tight text-foreground group-hover:text-primary transition-colors duration-200 mb-3">
              {name}
            </h2>
            {description && (
              <p className="text-sm text-muted-foreground font-body leading-relaxed line-clamp-2 max-w-2xl">
                {description}
              </p>
            )}
          </div>

          <div className="relative mt-6 flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground/60 font-body group-hover:text-primary/60 transition-colors">
              Open project
            </span>
            <span className="text-muted-foreground/40 group-hover:text-primary/40 transition-colors text-xs">
              →
            </span>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link href={`/projects/${id}`} className="group block h-full">
      <div className="relative border border-border rounded-lg p-5 bg-card hover:border-primary/35 transition-all duration-300 h-full flex flex-col justify-between overflow-hidden min-h-[130px]">
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none bg-[radial-gradient(ellipse_at_top_left,hsl(36_96%_64%_/_0.03)_0%,transparent_60%)]" />

        <div className="relative">
          <h3 className="font-body font-medium text-sm text-foreground group-hover:text-primary transition-colors duration-200 mb-2 leading-snug">
            {name}
          </h3>
          {description && (
            <p className="text-xs text-muted-foreground font-body leading-relaxed line-clamp-3">
              {description}
            </p>
          )}
        </div>

        <div className="relative mt-4">
          <p className="text-[10px] text-muted-foreground/50 font-body tabular-nums">{formatted}</p>
        </div>
      </div>
    </Link>
  );
}
