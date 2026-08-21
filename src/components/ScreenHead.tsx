/**
 * The block at the top of a section that does not scroll: where you are, how
 * you got here, and the way back up.
 *
 * It exists because the shop's header was four separate rows stacked down the
 * page -- a breadcrumb on its own line, a title, a subtitle, then the sort bar
 * -- each starting at the same left margin with air between them. Four rows of
 * ragged left edges do not read as one header; they read as four unrelated
 * things that happen to be near each other, and together they pushed the first
 * car 300px down a screen whose whole job is showing cars.
 *
 * The back link is now IN the title line rather than above it. That is the
 * whole trick: it is one row instead of two, and putting the arrow beside the
 * name it returns to says what it does far better than a line of small caps
 * floating overhead ever did.
 */
interface Back {
  /** Where it goes, named. "← Concesionarios", not "← Atrás". */
  label: string;
  onBack: () => void;
}

interface Props {
  title: string;
  sub?: string | undefined;
  /** Absent at the top of a section, where there is nothing to go back to. */
  back?: Back | undefined;
  /**
   * Controls that belong to the header rather than to the list: the shop's
   * sort and filter bar. Pinned with the title, so it is still there when you
   * are deep enough in the list to want it.
   */
  children?: React.ReactNode;
}

export function ScreenHead({ title, sub, back, children }: Props) {
  return (
    <div className="screen-head">
      <div className="head-line">
        {back ? (
          <button className="head-back" onClick={back.onBack} aria-label={`Volver a ${back.label}`}>
            {/* The arrow is the affordance and the label is the destination;
                both are drawn, because an unlabelled arrow at the top of a
                nested list is a guess about where it lands. */}
            <span aria-hidden="true">←</span>
            <span className="head-back-to">{back.label}</span>
          </button>
        ) : null}
        <h2 className="screen-title">{title}</h2>
      </div>
      {sub ? <p className="screen-sub">{sub}</p> : null}
      {children}
    </div>
  );
}
