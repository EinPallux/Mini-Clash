import { STRINGS } from '@mini-clash/data';
import { useEffect, useState } from 'react';
import { uiSound } from '../game/audio';
import {
  DEFAULT_KEYBINDS,
  type Keybinds,
  type Palette,
  type Quality,
  useSettings,
} from '../state/settings';

type Tab = 'video' | 'audio' | 'controls' | 'accessibility';

const KEY_LABELS: Record<keyof Keybinds, string> = {
  castQ: 'Ability Q',
  castW: 'Ability W',
  castR: 'Ultimate R',
  attackMove: 'Attack-move',
  stop: 'Stop',
  dance: 'Dance',
  swap: 'Tag Swap',
};

export function SettingsModal({ onClose }: { onClose: () => void }): React.ReactElement {
  const [tab, setTab] = useState<Tab>('video');
  const s = useSettings();
  const [listening, setListening] = useState<keyof Keybinds | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (listening) {
        e.preventDefault();
        if (e.code !== 'Escape') s.setKeybind(listening, e.code);
        setListening(null);
        return;
      }
      if (e.code === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [listening, onClose, s]);

  const seg = <T extends string>(
    value: T,
    options: [T, string][],
    onPick: (v: T) => void,
  ): React.ReactElement => (
    <div className="seg">
      {options.map(([v, label]) => (
        <button
          type="button"
          key={v}
          className={value === v ? 'on' : ''}
          onClick={() => {
            uiSound('ui_click');
            onPick(v);
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );

  const toggle = (on: boolean, onFlip: (v: boolean) => void): React.ReactElement => (
    <button
      type="button"
      className={`toggle ${on ? 'on' : ''}`}
      aria-pressed={on}
      onClick={() => {
        uiSound('ui_click');
        onFlip(!on);
      }}
    />
  );

  return (
    <div className="modal-veil" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="panel settings-panel">
        <div className="row spread">
          <h2 style={{ fontStyle: 'italic' }}>{STRINGS.settings}</h2>
          <button type="button" className="btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="settings-tabs">
          {(
            [
              ['video', STRINGS.settingsVideo],
              ['audio', STRINGS.settingsAudio],
              ['controls', STRINGS.settingsControls],
              ['accessibility', STRINGS.settingsAccessibility],
            ] as [Tab, string][]
          ).map(([t, label]) => (
            <button
              type="button"
              key={t}
              className={`tab ${tab === t ? 'on' : ''}`}
              onClick={() => {
                uiSound('ui_hover');
                setTab(t);
              }}
            >
              <span>{label}</span>
            </button>
          ))}
        </div>

        {tab === 'video' && (
          <div className="col">
            <div className="set-row">
              <span className="lbl">Quality</span>
              {seg<Quality>(
                s.quality,
                [
                  ['auto', STRINGS.qualityAuto],
                  ['low', STRINGS.qualityLow],
                  ['medium', STRINGS.qualityMedium],
                  ['high', STRINGS.qualityHigh],
                ],
                (v) => s.set({ quality: v }),
              )}
            </div>
            <div className="set-row">
              <span className="lbl">{STRINGS.fpsCap}</span>
              {seg(
                String(s.fpsCap) as '0' | '30' | '60',
                [
                  ['0', 'Uncapped'],
                  ['60', '60'],
                  ['30', '30'],
                ],
                (v) => s.set({ fpsCap: Number(v) as 0 | 30 | 60 }),
              )}
            </div>
            <div className="set-row">
              <span className="lbl">{STRINGS.screenShake}</span>
              {toggle(s.screenShake, (v) => s.set({ screenShake: v }))}
            </div>
            <div className="set-row">
              <span className="lbl">{STRINGS.hitFlash}</span>
              {toggle(s.hitFlash, (v) => s.set({ hitFlash: v }))}
            </div>
            <div className="set-row">
              <span className="lbl">{STRINGS.reducedVfx}</span>
              {toggle(s.reducedVfx, (v) => s.set({ reducedVfx: v }))}
            </div>
          </div>
        )}

        {tab === 'audio' && (
          <div className="col">
            {(
              [
                ['master', STRINGS.masterVolume],
                ['music', STRINGS.musicVolume],
                ['sfx', STRINGS.sfxVolume],
                ['ui', STRINGS.uiVolume],
              ] as [keyof typeof s.volumes, string][]
            ).map(([bus, label]) => (
              <div className="set-row" key={bus}>
                <span className="lbl" style={{ minWidth: 90 }}>
                  {label}
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={s.volumes[bus]}
                  onChange={(e) => s.setVolume(bus, Number(e.target.value))}
                  onPointerUp={() => uiSound('ui_click')}
                />
              </div>
            ))}
          </div>
        )}

        {tab === 'controls' && (
          <div className="col">
            {(Object.keys(KEY_LABELS) as (keyof Keybinds)[]).map((action) => (
              <div className="set-row" key={action}>
                <span className="lbl">{KEY_LABELS[action]}</span>
                <button
                  type="button"
                  className={`keycap ${listening === action ? 'listening' : ''}`}
                  onClick={() => setListening(action)}
                >
                  {listening === action ? STRINGS.pressKey : prettyKey(s.keybinds[action])}
                </button>
              </div>
            ))}
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  uiSound('ui_back');
                  for (const k of Object.keys(DEFAULT_KEYBINDS) as (keyof Keybinds)[]) {
                    s.setKeybind(k, DEFAULT_KEYBINDS[k]);
                  }
                }}
              >
                {STRINGS.resetDefaults}
              </button>
            </div>
            <span className="subtle">
              Right-click moves · left-click on a target attacks it · Esc opens the menu.
            </span>
          </div>
        )}

        {tab === 'accessibility' && (
          <div className="col">
            <div className="set-row">
              <span className="lbl">{STRINGS.colorblind}</span>
              {seg<Palette>(
                s.palette,
                [
                  ['default', STRINGS.paletteDefault],
                  ['blueOrange', STRINGS.paletteBlueOrange],
                  ['magentaTeal', STRINGS.paletteMagentaTeal],
                ],
                (v) => s.set({ palette: v }),
              )}
            </div>
            <div className="set-row">
              <span className="lbl">
                {STRINGS.textScale} ({Math.round(s.textScale * 100)}%)
              </span>
              <input
                type="range"
                min={1}
                max={1.4}
                step={0.05}
                value={s.textScale}
                onChange={(e) => s.set({ textScale: Number(e.target.value) })}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function prettyKey(code: string): string {
  return code
    .replace(/^Key/, '')
    .replace(/^Digit/, '')
    .replace('Space', '␣');
}
