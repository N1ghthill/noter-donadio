export interface NotificationStatus {
  readonly lastInboundMessageAt: Date | null;
  readonly lastDeliveredAt: Date | null;
  readonly deliveries: {
    readonly pending: number;
    readonly processing: number;
    readonly completed: number;
    readonly failed: number;
  };
}

export interface NotificationStatusRepository {
  get(workspaceId: string): Promise<NotificationStatus>;
}
