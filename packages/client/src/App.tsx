import { useEffect } from 'react';
import { useSession } from './state/session';
import { applyTextScale, useSettings } from './state/settings';
import { BootScreen } from './ui/BootScreen';
import { ChampionSelect } from './ui/ChampionSelect';
import { HubScreen } from './ui/HubScreen';
import { MatchView } from './ui/match/MatchView';
import { NameScreen } from './ui/NameScreen';

export function App(): React.ReactElement {
  const screen = useSession((s) => s.screen);
  const textScale = useSettings((s) => s.textScale);

  useEffect(() => applyTextScale(textScale), [textScale]);

  switch (screen) {
    case 'boot':
      return <BootScreen />;
    case 'name':
      return <NameScreen />;
    case 'hub':
      return <HubScreen />;
    case 'select':
      return <ChampionSelect />;
    case 'match':
      return <MatchView />;
  }
}
