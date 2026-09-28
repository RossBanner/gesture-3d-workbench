interface Window {
  workbench?: {
    saveScene(text: string): Promise<{ canceled?: boolean; name?: string; error?: string }>;
    openScene(): Promise<{ canceled?: boolean; text?: string; name?: string; error?: string }>;
    cameraAccess(enabled: boolean): Promise<void>;
  };
}
