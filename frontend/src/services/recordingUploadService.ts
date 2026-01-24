/**
 * Service for handling chunked video uploads to Cloudflare R2
 *
 * Supports both multipart upload (for large files) and direct upload (for small files < 5MB)
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

// Minimum size for multipart upload (5MB)
const MIN_MULTIPART_SIZE = 5 * 1024 * 1024;

export interface UploadInfo {
  uploadId: string;
  key: string;
  bucket: string;
}

export interface DirectUploadInfo {
  presignedUrl: string;
  key: string;
  bucket: string;
}

export interface UploadPart {
  PartNumber: number;
  ETag: string;
}

export interface UploadProgress {
  uploadedBytes: number;
  totalBytes: number;
  percentage: number;
  partsUploaded: number;
  totalParts: number;
}

export class RecordingUploadService {
  private apiToken: string;
  private uploadInfo: UploadInfo | null = null;
  private directUploadInfo: DirectUploadInfo | null = null;
  private uploadedParts: UploadPart[] = [];
  private recordingType: "webcam" | "screen";
  private onProgress?: (progress: UploadProgress) => void;
  private totalBytes = 0;
  private uploadedBytes = 0;
  private useDirectUpload = false;

  constructor(
    apiToken: string,
    recordingType: "webcam" | "screen",
    onProgress?: (progress: UploadProgress) => void
  ) {
    this.apiToken = apiToken;
    this.recordingType = recordingType;
    this.onProgress = onProgress;
  }

  /**
   * Initialize the multipart upload
   */
  async initializeUpload(contentType: string = "video/webm"): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE}/take/${this.apiToken}/recording/initiate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recording_type: this.recordingType,
          content_type: contentType,
        }),
      });

      if (!response.ok) {
        console.error("Failed to initialize upload:", await response.text());
        return false;
      }

      const data = await response.json();
      this.uploadInfo = {
        uploadId: data.upload_id,
        key: data.key,
        bucket: data.bucket,
      };
      this.uploadedParts = [];
      this.uploadedBytes = 0;
      this.totalBytes = 0;
      this.useDirectUpload = false;

      return true;
    } catch (error) {
      console.error("Error initializing upload:", error);
      return false;
    }
  }

  /**
   * Initialize direct upload (for small files < 5MB)
   */
  async initializeDirectUpload(contentType: string = "video/webm"): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE}/take/${this.apiToken}/recording/direct-upload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recording_type: this.recordingType,
          content_type: contentType,
        }),
      });

      if (!response.ok) {
        console.error("Failed to initialize direct upload:", await response.text());
        return false;
      }

      const data = await response.json();
      this.directUploadInfo = {
        presignedUrl: data.presigned_url,
        key: data.key,
        bucket: data.bucket,
      };
      this.useDirectUpload = true;
      this.uploadedBytes = 0;
      this.totalBytes = 0;

      return true;
    } catch (error) {
      console.error("Error initializing direct upload:", error);
      return false;
    }
  }

  /**
   * Upload a single chunk (for multipart upload)
   */
  async uploadChunk(chunk: Blob, partNumber: number): Promise<boolean> {
    if (!this.uploadInfo) {
      console.error("Upload not initialized");
      return false;
    }

    try {
      // Get presigned URL for this part
      const urlResponse = await fetch(
        `${API_BASE}/take/${this.apiToken}/recording/presigned-url`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            key: this.uploadInfo.key,
            upload_id: this.uploadInfo.uploadId,
            part_number: partNumber,
          }),
        }
      );

      if (!urlResponse.ok) {
        console.error("Failed to get presigned URL:", await urlResponse.text());
        return false;
      }

      const { presigned_url } = await urlResponse.json();

      // Upload the chunk directly to R2
      const uploadResponse = await fetch(presigned_url, {
        method: "PUT",
        body: chunk,
        headers: {
          "Content-Type": "video/webm",
        },
      });

      if (!uploadResponse.ok) {
        console.error("Failed to upload chunk:", uploadResponse.status);
        return false;
      }

      // Get ETag from response
      const etag = uploadResponse.headers.get("ETag");
      if (!etag) {
        console.error("No ETag in upload response");
        return false;
      }

      // Store the uploaded part info
      this.uploadedParts.push({
        PartNumber: partNumber,
        ETag: etag,
      });

      // Update progress
      this.uploadedBytes += chunk.size;
      this.notifyProgress();

      return true;
    } catch (error) {
      console.error(`Error uploading chunk ${partNumber}:`, error);
      return false;
    }
  }

  /**
   * Upload entire recording directly (for small files < 5MB)
   */
  async uploadDirect(data: Blob): Promise<boolean> {
    if (!this.directUploadInfo) {
      console.error("Direct upload not initialized");
      return false;
    }

    try {

      const uploadResponse = await fetch(this.directUploadInfo.presignedUrl, {
        method: "PUT",
        body: data,
        headers: {
          "Content-Type": "video/webm",
        },
      });

      if (!uploadResponse.ok) {
        console.error("Failed to upload directly:", uploadResponse.status);
        return false;
      }

      this.uploadedBytes = data.size;
      this.totalBytes = data.size;
      this.notifyProgress();

      return true;
    } catch (error) {
      console.error("Error uploading directly:", error);
      return false;
    }
  }

  /**
   * Complete the multipart upload
   */
  async completeUpload(): Promise<string | null> {
    // Handle direct upload completion
    if (this.useDirectUpload && this.directUploadInfo) {
      return this.completeDirectUpload();
    }

    // Handle multipart upload completion
    if (!this.uploadInfo || this.uploadedParts.length === 0) {
      console.error("No upload info or no parts uploaded");
      return null;
    }

    try {
      const response = await fetch(`${API_BASE}/take/${this.apiToken}/recording/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          key: this.uploadInfo.key,
          upload_id: this.uploadInfo.uploadId,
          recording_type: this.recordingType,
          parts: this.uploadedParts,
        }),
      });

      if (!response.ok) {
        console.error("Failed to complete upload:", await response.text());
        return null;
      }

      const result = await response.json();
      
      return result.recording_url;
    } catch (error) {
      console.error("Error completing upload:", error);
      return null;
    }
  }

  /**
   * Complete the direct upload
   */
  async completeDirectUpload(): Promise<string | null> {
    if (!this.directUploadInfo) {
      console.error("No direct upload info");
      return null;
    }

    try {
      const response = await fetch(`${API_BASE}/take/${this.apiToken}/recording/direct-complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          key: this.directUploadInfo.key,
          recording_type: this.recordingType,
        }),
      });

      if (!response.ok) {
        console.error("Failed to complete direct upload:", await response.text());
        return null;
      }

      const result = await response.json();

      return result.recording_url;
    } catch (error) {
      console.error("Error completing direct upload:", error);
      return null;
    }
  }

  /**
   * Check if a size requires multipart upload
   */
  static needsMultipartUpload(size: number): boolean {
    return size >= MIN_MULTIPART_SIZE;
  }

  /**
   * Get minimum multipart size
   */
  static getMinMultipartSize(): number {
    return MIN_MULTIPART_SIZE;
  }

  /**
   * Set total size for progress tracking
   */
  setTotalSize(bytes: number) {
    this.totalBytes = bytes;
  }

  /**
   * Notify progress listeners
   */
  private notifyProgress() {
    if (this.onProgress && this.totalBytes > 0) {
      const percentage = Math.min(100, (this.uploadedBytes / this.totalBytes) * 100);
      this.onProgress({
        uploadedBytes: this.uploadedBytes,
        totalBytes: this.totalBytes,
        percentage,
        partsUploaded: this.uploadedParts.length,
        totalParts: Math.ceil(this.totalBytes / MIN_MULTIPART_SIZE),
      });
    }
  }

  /**
   * Get current upload progress
   */
  getProgress(): UploadProgress {
    return {
      uploadedBytes: this.uploadedBytes,
      totalBytes: this.totalBytes,
      percentage: this.totalBytes > 0 ? (this.uploadedBytes / this.totalBytes) * 100 : 0,
      partsUploaded: this.uploadedParts.length,
      totalParts: Math.ceil(this.totalBytes / MIN_MULTIPART_SIZE),
    };
  }

  /**
   * Check if using direct upload mode
   */
  isDirectUpload(): boolean {
    return this.useDirectUpload;
  }

  /**
   * Get the key for the upload
   */
  getKey(): string | null {
    if (this.useDirectUpload && this.directUploadInfo) {
      return this.directUploadInfo.key;
    }
    if (this.uploadInfo) {
      return this.uploadInfo.key;
    }
    return null;
  }

  /**
   * Reset the upload state
   */
  reset() {
    this.uploadInfo = null;
    this.directUploadInfo = null;
    this.uploadedParts = [];
    this.uploadedBytes = 0;
    this.totalBytes = 0;
    this.useDirectUpload = false;
  }
}
