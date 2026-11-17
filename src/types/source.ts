export interface HydraDownload {
  title: string;
  uris: string[];
  fileSize: string;
  uploadDate: string;
}

export interface HydraSourceData {
  name: string;
  downloads: HydraDownload[];
}

export interface DownloadSource {
  url: string;
  name: string;
  status: 'pending' | 'syncing' | 'up_to_date' | 'cached' | 'error';
  lastError?: string;
  optionsCount: number;
  lastSynced?: number;
  data: HydraDownload[];
}

export interface FetchSourceResult {
  success: boolean
  name?: string
  data?: HydraDownload[]
  error?: string
  stale?: boolean
  lastSynced?: number
}
