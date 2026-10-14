import { Icon } from './Icon';

export function PageHeading({
  title,
  description,
  onRefresh,
}: {
  title: string;
  description: string;
  onRefresh: () => void;
}) {
  return (
    <div className="page-heading">
      <div>
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
