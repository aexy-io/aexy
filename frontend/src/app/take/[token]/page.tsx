"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Clock,
  AlertTriangle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Camera,
  Monitor,
  Loader2,
  Play,
  Send,
  Lock,
} from "lucide-react";
import * as faceapi from "face-api.js";
import { MAX_VIOLATION_COUNT } from "@/constants";
import { useChunkedRecording } from "@/hooks/useChunkedRecording";

// Types
interface AssessmentInfo {
  assessment_id: string;
  title: string;
  job_designation: string | null;
  description: string | null;
  total_questions: number;
  total_duration_minutes: number;
  topics: { name: string; duration_minutes: number; question_count: number }[];
  instructions: string | null;
  proctoring_enabled: boolean;
  webcam_required: boolean;
  fullscreen_required: boolean;
  screen_recording_enabled: boolean;
  face_detection_enabled: boolean;
  tab_tracking_enabled: boolean;
  copy_paste_disabled: boolean;
  deadline: string | null;
  can_start: boolean;
  message: string | null;
}

interface Question {
  id: string;
  sequence: number;
  question_type: string;
  difficulty: string;
  problem_statement: string;
  options: { id: string; text: string }[] | null;
  starter_code: Record<string, string> | null;
  constraints: string[] | null;
  examples: { input: string; output: string; explanation?: string }[] | null;
  max_marks: number;
  time_limit_seconds: number | null;
}

interface AttemptStatus {
  status: string;
  attempt_id?: string;
  started_at?: string;
  time_remaining_seconds?: number;
  questions_submitted?: number;
  total_questions?: number;
  score?: number;
  completed_at?: string;
  can_start?: boolean;
  needs_email?: boolean;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export default function AssessmentTakePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  // State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assessmentInfo, setAssessmentInfo] = useState<AssessmentInfo | null>(null);
  const [attemptStatus, setAttemptStatus] = useState<AttemptStatus | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showInstructions, setShowInstructions] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  // Token for API calls (may differ from URL token for public access)
  const [apiToken, setApiToken] = useState<string>(token);
  // Email for public access
  const [candidateEmail, setCandidateEmail] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [needsEmail, setNeedsEmail] = useState(false);

  // Proctoring state
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [faceDetectionInterval, setFaceDetectionInterval] = useState<NodeJS.Timeout | null>(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Proctoring status and violations
  const [faceDetected, setFaceDetected] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [screenRecordingActive, setScreenRecordingActive] = useState(false);
  const [violationCount, setViolationCount] = useState(0);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [warningMessage, setWarningMessage] = useState("");

  // Chunked recording hooks for R2 upload
  const webcamRecording = useChunkedRecording({
    apiToken,
    recordingType: "webcam",
    mediaStream: webcamStream,
    chunkDurationMs: 10000, // 10 seconds per chunk
    onProgress: (progress) => {
      console.log("Webcam upload progress:", progress.percentage.toFixed(1), "%");
    },
    onError: (error) => {
      console.error("Webcam recording error:", error);
    },
  });

  const screenRecording = useChunkedRecording({
    apiToken,
    recordingType: "screen",
    mediaStream: screenStream,
    chunkDurationMs: 10000, // 10 seconds per chunk
    onProgress: (progress) => {
      console.log("Screen upload progress:", progress.percentage.toFixed(1), "%");
    },
    onError: (error) => {
      console.error("Screen recording error:", error);
    },
  });

  // Load face-api.js models
  useEffect(() => {
    async function loadModels() {
      try {
        const MODEL_URL = "/models";
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        setModelsLoaded(true);
      } catch (err) {
        console.error("Failed to load face detection models:", err);
      }
    }
    loadModels();
  }, []);

  // Fetch assessment info
  useEffect(() => {
    async function fetchInfo() {
      try {
        const response = await fetch(`${API_BASE}/take/${token}`);
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.detail || "Failed to load assessment");
        }
        const data = await response.json();
        setAssessmentInfo(data);

        // Check status
        const statusResponse = await fetch(`${API_BASE}/take/${token}/status`);
        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          setAttemptStatus(statusData);

          // Check if this is public access requiring email
          if (statusData.needs_email) {
            setNeedsEmail(true);
          }

          if (statusData.status === "in_progress") {
            setShowInstructions(false);
            setTimeRemaining(statusData.time_remaining_seconds || 0);
            await loadQuestions();
          } else if (statusData.status === "completed") {
            setShowInstructions(false);
          }
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchInfo();
  }, [token]);

  // Load questions - uses apiToken which may be different from URL token
  const loadQuestions = async (tokenToUse?: string) => {
    try {
      const useToken = tokenToUse || apiToken;
      const response = await fetch(`${API_BASE}/take/${useToken}/questions`);
      if (!response.ok) throw new Error("Failed to load questions");
      const data = await response.json();
      setQuestions(data.questions);
      setTimeRemaining(data.time_remaining_seconds);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Timer
  useEffect(() => {
    if (attemptStatus?.status !== "in_progress" || timeRemaining <= 0) return;

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          handleComplete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [attemptStatus?.status, timeRemaining]);

  // Format time
  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  // Start assessment
  const handleStart = async () => {
    // Validate email if needed for public access
    if (needsEmail && !candidateEmail) {
      setError("Please enter your email address");
      return;
    }

    setIsStarting(true);
    setError(null);
    try {
      // Request webcam if required
      if (assessmentInfo?.webcam_required) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
          });
          setWebcamStream(stream);
        } catch (err) {
          setError("Webcam access is required to start this assessment. Please allow webcam access and try again.");
          setIsStarting(false);
          return;
        }
      }

      // Request screen recording if enabled
      if (assessmentInfo?.screen_recording_enabled) {
        try {
          const stream = await (navigator.mediaDevices as any).getDisplayMedia({
            video: true,
            audio: false
          });
          setScreenStream(stream);
          setScreenRecordingActive(true);

          // Monitor if screen recording stops
          stream.getTracks().forEach((track: MediaStreamTrack) => {
            track.onended = () => {
              setScreenRecordingActive(false);
              addViolation("Screen recording stopped! Please share your screen again.");
            };
          });
        } catch (err) {
          console.warn("Screen recording not available:", err);
          // Don't block assessment if screen recording fails
        }
      }

      const body: Record<string, string> = {};
      if (needsEmail) {
        body.candidate_email = candidateEmail;
        if (candidateName) {
          body.candidate_name = candidateName;
        }
      }

      const response = await fetch(`${API_BASE}/take/${token}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Failed to start assessment");
      }

      const data = await response.json();

      // Store the invitation token for subsequent API calls
      const newToken = data.token || token;
      setApiToken(newToken);

      setAttemptStatus({
        status: "in_progress",
        attempt_id: data.attempt_id,
        started_at: data.started_at,
        time_remaining_seconds: data.time_remaining_seconds,
        total_questions: data.total_questions,
      });
      setTimeRemaining(data.time_remaining_seconds);
      setShowInstructions(false);
      await loadQuestions(newToken);

      // Request fullscreen if required
      if (assessmentInfo?.fullscreen_required) {
        try {
          await document.documentElement.requestFullscreen();
          setIsFullscreen(true);
        } catch (e) {
          console.warn("Fullscreen not available");
        }
      }

      // Start face detection if enabled
      if (assessmentInfo?.face_detection_enabled && webcamStream) {
        startFaceDetection();
      }

      // Face detection will be started by the useEffect below
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsStarting(false);
    }
  };

  // Submit answer
  const handleSubmitAnswer = async (questionId: string, content: any) => {
    try {
      const response = await fetch(`${API_BASE}/take/${apiToken}/submit/${questionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          time_spent_seconds: 0,
        }),
      });

      if (!response.ok) throw new Error("Failed to submit answer");

      setAnswers((prev) => ({ ...prev, [questionId]: content }));
    } catch (err: any) {
      console.error("Submit error:", err);
    }
  };

  // Log proctoring event
  const logProctoringEvent = useCallback(
    async (eventType: string, data?: any) => {
      if (!assessmentInfo?.proctoring_enabled) return;

      try {
        await fetch(`${API_BASE}/take/${apiToken}/proctoring/event`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event_type: eventType, data }),
        });
      } catch (e) {
        console.warn("Failed to log proctoring event");
      }
    },
    [apiToken, assessmentInfo?.proctoring_enabled]
  );

  // Complete handler ref for auto-submit
  const completeHandlerRef = useRef<(() => Promise<void>) | null>(null);

  // Face detection violation tracking
  const lastFaceViolationTimeRef = useRef<number>(0);

  // Track if submission is in progress to prevent duplicate calls
  const isSubmittingRef = useRef<boolean>(false);

  // Add violation and show warning
  const addViolation = useCallback((message: string) => {
    // Don't add violations if already submitting or completed
    if (isSubmittingRef.current) {
      return;
    }

    setViolationCount((prev) => {
      const newCount = prev + 1;
      setWarningMessage(message);
      setShowWarningModal(true);

      // Auto-submit if exceeded max violations (only if not already submitting)
      if (newCount >= MAX_VIOLATION_COUNT && completeHandlerRef.current && !isSubmittingRef.current) {
        // Don't set isSubmittingRef here - let handleComplete set it
        setTimeout(() => {
          if (!isSubmittingRef.current && completeHandlerRef.current) {
            completeHandlerRef.current();
          }
        }, 2000);
      }

      return newCount;
    });
  }, []);

  // Handle warning modal close and re-enable settings
  const handleWarningClose = useCallback(async () => {
    setShowWarningModal(false);

    // Re-enable fullscreen if required and not in fullscreen
    if (assessmentInfo?.fullscreen_required && !document.fullscreenElement) {
      try {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } catch (e) {
        console.warn("Could not re-enable fullscreen");
      }
    }

    // Re-enable screen recording if required and not active
    if (assessmentInfo?.screen_recording_enabled && !screenRecordingActive) {
      try {
        const stream = await (navigator.mediaDevices as any).getDisplayMedia({
          video: true,
          audio: false
        });

        // Stop old stream if exists
        if (screenStream) {
          screenStream.getTracks().forEach(track => track.stop());
        }

        setScreenStream(stream);
        setScreenRecordingActive(true);

        // Monitor if screen recording stops
        stream.getTracks().forEach((track: MediaStreamTrack) => {
          track.onended = () => {
            setScreenRecordingActive(false);
            addViolation("Screen recording stopped! Please share your screen again.");
          };
        });
      } catch (err) {
        console.warn("Could not re-enable screen recording:", err);
      }
    }
  }, [assessmentInfo, screenRecordingActive, screenStream, addViolation]);

// Face detection function
  const startFaceDetection = useCallback(() => {
    if (!modelsLoaded || !videoRef.current || !webcamStream) {
      return;
    }

    const video = videoRef.current;
    video.srcObject = webcamStream;
    // Wait for video to be ready
    video.onloadedmetadata = () => {
      video.play()
        .then(() => console.log("Video playing successfully"))
        .catch(err => console.error("Video play failed:", err));
    };

    const VIOLATION_COOLDOWN = 10000; // 10 seconds cooldown between violations

    const detectFaces = async () => {
      if (!video || video.paused || video.ended) {
        return;
      }

      try {
        const detections = await faceapi.detectAllFaces(
          video,
          new faceapi.TinyFaceDetectorOptions()
        );

        const now = Date.now();
        const canAddViolation = now - lastFaceViolationTimeRef.current > VIOLATION_COOLDOWN;

        // Log face detection events
        if (detections.length === 0) {
          setFaceDetected(false);
          if (canAddViolation) {
            logProctoringEvent("no_face_detected", { timestamp: now });
            addViolation("Face not detected! Please ensure your face is visible in the camera.");
            lastFaceViolationTimeRef.current = now;
          }
        } else if (detections.length > 1) {
          setFaceDetected(false);
          if (canAddViolation) {
            logProctoringEvent("multiple_faces_detected", {
              count: detections.length,
              timestamp: now
            });
            addViolation(`Multiple faces detected (${detections.length})! Only you should be visible.`);
            lastFaceViolationTimeRef.current = now;
          }
        } else {
          setFaceDetected(true);
        }
      } catch (err) {
        console.warn("Face detection error:", err);
      }
    };

    const interval = setInterval(detectFaces, 3000); // Check every 3 seconds
    setFaceDetectionInterval(interval);

    // Run first detection immediately
    setTimeout(detectFaces, 1000);
  }, [modelsLoaded, webcamStream, logProctoringEvent, addViolation]);

  // Complete assessment
  const handleComplete = useCallback(async () => {
    // Prevent duplicate submissions
    if (isSubmittingRef.current) {
      return;
    }
    isSubmittingRef.current = true;
    setIsSubmitting(true);


    try {
      // Submit all pending answers
      for (const [questionId, content] of Object.entries(answers)) {
        await handleSubmitAnswer(questionId, content);
      }

      // Stop and finalize recordings before completing
      console.log("Stopping recordings...");
      const recordingPromises = [];

      if (webcamRecording.isRecording) {
        console.log("Stopping webcam recording...");
        recordingPromises.push(
          webcamRecording.stopRecording().then((url) => {
            if (url) {
              console.log("Webcam recording saved:", url);
            } else {
              console.warn("Webcam recording URL not returned");
            }
          })
        );
      }

      if (screenRecording.isRecording) {
        console.log("Stopping screen recording...");
        recordingPromises.push(
          screenRecording.stopRecording().then((url) => {
            if (url) {
              console.log("Screen recording saved:", url);
            } else {
              console.warn("Screen recording URL not returned");
            }
          })
        );
      }

      // Wait for all recordings to finish uploading
      if (recordingPromises.length > 0) {
        console.log("Waiting for recordings to finish uploading...");
        await Promise.all(recordingPromises);
        console.log("All recordings uploaded successfully");
      }

      const response = await fetch(`${API_BASE}/take/${apiToken}/complete`, {
        method: "POST",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to complete assessment");
      }

      const data = await response.json();
      setAttemptStatus({
        status: "completed",
        attempt_id: data.attempt_id,
        completed_at: data.completed_at,
      });

      // Clean up media streams
      if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
      }
      if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
      }
      if (faceDetectionInterval) {
        clearInterval(faceDetectionInterval);
      }

      // Exit fullscreen
      if (document.fullscreenElement) {
        document.exitFullscreen();
      }


    } catch (err: any) {
      console.error("Error completing assessment:", err);
      // Only show error if it's not a duplicate submission error
      if (!err.message.includes("already completed") && !err.message.includes("not in progress")) {
        setError(err.message);
      }
    } finally {
      setIsSubmitting(false);
      // Keep isSubmittingRef true to prevent any further attempts
    }
  }, [answers, apiToken, webcamStream, screenStream, faceDetectionInterval, webcamRecording, screenRecording]);

  // Store complete handler in ref
  useEffect(() => {
    completeHandlerRef.current = handleComplete;
  }, [handleComplete]);

  // Request webcam on page load/reload if assessment is in progress
  useEffect(() => {
    async function requestWebcam() {
      if (
        attemptStatus?.status === "in_progress" &&
        assessmentInfo?.webcam_required &&
        !webcamStream
      ) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
          });
          setWebcamStream(stream);
        } catch (err) {
          console.error("Failed to re-request webcam:", err);
          setError("Webcam access is required. Please allow webcam access and refresh the page.");
        }
      }
    }

    requestWebcam();
  }, [attemptStatus?.status, assessmentInfo?.webcam_required, webcamStream]);

  // Re-enable fullscreen and screen recording on page reload
  useEffect(() => {
    async function reEnableProctoring() {
      if (attemptStatus?.status !== "in_progress") return;

      // Re-enable fullscreen
      if (assessmentInfo?.fullscreen_required && !document.fullscreenElement) {

        try {
          await document.documentElement.requestFullscreen();
          setIsFullscreen(true);
        } catch (err) {
          console.warn("Could not re-enable fullscreen:", err);
        }
      }

      // Re-enable screen recording
      if (assessmentInfo?.screen_recording_enabled && !screenStream) {
        try {
          const stream = await (navigator.mediaDevices as any).getDisplayMedia({
            video: true,
            audio: false
          });
          setScreenStream(stream);
          setScreenRecordingActive(true);

          // Monitor if screen recording stops
          stream.getTracks().forEach((track: MediaStreamTrack) => {
            track.onended = () => {
              setScreenRecordingActive(false);
              addViolation("Screen recording stopped! Please share your screen again.");
            };
          });
        } catch (err) {
          console.warn("Could not re-enable screen recording:", err);
        }
      }
    }

    // Only run once when component mounts with in_progress status
    const timeoutId = setTimeout(reEnableProctoring, 500);
    return () => clearTimeout(timeoutId);
  }, [attemptStatus?.status, assessmentInfo?.fullscreen_required, assessmentInfo?.screen_recording_enabled]);

  // Start face detection when conditions are met
  useEffect(() => {
    if (
      attemptStatus?.status === "in_progress" &&
      assessmentInfo?.face_detection_enabled &&
      modelsLoaded &&
      webcamStream &&
      videoRef.current &&
      !faceDetectionInterval
    ) {
      startFaceDetection();
    }
  }, [attemptStatus?.status, assessmentInfo?.face_detection_enabled, modelsLoaded, webcamStream, faceDetectionInterval, startFaceDetection]);

  // Start webcam recording when stream is available
  useEffect(() => {
    if (
      attemptStatus?.status === "in_progress" &&
      assessmentInfo?.webcam_required &&
      webcamStream &&
      !webcamRecording.isRecording
    ) {
      console.log("Starting webcam recording...");
      webcamRecording.startRecording();
    }
  }, [attemptStatus?.status, assessmentInfo?.webcam_required, webcamStream, webcamRecording.isRecording]);

  // Start screen recording when stream is available
  useEffect(() => {
    if (
      attemptStatus?.status === "in_progress" &&
      assessmentInfo?.screen_recording_enabled &&
      screenStream &&
      !screenRecording.isRecording
    ) {
      console.log("Starting screen recording...");
      screenRecording.startRecording();
    }
  }, [attemptStatus?.status, assessmentInfo?.screen_recording_enabled, screenStream, screenRecording.isRecording]);

  // Proctoring: Tab switch detection
  useEffect(() => {
    if (attemptStatus?.status !== "in_progress" || !assessmentInfo?.tab_tracking_enabled) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        logProctoringEvent("tab_switch");
        addViolation("Tab switch detected! Stay on the assessment page.");
      }
    };

    const handleBlur = () => {
      logProctoringEvent("window_blur");
      addViolation("Window lost focus! Keep the assessment window active.");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
    };
  }, [attemptStatus?.status, assessmentInfo?.tab_tracking_enabled, logProctoringEvent, addViolation]);

  // Proctoring: Fullscreen exit detection
  useEffect(() => {
    if (attemptStatus?.status !== "in_progress" || !assessmentInfo?.fullscreen_required) return;

    // Check initial fullscreen state
    setIsFullscreen(!!document.fullscreenElement);

    const handleFullscreenChange = () => {
      const inFullscreen = !!document.fullscreenElement;
      setIsFullscreen(inFullscreen);

      if (!inFullscreen && attemptStatus?.status === "in_progress") {
        logProctoringEvent("fullscreen_exit");
        addViolation("You exited fullscreen mode! Please return to fullscreen.");
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [attemptStatus?.status, assessmentInfo?.fullscreen_required, logProctoringEvent, addViolation]);

  // Proctoring: Copy/Paste detection
  useEffect(() => {
    if (attemptStatus?.status !== "in_progress" || !assessmentInfo?.copy_paste_disabled) return;

    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      logProctoringEvent("copy_attempt");
      addViolation("Copy attempt detected! Copying is disabled.");
    };

    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      logProctoringEvent("paste_attempt");
      addViolation("Paste attempt detected! Pasting is disabled.");
    };

    const handleCut = (e: ClipboardEvent) => {
      e.preventDefault();
      logProctoringEvent("cut_attempt");
      addViolation("Cut attempt detected! Cutting is disabled.");
    };

    document.addEventListener("copy", handleCopy);
    document.addEventListener("paste", handlePaste);
    document.addEventListener("cut", handleCut);

    return () => {
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("paste", handlePaste);
      document.removeEventListener("cut", handleCut);
    };
  }, [attemptStatus?.status, assessmentInfo?.copy_paste_disabled, logProctoringEvent, addViolation]);

  // Current question
  const currentQuestion = questions[currentQuestionIndex];

  // Render loading
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // Render error
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Error</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  // Render completed
  if (attemptStatus?.status === "completed") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md text-center">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Assessment Completed!</h2>
          <p className="text-gray-600 mb-6">
            Thank you for completing the assessment. Your responses have been submitted successfully.
          </p>
          {attemptStatus.score !== undefined && (
            <p className="text-lg font-semibold text-gray-900 mb-4">
              Score: {attemptStatus.score}%
            </p>
          )}
          <p className="text-sm text-gray-500">You can close this window now.</p>
        </div>
      </div>
    );
  }

  // Render instructions / landing page
  if (showInstructions && assessmentInfo) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-3xl mx-auto px-4">
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            {/* Header */}
            <div className="bg-blue-600 text-white p-6">
              <h1 className="text-2xl font-bold">{assessmentInfo.title}</h1>
              {assessmentInfo.job_designation && (
                <p className="text-blue-100 mt-1">{assessmentInfo.job_designation}</p>
              )}
            </div>

            {/* Info Grid */}
            <div className="p-6 border-b grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-gray-900">{assessmentInfo.total_questions}</p>
                <p className="text-sm text-gray-500">Questions</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{assessmentInfo.total_duration_minutes}</p>
                <p className="text-sm text-gray-500">Minutes</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{assessmentInfo.topics.length}</p>
                <p className="text-sm text-gray-500">Topics</p>
              </div>
            </div>

            {/* Topics */}
            {assessmentInfo.topics.length > 0 && (
              <div className="p-6 border-b">
                <h3 className="font-semibold text-gray-900 mb-3">Topics Covered</h3>
                <div className="space-y-2">
                  {assessmentInfo.topics.map((topic, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span className="text-gray-700">{topic.name}</span>
                      <span className="text-gray-500">
                        {topic.question_count} questions ({topic.duration_minutes} min)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Proctoring Info */}
            {assessmentInfo.proctoring_enabled && (
              <div className="p-6 border-b bg-yellow-50">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Camera className="h-5 w-5" />
                  Proctoring Enabled
                </h3>
                <ul className="text-sm text-gray-600 space-y-1">
                  {assessmentInfo.webcam_required && (
                    <li className="flex items-center gap-2">
                      <Camera className="h-4 w-4 text-yellow-600" />
                      Webcam access required
                    </li>
                  )}
                  {assessmentInfo.screen_recording_enabled && (
                    <li className="flex items-center gap-2">
                      <Monitor className="h-4 w-4 text-yellow-600" />
                      Screen recording will be enabled
                    </li>
                  )}
                  {assessmentInfo.fullscreen_required && (
                    <li className="flex items-center gap-2">
                      <Monitor className="h-4 w-4 text-yellow-600" />
                      Fullscreen mode required
                    </li>
                  )}
                  {assessmentInfo.face_detection_enabled && (
                    <li className="flex items-center gap-2">
                      <Camera className="h-4 w-4 text-yellow-600" />
                      Face detection will be active
                    </li>
                  )}
                  {assessmentInfo.tab_tracking_enabled && (
                    <li className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-600" />
                      Tab switches will be recorded
                    </li>
                  )}
                  {assessmentInfo.copy_paste_disabled && (
                    <li className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-600" />
                      Copy/paste is disabled
                    </li>
                  )}
                </ul>
              </div>
            )}

            {/* Instructions */}
            <div className="p-6 border-b">
              <h3 className="font-semibold text-gray-900 mb-3">Instructions</h3>
              <ul className="text-sm text-gray-600 space-y-2">
                <li>Ensure you have a stable internet connection</li>
                <li>Do not refresh the page during the assessment</li>
                <li>Answers are auto-saved as you proceed</li>
                <li>You cannot go back once time runs out</li>
                {assessmentInfo.instructions && <li>{assessmentInfo.instructions}</li>}
              </ul>
            </div>

            {/* Message or Start Button */}
            <div className="p-6">
              {!assessmentInfo.can_start ? (
                <div className="text-center">
                  <Lock className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-600">{assessmentInfo.message}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Email collection for public access */}
                  {needsEmail && (
                    <div className="space-y-3">
                      <div>
                        <label htmlFor="candidate-name" className="block text-sm font-medium text-gray-700 mb-1">
                          Your Name
                        </label>
                        <input
                          type="text"
                          id="candidate-name"
                          value={candidateName}
                          onChange={(e) => setCandidateName(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 placeholder-gray-400"
                          placeholder="Enter your name"
                        />
                      </div>
                      <div>
                        <label htmlFor="candidate-email" className="block text-sm font-medium text-gray-700 mb-1">
                          Email Address <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="email"
                          id="candidate-email"
                          value={candidateEmail}
                          onChange={(e) => setCandidateEmail(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 placeholder-gray-400"
                          placeholder="Enter your email"
                          required
                        />
                      </div>
                    </div>
                  )}
                  {error && (
                    <p className="text-sm text-red-600">{error}</p>
                  )}
                  <button
                    onClick={handleStart}
                    disabled={isStarting || (needsEmail && !candidateEmail)}
                    className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isStarting ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Play className="h-5 w-5" />
                    )}
                    {isStarting ? "Starting..." : "Start Assessment"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render assessment (in progress)
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Warning Modal */}
      {showWarningModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-xl">
            <div className="flex items-start gap-4">
              <AlertTriangle className="h-8 w-8 text-red-500 flex-shrink-0 mt-1" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Proctoring Violation</h3>
                <p className="text-gray-700 mb-4">{warningMessage}</p>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-gray-600">
                    Violations: <span className="font-semibold text-red-600">{violationCount}</span> / {MAX_VIOLATION_COUNT}
                  </p>
                  <p className="text-sm text-gray-600">
                    Remaining: <span className="font-semibold">{MAX_VIOLATION_COUNT - violationCount}</span>
                  </p>
                </div>
                {violationCount >= MAX_VIOLATION_COUNT ? (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                    <p className="text-sm text-red-800 font-medium">
                      Maximum violations exceeded. Your assessment will be submitted automatically.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                      <p className="text-sm text-yellow-800">
                        Please resolve this issue to continue. {MAX_VIOLATION_COUNT - violationCount} violations remaining before automatic submission.
                      </p>
                    </div>
                    {(assessmentInfo?.fullscreen_required || assessmentInfo?.screen_recording_enabled) && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                        <p className="text-sm text-blue-800">
                          Clicking "I Understand" will attempt to re-enable required settings (fullscreen, screen sharing).
                        </p>
                      </div>
                    )}
                  </>
                )}
                <button
                  onClick={handleWarningClose}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  I Understand
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-gray-900">{assessmentInfo?.title}</h1>
          <p className="text-sm text-gray-500">
            Question {currentQuestionIndex + 1} of {questions.length}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div
            className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              timeRemaining < 300 ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700"
            }`}
          >
            <Clock className="h-5 w-5" />
            <span className="font-mono font-semibold">{formatTime(timeRemaining)}</span>
          </div>
          <button
            onClick={handleComplete}
            disabled={isSubmitting}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Submit
          </button>
        </div>
      </header>

      {/* Proctoring Status Bar */}
      {assessmentInfo?.proctoring_enabled && (
        <div className="bg-gray-50 border-b px-4 py-2">
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <div className="flex items-center gap-6">
              {/* Face Detection Status */}
              {assessmentInfo.face_detection_enabled && (
                <div className="flex items-center gap-2">
                  <Camera className={`h-4 w-4 ${faceDetected ? "text-green-600" : "text-red-600"}`} />
                  <span className={`text-sm ${faceDetected ? "text-green-700" : "text-red-700"}`}>
                    {faceDetected ? "Face Detected" : "No Face"}
                  </span>
                </div>
              )}

              {/* Fullscreen Status */}
              {assessmentInfo.fullscreen_required && (
                <div className="flex items-center gap-2">
                  <Monitor className={`h-4 w-4 ${isFullscreen ? "text-green-600" : "text-red-600"}`} />
                  <span className={`text-sm ${isFullscreen ? "text-green-700" : "text-red-700"}`}>
                    {isFullscreen ? "Fullscreen" : "Exit Fullscreen"}
                  </span>
                </div>
              )}

              {/* Screen Recording Status */}
              {assessmentInfo.screen_recording_enabled && (
                <div className="flex items-center gap-2">
                  <Monitor className={`h-4 w-4 ${screenRecordingActive ? "text-green-600" : "text-red-600"}`} />
                  <span className={`text-sm ${screenRecordingActive ? "text-green-700" : "text-red-700"}`}>
                    {screenRecordingActive ? "Screen Sharing" : "Not Sharing"}
                  </span>
                </div>
              )}
            </div>

            {/* Violation Count */}
            <div className="flex items-center gap-2">
              <AlertTriangle className={`h-4 w-4 ${violationCount >= MAX_VIOLATION_COUNT - 1 ? "text-red-600" : violationCount > 0 ? "text-yellow-600" : "text-gray-400"}`} />
              <span className={`text-sm font-medium ${violationCount >= MAX_VIOLATION_COUNT - 1 ? "text-red-700" : violationCount > 0 ? "text-yellow-700" : "text-gray-600"}`}>
                Violations: {violationCount} / {MAX_VIOLATION_COUNT}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* Question Navigation */}
        <aside className="w-64 bg-white border-r p-4 overflow-auto">
          <h3 className="font-semibold text-gray-900 mb-3">Questions</h3>
          <div className="grid grid-cols-5 gap-2">
            {questions.map((q, idx) => (
              <button
                key={q.id}
                onClick={() => setCurrentQuestionIndex(idx)}
                className={`w-10 h-10 rounded-lg text-sm font-medium ${
                  idx === currentQuestionIndex
                    ? "bg-blue-600 text-white"
                    : answers[q.id]
                    ? "bg-green-100 text-green-700 border border-green-300"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {idx + 1}
              </button>
            ))}
          </div>
          <div className="mt-4 text-xs text-gray-500">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-4 h-4 bg-blue-600 rounded"></div>
              <span>Current</span>
            </div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-4 h-4 bg-green-100 border border-green-300 rounded"></div>
              <span>Answered</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-gray-100 rounded"></div>
              <span>Unanswered</span>
            </div>
          </div>
        </aside>

        {/* Question Content */}
        <main className="flex-1 p-6 overflow-auto">
          {currentQuestion && (
            <div className="max-w-4xl mx-auto">
              {/* Question Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-1 text-xs rounded ${
                      currentQuestion.difficulty === "easy"
                        ? "bg-green-100 text-green-700"
                        : currentQuestion.difficulty === "medium"
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {currentQuestion.difficulty}
                  </span>
                  <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">
                    {currentQuestion.question_type.toUpperCase()}
                  </span>
                </div>
                <span className="text-sm text-gray-500">
                  {currentQuestion.max_marks} marks
                </span>
              </div>

              {/* Question Content */}
              <div className="bg-white rounded-lg shadow-sm p-6">
                <div className="max-w-none mb-6">
                  <p className="whitespace-pre-wrap text-gray-900">{currentQuestion.problem_statement}</p>
                </div>

                {/* MCQ Options */}
                {currentQuestion.question_type === "mcq" && currentQuestion.options && (
                  <div className="space-y-3">
                    {currentQuestion.options.map((option) => (
                      <label
                        key={option.id}
                        className={`flex items-center gap-3 p-4 border rounded-lg cursor-pointer transition-colors ${
                          answers[currentQuestion.id]?.selected_answer === option.id
                            ? "border-blue-500 bg-blue-50"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`question-${currentQuestion.id}`}
                          checked={answers[currentQuestion.id]?.selected_answer === option.id}
                          onChange={() => {
                            const content = { selected_answer: option.id };
                            setAnswers((prev) => ({ ...prev, [currentQuestion.id]: content }));
                            handleSubmitAnswer(currentQuestion.id, content);
                          }}
                          className="w-4 h-4 text-blue-600"
                        />
                        <span className="font-medium text-gray-700">{option.id}.</span>
                        <span className="text-gray-900">{option.text}</span>
                      </label>
                    ))}
                  </div>
                )}

                {/* Code Question */}
                {currentQuestion.question_type === "code" && (
                  <div>
                    {/* Constraints */}
                    {currentQuestion.constraints && currentQuestion.constraints.length > 0 && (
                      <div className="mb-4">
                        <h4 className="font-semibold text-gray-900 mb-2">Constraints</h4>
                        <ul className="text-sm text-gray-600 list-disc list-inside">
                          {currentQuestion.constraints.map((c, i) => (
                            <li key={i}>{c}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Examples */}
                    {currentQuestion.examples && currentQuestion.examples.length > 0 && (
                      <div className="mb-4">
                        <h4 className="font-semibold text-gray-900 mb-2">Examples</h4>
                        <div className="space-y-3">
                          {currentQuestion.examples.map((ex, i) => (
                            <div key={i} className="bg-gray-50 p-3 rounded-lg text-sm">
                              <p>
                                <strong>Input:</strong> <code>{ex.input}</code>
                              </p>
                              <p>
                                <strong>Output:</strong> <code>{ex.output}</code>
                              </p>
                              {ex.explanation && (
                                <p className="text-gray-500 mt-1">{ex.explanation}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Code Editor (simplified textarea) */}
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-2">Your Code</h4>
                      <textarea
                        value={answers[currentQuestion.id]?.code || currentQuestion.starter_code?.python || ""}
                        onChange={(e) => {
                          const content = { code: e.target.value, language: "python" };
                          setAnswers((prev) => ({ ...prev, [currentQuestion.id]: content }));
                        }}
                        onBlur={() => {
                          if (answers[currentQuestion.id]) {
                            handleSubmitAnswer(currentQuestion.id, answers[currentQuestion.id]);
                          }
                        }}
                        className="w-full h-64 p-4 font-mono text-sm bg-gray-900 text-green-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Write your code here..."
                      />
                    </div>
                  </div>
                )}

                {/* Subjective Question */}
                {currentQuestion.question_type === "subjective" && (
                  <div>
                    <textarea
                      value={answers[currentQuestion.id]?.text || ""}
                      onChange={(e) => {
                        const content = { text: e.target.value };
                        setAnswers((prev) => ({ ...prev, [currentQuestion.id]: content }));
                      }}
                      onBlur={() => {
                        if (answers[currentQuestion.id]) {
                          handleSubmitAnswer(currentQuestion.id, answers[currentQuestion.id]);
                        }
                      }}
                      className="w-full h-64 p-4 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Write your answer here..."
                    />
                    <p className="text-xs text-gray-500 mt-2">
                      {(answers[currentQuestion.id]?.text || "").length} characters
                    </p>
                  </div>
                )}
              </div>

              {/* Navigation */}
              <div className="flex justify-between mt-6">
                <button
                  onClick={() => setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))}
                  disabled={currentQuestionIndex === 0}
                  className="px-4 py-2 flex items-center gap-2 text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50"
                >
                  <ChevronLeft className="h-5 w-5" />
                  Previous
                </button>
                <button
                  onClick={() =>
                    setCurrentQuestionIndex((prev) => Math.min(questions.length - 1, prev + 1))
                  }
                  disabled={currentQuestionIndex === questions.length - 1}
                  className="px-4 py-2 flex items-center gap-2 text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50"
                >
                  Next
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Video element for face detection - visible for debugging */}
      <video
        ref={videoRef}
        style={{
          position: "fixed",
          bottom: "10px",
          right: "10px",
          width: "200px",
          height: "150px",
          border: "2px solid #3b82f6",
          borderRadius: "8px",
          zIndex: 40,
          display: assessmentInfo?.face_detection_enabled ? "block" : "none"
        }}
        autoPlay
        muted
        playsInline
      />
    </div>
  );
}
