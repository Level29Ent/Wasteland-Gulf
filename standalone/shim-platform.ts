export function createDataService(p: { data: unknown }) { return p.data as { user(id: string): { read(): Promise<unknown>; write(d: unknown): Promise<void> } }; }
