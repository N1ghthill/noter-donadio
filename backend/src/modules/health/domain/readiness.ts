export type DependencyState = 'ok' | 'unavailable';

export interface ReadinessResult {
  readonly database: DependencyState;
  readonly redis: DependencyState;
}

export interface ReadinessProbe {
  check(): Promise<ReadinessResult>;
}
