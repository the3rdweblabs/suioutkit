import type { LucideIcon } from "lucide-react";

interface Props {
  icon: LucideIcon;
  title: string;
  description: string;
}

export default function FeatureCard({ icon: Icon, title, description }: Props) {
  return (
    <article className="card">
      <div className="card__icon-wrap" aria-hidden="true">
        <Icon size={22} strokeWidth={1.75} />
      </div>
      <h3 className="card__title">{title}</h3>
      <p className="card__text">{description}</p>
    </article>
  );
}
