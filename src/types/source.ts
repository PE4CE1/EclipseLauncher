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
  status: 'pending' | 'syncing' | 'up_to_date' | 'error';
  optionsCount: number;
  lastSynced?: number;
  data: HydraDownload[];
}
