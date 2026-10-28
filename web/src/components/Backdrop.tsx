/* Ambient "on air" background shared by every page. Styles live in styles.css (.dd-backdrop). */
export function Backdrop() {
  return (
    <div className="dd-backdrop" aria-hidden>
      <div className="dd-glow b" />
      <div className="dd-glow a" />
      <div className="dd-glow c" />
      <div className="dd-grid" />
      <div className="dd-grain" />
      <div className="dd-vignette" />
    </div>
  );
}
