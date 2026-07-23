import { STRINGS } from '@mini-clash/data';
import { useEffect, useState } from 'react';
import { useSession } from '../state/session';

/** Boot: warm the asset manifest + fonts, then route to name pick or hub. */
export function BootScreen(): React.ReactElement {
  const [progress, setProgress] = useState(0.1);
  const goto = useSession((s) => s.goto);
  const profile = useSession((s) => s.profile);

  useEffect(() => {
    let alive = true;
    const started = performance.now();
    const work = async (): Promise<void> => {
      const steps: Promise<unknown>[] = [
        fetch('/game-assets/manifest.json').then((r) => r.json()),
        document.fonts.ready,
      ];
      let done = 0;
      for (const s of steps) {
        s.then(() => {
          done++;
          if (alive) setProgress(0.15 + (done / steps.length) * 0.85);
        }).catch(() => {
          done++;
        });
      }
      await Promise.allSettled(steps);
      // Let the logo breathe even on instant loads.
      const elapsed = performance.now() - started;
      await new Promise((r) => setTimeout(r, Math.max(0, 700 - elapsed)));
      if (alive) goto(profile ? 'hub' : 'name');
    };
    void work();
    return () => {
      alive = false;
    };
  }, [goto, profile]);

  return (
    <div className="screen">
      <h1 className="title-hero">
        MINI <span className="clash">CLASH</span>
      </h1>
      <div className="boot-bar">
        <div style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <span className="subtle-onvoid">{STRINGS.tagline}</span>
    </div>
  );
}
