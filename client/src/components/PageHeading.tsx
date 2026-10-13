import { Icon } from './Icon';

export function PageHeading({
  eyebrow,
  title,
  description,
  onRefresh,
}: {
  eyebrow: string;
  title: string;
  description: string;
  onRefresh: () => void;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <button className="button button-secondary refresh-button" onClick={onRefresh}>
        <Icon name="refresh" />
        Refresh
      </button>
    </div>
  );
}
