"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Sparkles, ChevronDown, ChevronUp, Loader2, GripVertical } from "lucide-react";
import { Assessment, TopicConfig, DifficultyLevel, QuestionType } from "@/lib/api";
import { useAssessmentTopics } from "@/hooks/useAssessments";

const QUESTION_TYPES: { value: QuestionType; label: string; description: string }[] = [
  { value: "mcq", label: "MCQ", description: "Multiple choice questions" },
  { value: "code", label: "Coding", description: "Write code solutions" },
  { value: "subjective", label: "Subjective", description: "Free-form text answers" },
];

const DIFFICULTY_LEVELS: { value: DifficultyLevel; label: string; color: string }[] = [
  { value: "easy", label: "Easy", color: "bg-green-100 text-green-700" },
  { value: "medium", label: "Medium", color: "bg-yellow-100 text-yellow-700" },
  { value: "hard", label: "Hard", color: "bg-red-100 text-red-700" },
];

interface Step2Props {
  assessment: Assessment;
  assessmentId: string;
  organizationId: string;
  onSave: (data: { topics: TopicConfig[]; enable_ai_generation?: boolean }) => Promise<Assessment>;
  onNext: () => void;
  onPrev: () => void;
}

interface TopicRowState {
  id: string;
  topic: string;
  subtopics: string[];
  difficulty_level: DifficultyLevel;
  question_types: string[];
  question_count: number;
  duration_minutes: number;
  isExpanded: boolean;
}

export default function Step2TopicDistribution({
  assessment,
  assessmentId,
  organizationId,
  onSave,
  onNext,
  onPrev,
}: Step2Props) {
  const [topics, setTopics] = useState<TopicRowState[]>([]);
  const [enableAIGeneration, setEnableAIGeneration] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuggestModal, setShowSuggestModal] = useState(false);

  const { suggestTopics, isSuggesting, suggestedTopics } = useAssessmentTopics(assessmentId);

  useEffect(() => {
    if (assessment.topics && assessment.topics.length > 0) {
      setTopics(
        assessment.topics.map((t) => ({
          id: t.id || crypto.randomUUID(),
          topic: t.topic,
          subtopics: t.subtopics || [],
          difficulty_level: t.difficulty_level || "medium",
          question_types: Array.isArray(t.question_types)
            ? t.question_types
            : Object.entries(t.question_types || {})
                .filter(([_, v]) => (v as number) > 0)
                .map(([k]) => k),
          question_count: typeof t.question_types === 'object' && !Array.isArray(t.question_types)
            ? Object.values(t.question_types || {}).reduce((a, b) => (a as number) + (b as number), 0) as number
            : 5,
          duration_minutes: t.estimated_time_minutes || 10,
          isExpanded: false,
        }))
      );
    }
  }, [assessment.topics]);

  const handleAddTopic = () => {
    const newTopic: TopicRowState = {
      id: crypto.randomUUID(),
      topic: "",
      subtopics: [],
      difficulty_level: "medium",
      question_types: ["mcq"],
      question_count: 5,
      duration_minutes: 10,
      isExpanded: true,
    };
    setTopics([...topics, newTopic]);
  };

  const handleRemoveTopic = (topicId: string) => {
    setTopics(topics.filter((t) => t.id !== topicId));
  };

  const handleTopicChange = (topicId: string, field: keyof TopicRowState, value: any) => {
    setTopics(
      topics.map((t) => (t.id === topicId ? { ...t, [field]: value } : t))
    );
  };

  const handleToggleExpand = (topicId: string) => {
    setTopics(
      topics.map((t) => (t.id === topicId ? { ...t, isExpanded: !t.isExpanded } : t))
    );
  };

  const handleToggleQuestionType = (topicId: string, qType: QuestionType) => {
    setTopics(
      topics.map((t) => {
        if (t.id !== topicId) return t;
        const current = t.question_types || [];
        if (current.includes(qType)) {
          return { ...t, question_types: current.filter((qt) => qt !== qType) };
        } else {
          return { ...t, question_types: [...current, qType] };
        }
      })
    );
  };

  const handleDifficultyLevelChange = (topicId: string, level: DifficultyLevel) => {
    setTopics(
      topics.map((t) => (t.id === topicId ? { ...t, difficulty_level: level } : t))
    );
  };

  const handleSuggestTopics = async () => {
    if (!assessment.skills || assessment.skills.length === 0) return;

    try {
      const result = await suggestTopics({
        skills: assessment.skills.map((s) => s.name),
        job_designation: assessment.job_designation || "",
        experience_level:
          assessment.experience_min !== undefined
            ? assessment.experience_min < 2
              ? "junior"
              : assessment.experience_min < 5
              ? "mid"
              : "senior"
            : "mid",
        count: 5,
      });

      if (result?.topics) {
        const newTopics: TopicRowState[] = result.topics.map((t: any, idx: number) => ({
          id: crypto.randomUUID(),
          topic: t.topic,
          subtopics: t.subtopics || [],
          difficulty_level: t.difficulty_level || "medium",
          question_types: Array.isArray(t.question_types)
            ? t.question_types
            : Object.entries(t.question_types || {})
                .filter(([_, v]) => (v as number) > 0)
                .map(([k]) => k),
          question_count: typeof t.question_types === 'object' && !Array.isArray(t.question_types)
            ? Object.values(t.question_types || {}).reduce((a, b) => (a as number) + (b as number), 0) as number
            : 5,
          duration_minutes: t.estimated_time_minutes || 10,
          isExpanded: false,
        }));
        setTopics([...topics, ...newTopics]);
      }
    } catch (error) {
      console.error("Failed to suggest topics:", error);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Convert TopicRowState to TopicConfig
      const topicConfigs: TopicConfig[] = topics.map((t) => {
        // Build question_types object from array
        const questionTypesObj = {
          code: t.question_types.includes("code") ? Math.ceil(t.question_count / t.question_types.length) : 0,
          mcq: t.question_types.includes("mcq") ? Math.ceil(t.question_count / t.question_types.length) : 0,
          subjective: t.question_types.includes("subjective") ? Math.ceil(t.question_count / t.question_types.length) : 0,
          pseudo_code: t.question_types.includes("pseudo_code") ? Math.ceil(t.question_count / t.question_types.length) : 0,
        };

        return {
          id: t.id,
          topic: t.topic,
          subtopics: t.subtopics,
          difficulty_level: t.difficulty_level,
          question_types: questionTypesObj,
          estimated_time_minutes: t.duration_minutes,
          max_score: t.question_count * 10, // 10 points per question
        };
      });

      await onSave({
        topics: topicConfigs,
        enable_ai_generation: enableAIGeneration,
      });
      onNext();
    } catch (error) {
      console.error("Failed to save step 2:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const totalQuestions = topics.reduce((sum, t) => sum + (t.question_count || 0), 0);
  const totalDuration = topics.reduce((sum, t) => sum + (t.duration_minutes || 0), 0);
  const isValid = topics.length > 0 && topics.every((t) => t.topic && t.question_types.length > 0);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-1">Topic Distribution</h2>
        <p className="text-gray-500">Configure topics and question distribution for the assessment</p>
      </div>

      {/* Summary Bar */}
      <div className="bg-blue-50 rounded-lg p-4 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <div>
            <p className="text-xs text-blue-600 font-medium">Total Topics</p>
            <p className="text-2xl font-bold text-blue-900">{topics.length}</p>
          </div>
          <div>
            <p className="text-xs text-blue-600 font-medium">Total Questions</p>
            <p className="text-2xl font-bold text-blue-900">{totalQuestions}</p>
          </div>
          <div>
            <p className="text-xs text-blue-600 font-medium">Est. Duration</p>
            <p className="text-2xl font-bold text-blue-900">{totalDuration} min</p>
          </div>
        </div>
        <button
          onClick={handleSuggestTopics}
          disabled={isSuggesting || !assessment.skills?.length}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {isSuggesting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          AI Suggest Topics
        </button>
      </div>

      {/* Topics List */}
      <div className="space-y-4">
        {topics.map((topic, index) => (
          <div
            key={topic.id}
            className="bg-white rounded-lg border shadow-sm"
          >
            {/* Topic Header */}
            <div className="p-4 flex items-center gap-4">
              <GripVertical className="w-5 h-5 text-gray-400 cursor-grab" />
              <span className="text-sm font-medium text-gray-400 w-6">{index + 1}</span>
              <input
                type="text"
                value={topic.topic}
                onChange={(e) => handleTopicChange(topic.id, "topic", e.target.value)}
                placeholder="Topic name (e.g., Data Structures, React Hooks)"
                className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 placeholder-gray-400"
              />
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span>{topic.question_count} Q</span>
                <span>|</span>
                <span>{topic.duration_minutes} min</span>
              </div>
              <button
                onClick={() => handleToggleExpand(topic.id)}
                className="p-2 hover:bg-gray-100 rounded"
              >
                {topic.isExpanded ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </button>
              <button
                onClick={() => handleRemoveTopic(topic.id)}
                className="p-2 hover:bg-red-50 rounded text-gray-400 hover:text-red-600"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>

            {/* Topic Details (Expanded) */}
            {topic.isExpanded && (
              <div className="px-4 pb-4 border-t pt-4 space-y-6">
                {/* Subtopics */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Subtopics (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={topic.subtopics?.join(", ") || ""}
                    onChange={(e) =>
                      handleTopicChange(
                        topic.id,
                        "subtopics",
                        e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                      )
                    }
                    placeholder="Arrays, Linked Lists, Trees, Graphs"
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 placeholder-gray-400"
                  />
                </div>

                {/* Question Types */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Question Types
                  </label>
                  <div className="flex gap-3">
                    {QUESTION_TYPES.map((qt) => (
                      <label
                        key={qt.value}
                        className={`flex items-center gap-2 px-4 py-2 border rounded-lg cursor-pointer transition-colors ${
                          topic.question_types?.includes(qt.value)
                            ? "border-blue-500 bg-blue-50"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={topic.question_types?.includes(qt.value) || false}
                          onChange={() => handleToggleQuestionType(topic.id, qt.value)}
                          className="hidden"
                        />
                        <span className="text-sm font-medium">{qt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Difficulty Level */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Difficulty Level
                  </label>
                  <div className="flex gap-3">
                    {DIFFICULTY_LEVELS.map((level) => (
                      <button
                        key={level.value}
                        type="button"
                        onClick={() => handleDifficultyLevelChange(topic.id, level.value)}
                        className={`px-4 py-2 rounded-lg border transition-colors ${
                          topic.difficulty_level === level.value
                            ? "border-blue-500 bg-blue-50 text-blue-700"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <span className={`text-sm font-medium`}>{level.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Question Count & Duration */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Number of Questions
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={topic.question_count || 5}
                      onChange={(e) =>
                        handleTopicChange(topic.id, "question_count", parseInt(e.target.value))
                      }
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 placeholder-gray-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Duration (minutes)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={180}
                      value={topic.duration_minutes || 10}
                      onChange={(e) =>
                        handleTopicChange(topic.id, "duration_minutes", parseInt(e.target.value))
                      }
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 placeholder-gray-400"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Add Topic Button */}
        <button
          onClick={handleAddTopic}
          className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-blue-500 hover:text-blue-600 flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Add Topic
        </button>
      </div>

      {/* AI Generation Toggle */}
      <div className="bg-white rounded-lg border p-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={enableAIGeneration}
            onChange={(e) => setEnableAIGeneration(e.target.checked)}
            className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <div>
            <p className="font-medium text-gray-900">Enable AI Question Generation</p>
            <p className="text-sm text-gray-500">
              Let AI generate questions based on topics and difficulty settings
            </p>
          </div>
        </label>
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
