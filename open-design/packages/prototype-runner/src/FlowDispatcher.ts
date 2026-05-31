/**
 * FlowDispatcher: applies the project's FlowEdge graph to runtime events.
 *
 * Given a triggering signal (a Button click, an event name, a time tick),
 * the dispatcher finds matching FlowEdge(s) from the current screen and
 * tells the runner to transition.
 *
 * @packageDocumentation
 */

import type {
  ButtonComponent,
  FlowEdge,
  FlowTrigger,
  GameProject,
  ScreenId,
} from '@greybox/schema';

/**
 * Lightweight signal the dispatcher consumes. `runner.handleSignal()`
 * funnels every runtime event through here.
 */
export type FlowSignal =
  | { type: 'button-click'; componentId: string; button: ButtonComponent }
  | { type: 'menu-item-click'; componentId: string; itemId: string; event?: string | undefined }
  | { type: 'time-elapsed'; elapsedSeconds: number }
  | { type: 'script-event'; eventId: string; payload?: unknown }
  | { type: 'collision'; tag: string }
  | { type: 'swipe'; direction: 'up' | 'down' | 'left' | 'right' }
  | { type: 'long-press'; componentId: string; durationSeconds: number };

/**
 * Decision produced by the dispatcher. Either:
 * - go-to-screen — change the active screen.
 * - emit-event   — fire a named runtime event for spectators.
 * - none         — no edge matched.
 */
export type FlowDecision =
  | { kind: 'goto-screen'; from: ScreenId; to: ScreenId; edge: FlowEdge }
  | { kind: 'emit-event'; eventName: string; payload?: unknown }
  | { kind: 'none' };

/**
 * Dispatcher. Construct once per loaded project; the runner asks it to
 * resolve signals into decisions on every event.
 */
export class FlowDispatcher {
  private readonly edges: readonly FlowEdge[];

  constructor(project: GameProject) {
    this.edges = project.flow;
  }

  /**
   * Map a runtime signal originating from `currentScreenId` to a decision.
   *
   * The first matching edge wins. If a Button's `onClickEvent` matches a
   * `scriptEvent` trigger, that path is preferred over a generic `tap`.
   */
  dispatch(signal: FlowSignal, currentScreenId: ScreenId): FlowDecision {
    const candidates = this.edges.filter((e) => e.from === currentScreenId);
    if (candidates.length === 0) return { kind: 'none' };

    switch (signal.type) {
      case 'button-click': {
        // Prefer scriptEvent matches when the Button carries onClickEvent.
        if (signal.button.onClickEvent) {
          const eventEdge = candidates.find(
            (e) =>
              e.trigger.type === 'scriptEvent' &&
              e.trigger.eventId === signal.button.onClickEvent,
          );
          if (eventEdge) {
            return {
              kind: 'goto-screen',
              from: currentScreenId,
              to: eventEdge.to,
              edge: eventEdge,
            };
          }
        }
        const tapEdge = candidates.find(
          (e) =>
            e.trigger.type === 'tap' &&
            (!('componentRef' in e.trigger) ||
              !e.trigger.componentRef ||
              e.trigger.componentRef === signal.componentId),
        );
        if (tapEdge) {
          return {
            kind: 'goto-screen',
            from: currentScreenId,
            to: tapEdge.to,
            edge: tapEdge,
          };
        }
        return { kind: 'none' };
      }
      case 'menu-item-click': {
        if (signal.event) {
          const eventEdge = candidates.find(
            (e) =>
              e.trigger.type === 'scriptEvent' &&
              e.trigger.eventId === signal.event,
          );
          if (eventEdge) {
            return {
              kind: 'goto-screen',
              from: currentScreenId,
              to: eventEdge.to,
              edge: eventEdge,
            };
          }
        }
        return { kind: 'none' };
      }
      case 'time-elapsed': {
        const timeEdge = candidates.find(
          (e) =>
            e.trigger.type === 'time' &&
            e.trigger.delaySeconds <= signal.elapsedSeconds,
        );
        if (timeEdge) {
          return {
            kind: 'goto-screen',
            from: currentScreenId,
            to: timeEdge.to,
            edge: timeEdge,
          };
        }
        return { kind: 'none' };
      }
      case 'script-event': {
        const eventEdge = candidates.find(
          (e) =>
            e.trigger.type === 'scriptEvent' &&
            e.trigger.eventId === signal.eventId,
        );
        if (eventEdge) {
          return {
            kind: 'goto-screen',
            from: currentScreenId,
            to: eventEdge.to,
            edge: eventEdge,
          };
        }
        return { kind: 'emit-event', eventName: signal.eventId, payload: signal.payload };
      }
      case 'collision': {
        const collEdge = candidates.find(
          (e) => e.trigger.type === 'collision' && e.trigger.tag === signal.tag,
        );
        if (collEdge) {
          return {
            kind: 'goto-screen',
            from: currentScreenId,
            to: collEdge.to,
            edge: collEdge,
          };
        }
        return { kind: 'none' };
      }
      case 'swipe': {
        const swipeEdge = candidates.find(
          (e) =>
            e.trigger.type === 'swipe' && e.trigger.direction === signal.direction,
        );
        if (swipeEdge) {
          return {
            kind: 'goto-screen',
            from: currentScreenId,
            to: swipeEdge.to,
            edge: swipeEdge,
          };
        }
        return { kind: 'none' };
      }
      case 'long-press': {
        const lpEdge = candidates.find(
          (e) =>
            e.trigger.type === 'longPress' &&
            e.trigger.durationSeconds <= signal.durationSeconds &&
            (!('componentRef' in e.trigger) ||
              !e.trigger.componentRef ||
              e.trigger.componentRef === signal.componentId),
        );
        if (lpEdge) {
          return {
            kind: 'goto-screen',
            from: currentScreenId,
            to: lpEdge.to,
            edge: lpEdge,
          };
        }
        return { kind: 'none' };
      }
      default: {
        const exhaustive: never = signal;
        void exhaustive;
        return { kind: 'none' };
      }
    }
  }

  /**
   * List all edges that fire on time-trigger from the given screen. The
   * runner uses this to schedule screen-transition timers when entering
   * a screen.
   */
  timedEdgesFor(screenId: ScreenId): readonly FlowEdge[] {
    return this.edges.filter(
      (e) => e.from === screenId && e.trigger.type === 'time',
    );
  }

  /**
   * Convenience: extract the delay (seconds) from a time-typed FlowTrigger.
   */
  static timeDelay(trigger: FlowTrigger): number | null {
    return trigger.type === 'time' ? trigger.delaySeconds : null;
  }
}
