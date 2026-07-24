import type { Slot } from '@mini-clash/data';
import type { Intent } from '@mini-clash/protocol';
import * as THREE from 'three';
import { useSettings } from '../state/settings';
import { unlockAudio } from './audio';
import type { FollowCamera } from './camera';

/**
 * Input (GAME_DESIGN §15): right-click moves — or attacks when over an enemy —
 * left-click targets, smart-cast on key-release with hold-indicator, A attack-move,
 * S stop, T dance.
 */

export interface InputCallbacks {
  /** Alt+right-click quick ping (bridge mode). */
  quickPing?: () => void;
  send: (intent: Intent) => void;
  pickEntity: (ndcX: number, ndcY: number) => number | null;
  onEscape: () => void;
  moveMarker: (x: number, z: number, kind: 'move' | 'attack') => void;
}

export class InputManager {
  aimingSlot: Slot | null = null;
  cursorGround = new THREE.Vector3();
  private ndc = new THREE.Vector2();
  private lastMovePing = 0;
  private moveHeld = false;
  private disposed = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private camera: FollowCamera,
    private cb: InputCallbacks,
  ) {
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('contextmenu', this.onContext);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  private toNdc(e: PointerEvent): void {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -(((e.clientY - r.top) / r.height) * 2 - 1),
    );
  }

  private onPointerMove = (e: PointerEvent): void => {
    this.toNdc(e);
    if (this.moveHeld) this.issueMove(false);
  };

  private onContext = (e: Event): void => e.preventDefault();

  private issueMove(ping: boolean): void {
    // Recompute at event time — the per-frame update lags pointer events by a frame.
    this.camera.screenToGround(this.ndc.x, this.ndc.y, this.cursorGround);
    this.cb.send({ t: 'move', x: this.cursorGround.x, z: this.cursorGround.z });
    const now = performance.now();
    if (ping || now - this.lastMovePing > 350) {
      this.lastMovePing = now;
      this.cb.moveMarker(this.cursorGround.x, this.cursorGround.z, 'move');
    }
  }

  private onPointerDown = (e: PointerEvent): void => {
    unlockAudio();
    this.toNdc(e);
    if (e.button === 2) {
      // Alt+right-click = quick Attack ping (UI_UX §8 comms).
      if (e.altKey && this.cb.quickPing) {
        this.camera.screenToGround(this.ndc.x, this.ndc.y, this.cursorGround);
        this.cb.quickPing();
        return;
      }
      // Right-click on an enemy = attack it (standard MOBA click scheme);
      // empty ground = move order.
      const target = this.cb.pickEntity(this.ndc.x, this.ndc.y);
      if (target !== null) {
        this.camera.screenToGround(this.ndc.x, this.ndc.y, this.cursorGround);
        this.cb.send({ t: 'attackTarget', target });
        this.cb.moveMarker(this.cursorGround.x, this.cursorGround.z, 'attack');
        return;
      }
      this.moveHeld = true;
      this.issueMove(true);
      return;
    }
    if (e.button !== 0) return;
    this.camera.screenToGround(this.ndc.x, this.ndc.y, this.cursorGround);
    if (this.aimingSlot) {
      // Click-confirm an aimed cast.
      this.cb.send({
        t: 'cast',
        slot: this.aimingSlot,
        x: this.cursorGround.x,
        z: this.cursorGround.z,
      });
      this.aimingSlot = null;
      return;
    }
    const picked = this.cb.pickEntity(this.ndc.x, this.ndc.y);
    if (picked !== null) {
      this.cb.send({ t: 'attackTarget', target: picked });
      this.cb.moveMarker(this.cursorGround.x, this.cursorGround.z, 'attack');
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.button === 2) this.moveHeld = false;
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.disposed) return;
    if (e.code === 'Escape') {
      this.aimingSlot = null;
      this.cb.onEscape();
      return;
    }
    if (e.repeat) return;
    const kb = useSettings.getState().keybinds;
    unlockAudio();
    this.camera.screenToGround(this.ndc.x, this.ndc.y, this.cursorGround);
    switch (e.code) {
      case kb.castQ:
        this.aimingSlot = 'q';
        break;
      case kb.castW:
        this.aimingSlot = 'w';
        break;
      case kb.castR:
        this.aimingSlot = 'r';
        break;
      case kb.attackMove:
        this.cb.send({ t: 'attackMove', x: this.cursorGround.x, z: this.cursorGround.z });
        this.cb.moveMarker(this.cursorGround.x, this.cursorGround.z, 'attack');
        break;
      case kb.stop:
        this.cb.send({ t: 'stop' });
        break;
      case kb.dance:
        this.cb.send({ t: 'dance' });
        break;
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    const kb = useSettings.getState().keybinds;
    const slot: Slot | null =
      e.code === kb.castQ ? 'q' : e.code === kb.castW ? 'w' : e.code === kb.castR ? 'r' : null;
    if (slot && this.aimingSlot === slot) {
      // Smart-cast on release at the cursor.
      this.cb.send({ t: 'cast', slot, x: this.cursorGround.x, z: this.cursorGround.z });
      this.aimingSlot = null;
    }
  };

  /** Refresh the ground cursor every frame (the camera moves under a static pointer). */
  update(): void {
    this.camera.screenToGround(this.ndc.x, this.ndc.y, this.cursorGround);
  }

  dispose(): void {
    this.disposed = true;
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('contextmenu', this.onContext);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }
}
