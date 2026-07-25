import { useEffect } from 'react';
import { useLobby } from './state/lobby';
import { useSession } from './state/session';
import { applyTextScale, useSettings } from './state/settings';
import { BootScreen } from './ui/BootScreen';
import { ChampionSelect } from './ui/ChampionSelect';
import { HubScreen } from './ui/HubScreen';
import { LobbyScreen } from './ui/LobbyScreen';
import { MatchView } from './ui/match/MatchView';
import { NameScreen } from './ui/NameScreen';

export function App(): React.ReactElement {
  const screen = useSession((s) => s.screen);
  const textScale = useSettings((s) => s.textScale);

  useEffect(() => applyTextScale(textScale), [textScale]);

  // ?join=CODE deep link (copy-link from a lobby): stash the code for the hub's
  // join flow and strip it from the URL so reloads don't re-trigger it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('join');
    if (code && /^[A-Za-z0-9]{6}$/.test(code)) {
      useLobby.getState().setPendingCode(code.toUpperCase());
      params.delete('join');
      const rest = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`);
    }
  }, []);

  switch (screen) {
    case 'boot':
      return <BootScreen />;
    case 'name':
      return <NameScreen />;
    case 'hub':
      return <HubScreen />;
    case 'select':
      return <ChampionSelect />;
    case 'lobby':
      return <LobbyScreen />;
    case 'match':
      return <MatchView />;
  }
}
