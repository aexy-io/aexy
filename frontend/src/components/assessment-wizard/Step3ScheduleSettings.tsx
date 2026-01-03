"use client";

import { useState, useEffect } from "react";
import { Calendar, Clock, Shield, Camera, Monitor, AlertTriangle } from "lucide-react";
import { Assessment, ScheduleConfig, ProctoringSettings, SecuritySettings, CandidateFieldConfig } from "@/lib/api";

interface Step3Props {
  assessment: Assessment;
  onSave: (data: {
    schedule: ScheduleConfig;
    proctoring_settings?: ProctoringSettings;
    security_settings?: SecuritySettings;
    candidate_fields?: CandidateFieldConfig;
    max_attempts?: number;
    passing_score_percent?: number;
  }) => Promise<Assessment>;
  onNext: () => void;
  onPrev: () => void;
}

export default function Step3ScheduleSettings({
  assessment,
  onSave,
  onNext,
  onPrev,
}: Step3Props) {
  // Schedule state
  const [scheduleType, setScheduleType] = useState<"flexible" | "fixed">("flexible");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("18:00");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [allowLateSubmission, setAllowLateSubmission] = useState(false);
  const [gracePeriodMinutes, setGracePeriodMinutes] = useState(5);

  // Proctoring state
  const [enableProctoring, setEnableProctoring] = useState(true);
  const [webcamRequired, setWebcamRequired] = useState(true);
  const [screenRecording, setScreenRecording] = useState(false);
  const [fullscreenRequired, setFullscreenRequired] = useState(true);
  const [faceDetection, setFaceDetection] = useState(true);
  const [tabSwitchDetection, setTabSwitchDetection] = useState(true);

  // Security state
  const [disableCopyPaste, setDisableCopyPaste] = useState(true);
  const [disableRightClick, setDisableRightClick] = useState(true);
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleOptions, setShuffleOptions] = useState(true);
  const [showOneQuestionAtTime, setShowOneQuestionAtTime] = useState(false);
  const [preventBackNavigation, setPreventBackNavigation] = useState(false);

  // Other settings
  const [maxAttempts, setMaxAttempts] = useState(1);
  const [passingScore, setPassingScore] = useState(60);

  // Candidate fields
  const [requirePhone, setRequirePhone] = useState(false);
  const [requireResume, setRequireResume] = useState(false);
  const [requireLinkedIn, setRequireLinkedIn] = useState(false);
  const [requireGitHub, setRequireGitHub] = useState(false);

  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (assessment.schedule) {
      const schedule = assessment.schedule;
      setScheduleType(schedule.type || "flexible");
      if (schedule.start_date) setStartDate(schedule.start_date.split("T")[0]);
      if (schedule.end_date) setEndDate(schedule.end_date.split("T")[0]);
      if (schedule.start_time) setStartTime(schedule.start_time);
      if (schedule.end_time) setEndTime(schedule.end_time);
      if (schedule.timezone) setTimezone(schedule.timezone);
      setAllowLateSubmission(schedule.allow_late_submission || false);
      if (schedule.grace_period_minutes) setGracePeriodMinutes(schedule.grace_period_minutes);
    }

    if (assessment.proctoring_settings) {
      const proctoring = assessment.proctoring_settings;
      setEnableProctoring(proctoring.enabled ?? true);
      setWebcamRequired(proctoring.webcam_required ?? true);
      setScreenRecording(proctoring.screen_recording ?? false);
      setFullscreenRequired(proctoring.fullscreen_required ?? true);
      setFaceDetection(proctoring.face_detection ?? true);
      setTabSwitchDetection(proctoring.tab_switch_detection ?? true);
    }

    if (assessment.security_settings) {
      const security = assessment.security_settings;
      setDisableCopyPaste(security.disable_copy_paste ?? true);
      setDisableRightClick(security.disable_right_click ?? true);
      setShuffleQuestions(security.shuffle_questions ?? true);
      setShuffleOptions(security.shuffle_options ?? true);
      setShowOneQuestionAtTime(security.show_one_question_at_time ?? false);
      setPreventBackNavigation(security.prevent_back_navigation ?? false);
    }

    if (assessment.candidate_fields) {
      const fields = assessment.candidate_fields;
      setRequirePhone(fields.phone_required ?? false);
      setRequireResume(fields.resume_required ?? false);
      setRequireLinkedIn(fields.linkedin_required ?? false);
      setRequireGitHub(fields.github_required ?? false);
    }

    if (assessment.max_attempts) setMaxAttempts(assessment.max_attempts);
    if (assessment.passing_score_percent) setPassingScore(assessment.passing_score_percent);
  }, [assessment]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const schedule: ScheduleConfig = {
        type: scheduleType,
        start_date: startDate ? `${startDate}T00:00:00Z` : undefined,
        end_date: endDate ? `${endDate}T23:59:59Z` : undefined,
        start_time: scheduleType === "fixed" ? startTime : undefined,
        end_time: scheduleType === "fixed" ? endTime : undefined,
        timezone,
        allow_late_submission: allowLateSubmission,
        grace_period_minutes: gracePeriodMinutes,
      };

      const proctoring: ProctoringSettings = {
        enabled: enableProctoring,
        webcam_required: webcamRequired,
        screen_recording: screenRecording,
        fullscreen_required: fullscreenRequired,
        face_detection: faceDetection,
        tab_switch_detection: tabSwitchDetection,
      };

      const security: SecuritySettings = {
        disable_copy_paste: disableCopyPaste,
        disable_right_click: disableRightClick,
        shuffle_questions: shuffleQuestions,
        shuffle_options: shuffleOptions,
        show_one_question_at_time: showOneQuestionAtTime,
        prevent_back_navigation: preventBackNavigation,
      };

      const candidateFields: CandidateFieldConfig = {
        phone_required: requirePhone,
        resume_required: requireResume,
        linkedin_required: requireLinkedIn,
        github_required: requireGitHub,
      };

      await onSave({
        schedule,
        proctoring_settings: proctoring,
        security_settings: security,
        candidate_fields: candidateFields,
        max_attempts: maxAttempts,
        passing_score_percent: passingScore,
      });
      onNext();
    } catch (error) {
      console.error("Failed to save step 3:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const isValid = startDate && endDate && new Date(startDate) <= new Date(endDate);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-1">Schedule & Settings</h2>
        <p className="text-gray-500">Configure when and how candidates can take the assessment</p>
      </div>

      {/* Schedule Settings */}
      <div className="bg-white rounded-lg border p-6 space-y-6">
        <h3 className="font-medium text-gray-900 border-b pb-3 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-blue-600" />
          Schedule Configuration
        </h3>

        {/* Schedule Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">Schedule Type</label>
          <div className="grid grid-cols-2 gap-4">
            <label
              className={`flex items-start gap-3 p-4 border rounded-lg cursor-pointer ${
                scheduleType === "flexible" ? "border-blue-500 bg-blue-50" : ""
              }`}
            >
              <input
                type="radio"
                checked={scheduleType === "flexible"}
                onChange={() => setScheduleType("flexible")}
                className="mt-1"
              />
              <div>
                <p className="font-medium text-gray-900">Flexible Window</p>
                <p className="text-sm text-gray-500">
                  Candidates can take the test anytime within the date range
                </p>
              </div>
            </label>
            <label
              className={`flex items-start gap-3 p-4 border rounded-lg cursor-pointer ${
                scheduleType === "fixed" ? "border-blue-500 bg-blue-50" : ""
              }`}
            >
              <input
                type="radio"
                checked={scheduleType === "fixed"}
                onChange={() => setScheduleType("fixed")}
                className="mt-1"
              />
              <div>
                <p className="font-medium text-gray-900">Fixed Time Slot</p>
                <p className="text-sm text-gray-500">
                  All candidates must take the test at a specific time
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Date Range */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Start Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              End Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              min={startDate || new Date().toISOString().split("T")[0]}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
            />
          </div>
        </div>

        {/* Time Slot (for fixed schedule) */}
        {scheduleType === "fixed" && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
              />
            </div>
          </div>
        )}

        {/* Timezone */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
          >
            <option value="Asia/Kolkata">India (IST)</option>
            <option value="America/New_York">Eastern Time (ET)</option>
            <option value="America/Los_Angeles">Pacific Time (PT)</option>
            <option value="Europe/London">UK (GMT/BST)</option>
            <option value="UTC">UTC</option>
          </select>
        </div>

        {/* Grace Period */}
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={allowLateSubmission}
              onChange={(e) => setAllowLateSubmission(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600"
            />
            <span className="text-sm text-gray-700">Allow late submission with grace period</span>
          </label>
          {allowLateSubmission && (
            <input
              type="number"
              min={1}
              max={30}
              value={gracePeriodMinutes}
              onChange={(e) => setGracePeriodMinutes(parseInt(e.target.value))}
              className="w-20 px-2 py-1 border rounded text-sm bg-white text-gray-900"
            />
          )}
          {allowLateSubmission && <span className="text-sm text-gray-500">minutes</span>}
        </div>
      </div>

      {/* Proctoring Settings */}
      <div className="bg-white rounded-lg border p-6 space-y-6">
        <div className="flex items-center justify-between border-b pb-3">
          <h3 className="font-medium text-gray-900 flex items-center gap-2">
            <Camera className="w-5 h-5 text-blue-600" />
            Proctoring Settings
          </h3>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={enableProctoring}
              onChange={(e) => setEnableProctoring(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600"
            />
            <span className="text-sm font-medium text-gray-700">Enable Proctoring</span>
          </label>
        </div>

        {enableProctoring && (
          <div className="grid grid-cols-2 gap-4">
            <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={webcamRequired}
                onChange={(e) => setWebcamRequired(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">Webcam Required</p>
                <p className="text-xs text-gray-500">Candidates must enable webcam</p>
              </div>
            </label>
            <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={screenRecording}
                onChange={(e) => setScreenRecording(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">Screen Recording</p>
                <p className="text-xs text-gray-500">Record candidate's screen</p>
              </div>
            </label>
            <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={fullscreenRequired}
                onChange={(e) => setFullscreenRequired(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">Fullscreen Mode</p>
                <p className="text-xs text-gray-500">Force fullscreen during test</p>
              </div>
            </label>
            <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={faceDetection}
                onChange={(e) => setFaceDetection(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">Face Detection</p>
                <p className="text-xs text-gray-500">Detect face presence and multiple faces</p>
              </div>
            </label>
            <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={tabSwitchDetection}
                onChange={(e) => setTabSwitchDetection(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">Tab Switch Detection</p>
                <p className="text-xs text-gray-500">Detect when candidate switches tabs</p>
              </div>
            </label>
          </div>
        )}
      </div>

      {/* Security Settings */}
      <div className="bg-white rounded-lg border p-6 space-y-6">
        <h3 className="font-medium text-gray-900 border-b pb-3 flex items-center gap-2">
          <Shield className="w-5 h-5 text-blue-600" />
          Security Settings
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="checkbox"
              checked={disableCopyPaste}
              onChange={(e) => setDisableCopyPaste(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600"
            />
            <div>
              <p className="text-sm font-medium text-gray-900">Disable Copy/Paste</p>
              <p className="text-xs text-gray-500">Prevent copying question text</p>
            </div>
          </label>
          <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="checkbox"
              checked={disableRightClick}
              onChange={(e) => setDisableRightClick(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600"
            />
            <div>
              <p className="text-sm font-medium text-gray-900">Disable Right Click</p>
              <p className="text-xs text-gray-500">Prevent context menu access</p>
            </div>
          </label>
          <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="checkbox"
              checked={shuffleQuestions}
              onChange={(e) => setShuffleQuestions(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600"
            />
            <div>
              <p className="text-sm font-medium text-gray-900">Shuffle Questions</p>
              <p className="text-xs text-gray-500">Randomize question order</p>
            </div>
          </label>
          <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="checkbox"
              checked={shuffleOptions}
              onChange={(e) => setShuffleOptions(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600"
            />
            <div>
              <p className="text-sm font-medium text-gray-900">Shuffle Options</p>
              <p className="text-xs text-gray-500">Randomize MCQ option order</p>
            </div>
          </label>
          <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="checkbox"
              checked={showOneQuestionAtTime}
              onChange={(e) => setShowOneQuestionAtTime(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600"
            />
            <div>
              <p className="text-sm font-medium text-gray-900">One Question at a Time</p>
              <p className="text-xs text-gray-500">Show questions sequentially</p>
            </div>
          </label>
          <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="checkbox"
              checked={preventBackNavigation}
              onChange={(e) => setPreventBackNavigation(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600"
            />
            <div>
              <p className="text-sm font-medium text-gray-900">Prevent Back Navigation</p>
              <p className="text-xs text-gray-500">No going back to previous questions</p>
            </div>
          </label>
        </div>
      </div>

      {/* Attempt & Score Settings */}
      <div className="bg-white rounded-lg border p-6 space-y-6">
        <h3 className="font-medium text-gray-900 border-b pb-3">Attempt & Score Settings</h3>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Maximum Attempts
            </label>
            <select
              value={maxAttempts}
              onChange={(e) => setMaxAttempts(parseInt(e.target.value))}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
            >
              <option value={1}>1 attempt</option>
              <option value={2}>2 attempts</option>
              <option value={3}>3 attempts</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Passing Score (%)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={passingScore}
              onChange={(e) => setPassingScore(parseInt(e.target.value))}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
            />
          </div>
        </div>
      </div>

      {/* Candidate Field Requirements */}
      <div className="bg-white rounded-lg border p-6 space-y-6">
        <h3 className="font-medium text-gray-900 border-b pb-3">
          Required Candidate Information
        </h3>
        <p className="text-sm text-gray-500">
          Select which fields are required when candidates register
        </p>

        <div className="grid grid-cols-2 gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={requirePhone}
              onChange={(e) => setRequirePhone(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600"
            />
            <span className="text-sm text-gray-700">Phone Number</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={requireResume}
              onChange={(e) => setRequireResume(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600"
            />
            <span className="text-sm text-gray-700">Resume Upload</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={requireLinkedIn}
              onChange={(e) => setRequireLinkedIn(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600"
            />
            <span className="text-sm text-gray-700">LinkedIn Profile</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={requireGitHub}
              onChange={(e) => setRequireGitHub(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600"
            />
            <span className="text-sm text-gray-700">GitHub Profile</span>
          </label>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-between pt-4 border-t">
        <button
          onClick={onPrev}
          className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
        >
          Previous
        </button>
        <button
          onClick={handleSave}
          disabled={!isValid || isSaving}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? "Saving..." : "Save & Continue"}
        </button>
      </div>
    </div>
  );
}
