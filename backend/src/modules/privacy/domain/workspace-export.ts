export type ExportJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly ExportJsonValue[]
  | ExportJsonObject;

export interface ExportJsonObject {
  readonly [key: string]: ExportJsonValue;
}

export interface WorkspaceExportDocument {
  readonly schemaVersion: 'workspace-export-v1';
  readonly exportedAt: string;
  readonly workspace: {
    readonly id: string;
    readonly slug: string;
    readonly name: string;
    readonly createdAt: string;
    readonly updatedAt: string;
  };
  readonly data: ExportJsonObject;
}

export interface WorkspaceExportRepository {
  exportWorkspace(input: {
    readonly workspaceId: string;
    readonly userId: string;
    readonly exportedAt: Date;
  }): Promise<WorkspaceExportDocument | null>;
}
