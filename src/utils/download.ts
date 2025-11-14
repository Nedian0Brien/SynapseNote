import download from 'downloadjs';

export async function downloadFile(url: string, filename?: string): Promise<void> {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Download failed, the download status is: ${response.status}`);
    }

    const blob = await response.blob();

    download(blob, filename);
  } catch (error) {
    console.error(error);
  }
}
