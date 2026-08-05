export type LayerSnapshot = {
  id: number | string;
  name: string;
  kind: string;
  visible: boolean;
  opacity: number;
  children?: LayerSnapshot[];
};

export type DocumentSnapshot = {
  type: "documentSnapshot";
  capturedAt: string;
  document: {
    name: string;
    width: number;
    height: number;
    resolution: number;
    layers: LayerSnapshot[];
  } | null;
};

export type PhotoshopCommand = {
  id: string;
  command: string;
  args: Record<string, unknown>;
  createdAt: string;
};

export type PhotoshopCommandResult = {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
};
