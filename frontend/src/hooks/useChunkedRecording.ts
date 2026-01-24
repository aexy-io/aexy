/**
 * Hook for managing chunked video recording with streaming upload to R2
 *
 * R2 multipart uploads require all non-final parts to be EXACTLY the same size.
 * This hook buffers video chunks and uploads fixed-size parts (10MB each) during recording.
 * The final part can be smaller.
 */

import { useCallback, useRef, useState } from "react";
import {
  RecordingUploadService,
  UploadProgress,
} from "@/services/recordingUploadService";

// Fixed part size for R2 multipart upload (10MB)
// All non-final parts MUST be exactly this size for R2 compatibility
const FIXED_PART_SIZE = 10 * 1024 * 1024;

// Threshold below which we use direct upload instead of multipart
const DIRECT_UPLOAD_THRESHOLD = 10 * 1024 * 1024;

export interface ChunkedRecordingOptions {
  apiToken: string;
  recordingType: "webcam" | "screen";
  mediaStream: MediaStream | null;
  chunkDurationMs?: number; // Duration of each chunk in milliseconds
  onProgress?: (progress: UploadProgress) => void;
  onError?: (error: string) => void;
}

export interface ChunkedRecordingState {
  isRecording: boolean;
  isUploading: boolean;
  uploadProgress: UploadProgress | null;
  error: string | null;
}

export function useChunkedRecording(options: ChunkedRecordingOptions) {
  const {
    apiToken,
    recordingType,
    mediaStream,
    chunkDurationMs = 5000, // 5 seconds per chunk for more frequent data
    onProgress,
    onError,
  } = options;

  const [state, setState] = useState<ChunkedRecordingState>({
    isRecording: false,
    isUploading: false,
    uploadProgress: null,
    error: null,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const uploadServiceRef = useRef<RecordingUploadService | null>(null);
  const currentPartNumberRef = useRef<number>(0);
  const isUploadingRef = useRef<boolean>(false);

  // Buffer for accumulating data until we have a fixed-size part
  const bufferRef = useRef<Blob | null>(null);

  // Queue for parts ready to upload (each exactly FIXED_PART_SIZE)
  const uploadQueueRef = useRef<Blob[]>([]);

  // Track total bytes for progress
  const totalBytesRecordedRef = useRef<number>(0);

  /**
   * Process the upload queue - uploads parts sequentially
   */
  const processUploadQueue = useCallback(async () => {
    const uploadService = uploadServiceRef.current;
    if (!uploadService || isUploadingRef.current) return;

    if (uploadQueueRef.current.length === 0) {
      setState((prev) => ({ ...prev, isUploading: false }));
      return;
    }

    isUploadingRef.current = true;
    setState((prev) => ({ ...prev, isUploading: true }));

    while (uploadQueueRef.current.length > 0) {
      const part = uploadQueueRef.current.shift();
      if (!part) break;

      currentPartNumberRef.current += 1;
      const partNumber = currentPartNumberRef.current;


      const success = await uploadService.uploadChunk(part, partNumber);

      if (!success) {
        const errorMsg = `Failed to upload ${recordingType} part ${partNumber}`;
        console.error(errorMsg);
        setState((prev) => ({ ...prev, error: errorMsg }));
        if (onError) onError(errorMsg);
        break;
      }
    }

    isUploadingRef.current = false;
    setState((prev) => ({ ...prev, isUploading: uploadQueueRef.current.length > 0 }));
  }, [recordingType, onError]);

  /**
   * Add data to buffer and extract fixed-size parts for upload
   */
  const handleChunk = useCallback(
    async (chunk: Blob) => {
      totalBytesRecordedRef.current += chunk.size;

      // Combine with existing buffer
      if (bufferRef.current) {
        bufferRef.current = new Blob([bufferRef.current, chunk], { type: "video/webm" });
      } else {
        bufferRef.current = chunk;
      }


      // Extract as many fixed-size parts as possible
      while (bufferRef.current && bufferRef.current.size >= FIXED_PART_SIZE) {
        // Extract exactly FIXED_PART_SIZE bytes
        const part = bufferRef.current.slice(0, FIXED_PART_SIZE);
        const remainder = bufferRef.current.slice(FIXED_PART_SIZE);

        // Update buffer with remainder
        bufferRef.current = remainder.size > 0 ? remainder : null;

        // Queue the fixed-size part for upload
        uploadQueueRef.current.push(part);
      }

      // Process upload queue (non-blocking)
      processUploadQueue();
    },
    [recordingType, processUploadQueue]
  );

  /**
   * Start recording
   */
  const startRecording = useCallback(async () => {
    if (!mediaStream) {
      const errorMsg = "No media stream available";
      setState((prev) => ({ ...prev, error: errorMsg }));
      if (onError) onError(errorMsg);
      return false;
    }

    try {
      // Initialize upload service
      const uploadService = new RecordingUploadService(apiToken, recordingType, (progress) => {
        setState((prev) => ({ ...prev, uploadProgress: progress }));
        if (onProgress) onProgress(progress);
      });

      // Initialize multipart upload
      const initialized = await uploadService.initializeUpload();
      if (!initialized) {
        const errorMsg = `Failed to initialize ${recordingType} upload`;
        setState((prev) => ({ ...prev, error: errorMsg }));
        if (onError) onError(errorMsg);
        return false;
      }

      uploadServiceRef.current = uploadService;
      currentPartNumberRef.current = 0;
      bufferRef.current = null;
      uploadQueueRef.current = [];
      totalBytesRecordedRef.current = 0;

      // Create MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm";

      const mediaRecorder = new MediaRecorder(mediaStream, {
        mimeType,
        videoBitsPerSecond: 2500000, // 2.5 Mbps
      });

      mediaRecorder.ondataavailable = async (event) => {
        if (event.data && event.data.size > 0) {
          await handleChunk(event.data);
        }
      };

      mediaRecorder.onerror = (event: Event) => {
        const error = (event as ErrorEvent).error || "MediaRecorder error";
        console.error(`${recordingType} MediaRecorder error:`, error);
        setState((prev) => ({ ...prev, error: error.toString() }));
        if (onError) onError(error.toString());
      };

      mediaRecorder.onstop = () => {
        console.log(`${recordingType} MediaRecorder stopped`);
      };

      // Start recording with time slicing
      mediaRecorder.start(chunkDurationMs);
      mediaRecorderRef.current = mediaRecorder;

      setState((prev) => ({ ...prev, isRecording: true, error: null }));

      return true;
    } catch (error: unknown) {
      const errorMsg = `Failed to start ${recordingType} recording: ${error instanceof Error ? error.message : String(error)}`;
      console.error(errorMsg, error);
      setState((prev) => ({ ...prev, error: errorMsg }));
      if (onError) onError(errorMsg);
      return false;
    }
  }, [
    mediaStream,
    apiToken,
    recordingType,
    chunkDurationMs,
    handleChunk,
    onProgress,
    onError,
  ]);

  /**
   * Stop recording and complete upload
   */
  const stopRecording = useCallback(async (): Promise<string | null> => {
    const mediaRecorder = mediaRecorderRef.current;
    const uploadService = uploadServiceRef.current;

    if (!mediaRecorder || !uploadService) {
      console.warn(`${recordingType} recording not started`);
      return null;
    }

    return new Promise((resolve) => {
      const handleFinalUpload = async () => {
        // Wait for any pending data
        await new Promise((r) => setTimeout(r, 500));

        const totalRecorded = totalBytesRecordedRef.current;
        const bufferSize = bufferRef.current?.size || 0;

        console.log(
          `${recordingType} stopping: total recorded ${(totalRecorded / 1024 / 1024).toFixed(2)} MB, ` +
            `buffer ${(bufferSize / 1024 / 1024).toFixed(2)} MB, ` +
            `parts uploaded: ${currentPartNumberRef.current}`
        );

        // Check if recording is small enough for direct upload
        if (currentPartNumberRef.current === 0 && totalRecorded < DIRECT_UPLOAD_THRESHOLD) {
          // No parts uploaded yet and total is small - use direct upload
          if (bufferRef.current && bufferRef.current.size > 0) {

            setState((prev) => ({ ...prev, isUploading: true }));

            // Initialize direct upload
            const directInitialized = await uploadService.initializeDirectUpload();
            if (!directInitialized) {
              console.error(`Failed to initialize ${recordingType} direct upload`);
              setState((prev) => ({
                ...prev,
                error: `Failed to initialize ${recordingType} upload`,
                isRecording: false,
                isUploading: false,
              }));
              resolve(null);
              return;
            }

            // Upload directly
            uploadService.setTotalSize(bufferRef.current.size);
            const uploadSuccess = await uploadService.uploadDirect(bufferRef.current);
            if (!uploadSuccess) {
              console.error(`Failed to upload ${recordingType} recording`);
              setState((prev) => ({
                ...prev,
                error: `Failed to upload ${recordingType} recording`,
                isRecording: false,
                isUploading: false,
              }));
              resolve(null);
              return;
            }

            // Complete direct upload
            const recordingUrl = await uploadService.completeUpload();

            // Cleanup
            bufferRef.current = null;
            mediaRecorderRef.current = null;
            uploadServiceRef.current = null;
            setState((prev) => ({ ...prev, isRecording: false, isUploading: false }));

            if (recordingUrl) {
              console.log(`${recordingType} direct upload completed:`, recordingUrl);
            }
            resolve(recordingUrl);
            return;
          } else {
            console.warn(`${recordingType} no data was recorded`);
            setState((prev) => ({
              ...prev,
              error: `No ${recordingType} data was recorded`,
              isRecording: false,
            }));
            resolve(null);
            return;
          }
        }

        // Multipart upload path - upload final buffer as last part
        if (bufferRef.current && bufferRef.current.size > 0) {
          uploadQueueRef.current.push(bufferRef.current);
          bufferRef.current = null;
        }

        // Wait for all uploads to complete
        const waitForUploads = async (): Promise<void> => {
          // Process any remaining queue
          await processUploadQueue();

          if (uploadQueueRef.current.length > 0 || isUploadingRef.current) {
            await new Promise((r) => setTimeout(r, 500));
            return waitForUploads();
          }
        };

        await waitForUploads();

        // Check if we have any parts
        if (currentPartNumberRef.current === 0) {
          console.warn(`${recordingType} no parts were uploaded`);
          setState((prev) => ({
            ...prev,
            error: `No ${recordingType} data was recorded`,
            isRecording: false,
          }));
          resolve(null);
          return;
        }

        // Complete the multipart upload
        const recordingUrl = await uploadService.completeUpload();

        if (recordingUrl) {
          console.log(`${recordingType} recording completed:`, recordingUrl);
        } else {
          console.error(`Failed to complete ${recordingType} upload`);
          setState((prev) => ({
            ...prev,
            error: `Failed to complete ${recordingType} upload`,
          }));
        }

        // Cleanup
        mediaRecorderRef.current = null;
        uploadServiceRef.current = null;
        setState((prev) => ({ ...prev, isRecording: false, isUploading: false }));

        resolve(recordingUrl);
      };

      // Stop the media recorder
      if (mediaRecorder.state !== "inactive") {
        mediaRecorder.requestData(); // Request any pending data
        mediaRecorder.stop();
      }

      // Start the final upload process
      handleFinalUpload();
    });
  }, [recordingType, processUploadQueue]);

  /**
   * Cancel recording without completing upload
   */
  const cancelRecording = useCallback(() => {
    const mediaRecorder = mediaRecorderRef.current;

    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }

    // Reset state
    mediaRecorderRef.current = null;
    uploadServiceRef.current = null;
    bufferRef.current = null;
    uploadQueueRef.current = [];
    currentPartNumberRef.current = 0;
    totalBytesRecordedRef.current = 0;

    setState({
      isRecording: false,
      isUploading: false,
      uploadProgress: null,
      error: null,
    });

    console.log(`${recordingType} recording cancelled`);
  }, [recordingType]);

  return {
    ...state,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
