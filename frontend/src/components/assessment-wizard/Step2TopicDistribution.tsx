"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Sparkles, ChevronDown, ChevronUp, Loader2, GripVertical, Wand2, Eye, Check, X, AlertCircle, Zap } from "lucide-react";
import { Assessment, TopicConfig, DifficultyLevel, QuestionType, AssessmentQuestion } from "@/lib/api";
import { useAssessmentTopics, useAssessmentQuestions } from "@/hooks/useAssessments";

const QUESTION_TYPES: { value: QuestionType; label: string; description: string }[] = [
  { value: "mcq", label: "MCQ", description: "Multiple choice questions" },
  { value: "code", label: "Coding", description: "Write code solutions" },
  { value: "subjective", label: "Subjective", description: "Free-form text answers" },
];

const DIFFICULTY_LEVELS: { value: DifficultyLevel; label: string; color: string }[] = [
  { value: "easy", label: "Easy", color: "bg-green-100 text-green-700 border-green-300" },
  { value: "medium", label: "Medium", color: "bg-yellow-100 text-yellow-700 border-yellow-300" },
  { value: "hard", label: "Hard", color: "bg-red-100 text-red-700 border-red-300" },
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

interface GeneratedQuestion {
  id?: string;
  title?: string;
  problem_statement: string;
  question_type: QuestionType;
  difficulty: DifficultyLevel;
  options?: { id: string; text: string; is_correct?: boolean }[];
  topic_id: string;
  selected: boolean;
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
  const [generatingTopicId, setGeneratingTopicId] = useState<string | null>(null);
  const [generatedQuestions, setGeneratedQuestions] = useState<Record<string, GeneratedQuestion[]>>({});
  const [savingQuestions, setSavingQuestions] = useState(false);
  const [reviewingTopicId, setReviewingTopicId] = useState<string | null>(null);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [generationProgress, setGenerationProgress] = useState({ current: 0, total: 0, currentTopic: "" });

  const { suggestTopics, isSuggesting } = useAssessmentTopics(assessmentId);
  const { questions: existingQuestions, generateQuestions, createQuestion, isGenerating, refetch: refetchQuestions } = useAssessmentQuestions(assessmentId);

  // Helper to extract short title from generated question
  const extractTitle = (q: any): string => {
    // If title exists and is short (less than 60 chars), use it
    if (q.title && q.title.length < 60) {
      return q.title;
    }
    // Otherwise, extract a short title from problem_statement or question_text
    const text = q.problem_statement || q.question_text || "";
    // Take first sentence or first 50 chars
    const firstSentence = text.split(/[.?!]/)[0];
    if (firstSentence.length <= 60) {
      return firstSentence.trim();
    }
    return text.substring(0, 50).trim() + "...";
  };

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
    // Also remove any generated questions for this topic
    setGeneratedQuestions((prev) => {
      const newState = { ...prev };
      delete newState[topicId];
      return newState;
    });
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
        const newTopics: TopicRowState[] = result.topics.map((t: any) => ({
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

  const handleGenerateQuestions = async (topic: TopicRowState, autoSave: boolean = false) => {
    setGeneratingTopicId(topic.id);
    try {
      const allQuestions: GeneratedQuestion[] = [];

      // Generate questions for each selected question type
      for (const qType of topic.question_types) {
        const countPerType = Math.ceil(topic.question_count / topic.question_types.length);

        const result = await generateQuestions({
          topic_id: topic.id,
          question_type: qType as QuestionType,
          difficulty: topic.difficulty_level,
          count: countPerType,
        });

        if (result?.questions) {
          const questionsWithSelection = result.questions.map((q: any) => ({
            ...q,
            title: extractTitle(q),
            question_type: qType as QuestionType,
            difficulty: topic.difficulty_level,
            topic_id: topic.id,
            selected: true,
          }));
          allQuestions.push(...questionsWithSelection);
        }
      }

      if (autoSave && allQuestions.length > 0) {
        // Auto-save all questions without review
        for (const q of allQuestions) {
          await createQuestion({
            topic_id: topic.id,
            question_type: q.question_type,
            difficulty: q.difficulty,
            title: q.title || extractTitle(q),
            problem_statement: q.problem_statement,
            options: q.options,
            max_marks: q.question_type === "code" ? 20 : 10,
            estimated_time_minutes: q.question_type === "code" ? 15 : 5,
          });
        }
        refetchQuestions();
      } else {
        setGeneratedQuestions((prev) => ({
          ...prev,
          [topic.id]: allQuestions,
        }));
        // Auto-expand to show review
        setReviewingTopicId(topic.id);
      }
    } catch (error) {
      console.error("Failed to generate questions:", error);
    } finally {
      setGeneratingTopicId(null);
    }
  };

  const handleGenerateAllQuestions = async () => {
    // Filter topics that need questions generated
    const topicsToGenerate = topics.filter(t => {
      const existingCount = getQuestionsForTopic(t.id).length;
      return t.topic && t.question_types.length > 0 && existingCount < t.question_count;
    });

    if (topicsToGenerate.length === 0) {
      return;
    }

    setIsGeneratingAll(true);
    setGenerationProgress({ current: 0, total: topicsToGenerate.length, currentTopic: "Saving topics..." });

    try {
      // First, save all topics to the database to get proper database IDs
      const topicConfigs: TopicConfig[] = topics.map((t) => {
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
          max_score: t.question_count * 10,
        };
      });

      // Save topics and get the updated assessment with database IDs
      const updatedAssessment = await onSave({
        topics: topicConfigs,
        enable_ai_generation: enableAIGeneration,
      });

      // Map local topic names to database IDs
      const topicNameToDbId: Record<string, string> = {};
      if (updatedAssessment?.topics) {
        for (const dbTopic of updatedAssessment.topics) {
          topicNameToDbId[dbTopic.topic] = dbTopic.id;
        }
      }

      // Update local topics with database IDs
      setTopics(prev => prev.map(t => ({
        ...t,
        id: topicNameToDbId[t.topic] || t.id,
      })));

      // Filter again with updated IDs
      const topicsWithDbIds = topicsToGenerate.map(t => ({
        ...t,
        id: topicNameToDbId[t.topic] || t.id,
      }));

      for (let i = 0; i < topicsWithDbIds.length; i++) {
        const topic = topicsWithDbIds[i];
        setGenerationProgress({ current: i + 1, total: topicsWithDbIds.length, currentTopic: topic.topic });

        // Generate and auto-save for each topic using database ID
        await handleGenerateQuestions(topic, true);
      }
    } catch (error) {
      console.error("Failed to generate all questions:", error);
    } finally {
      setIsGeneratingAll(false);
      setGenerationProgress({ current: 0, total: 0, currentTopic: "" });
      refetchQuestions();
    }
  };

  const handleToggleQuestionSelection = (topicId: string, questionIndex: number) => {
    setGeneratedQuestions((prev) => ({
      ...prev,
      [topicId]: prev[topicId].map((q, idx) =>
        idx === questionIndex ? { ...q, selected: !q.selected } : q
      ),
    }));
  };

  const handleSaveGeneratedQuestions = async (topicId: string) => {
    setSavingQuestions(true);
    try {
      const questionsToSave = generatedQuestions[topicId]?.filter((q) => q.selected) || [];

      for (const q of questionsToSave) {
        await createQuestion({
          topic_id: topicId,
          question_type: q.question_type,
          difficulty: q.difficulty,
          title: q.title || extractTitle(q),
          problem_statement: q.problem_statement,
          options: q.options,
          max_marks: q.question_type === "code" ? 20 : 10,
          estimated_time_minutes: q.question_type === "code" ? 15 : 5,
        });
      }

      // Clear generated questions for this topic after saving
      setGeneratedQuestions((prev) => {
        const newState = { ...prev };
        delete newState[topicId];
        return newState;
      });
      setReviewingTopicId(null);

      // Refetch to show saved questions
      refetchQuestions();
    } catch (error) {
      console.error("Failed to save questions:", error);
    } finally {
      setSavingQuestions(false);
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

  const getQuestionsForTopic = (topicId: string) => {
    return existingQuestions?.filter((q) => q.topic_id === topicId) || [];
  };

  const totalQuestions = topics.reduce((sum, t) => sum + (t.question_count || 0), 0);
  const totalDuration = topics.reduce((sum, t) => sum + (t.duration_minutes || 0), 0);
  const totalGeneratedQuestions = existingQuestions?.length || 0;
  const isValid = topics.length > 0 && topics.every((t) => t.topic && t.question_types.length > 0);
  const hasAllQuestionsGenerated = totalGeneratedQuestions >= totalQuestions;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-1">Topic Distribution</h2>
        <p className="text-gray-500">Configure topics and generate questions for the assessment</p>
      </div>

      {/* Summary Bar */}
      <div className="bg-blue-50 rounded-lg p-4 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <div>
            <p className="text-xs text-blue-600 font-medium">Total Topics</p>
            <p className="text-2xl font-bold text-blue-900">{topics.length}</p>
          </div>
          <div>
            <p className="text-xs text-blue-600 font-medium">Configured Questions</p>
            <p className="text-2xl font-bold text-blue-900">{totalQuestions}</p>
          </div>
          <div>
            <p className="text-xs text-blue-600 font-medium">Generated Questions</p>
            <p className={`text-2xl font-bold ${totalGeneratedQuestions >= totalQuestions ? 'text-green-600' : 'text-orange-600'}`}>
              {totalGeneratedQuestions}
            </p>
          </div>
          <div>
            <p className="text-xs text-blue-600 font-medium">Est. Duration</p>
            <p className="text-2xl font-bold text-blue-900">{totalDuration} min</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
          <button
            onClick={handleGenerateAllQuestions}
            disabled={isGeneratingAll || topics.length === 0 || !topics.some(t => t.topic && t.question_types.length > 0)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
          >
            {isGeneratingAll ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                Generate All Questions
              </>
            )}
          </button>
        </div>
      </div>

      {/* Generation Progress */}
      {isGeneratingAll && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="font-medium text-purple-800">Generating Questions...</p>
            <span className="text-sm text-purple-600">
              {generationProgress.current} / {generationProgress.total} topics
            </span>
          </div>
          <div className="w-full bg-purple-200 rounded-full h-2 mb-2">
            <div
              className="bg-purple-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(generationProgress.current / generationProgress.total) * 100}%` }}
            />
          </div>
          {generationProgress.currentTopic && (
            <p className="text-sm text-purple-600">
              Currently generating: {generationProgress.currentTopic}
            </p>
          )}
        </div>
      )}

      {/* Warning if questions not generated */}
      {topics.length > 0 && totalGeneratedQuestions === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-yellow-800">Questions Required</p>
            <p className="text-sm text-yellow-700 mt-1">
              You must generate questions for each topic before publishing the assessment.
              Click the &quot;Generate Questions&quot; button on each topic below.
            </p>
          </div>
        </div>
      )}

      {/* Topics List */}
      <div className="space-y-4">
        {topics.map((topic, index) => {
          const topicQuestions = getQuestionsForTopic(topic.id);
          const pendingQuestions = generatedQuestions[topic.id] || [];
          const isReviewing = reviewingTopicId === topic.id;

          return (
            <div
              key={topic.id}
              className="bg-white rounded-lg border shadow-sm"
            >
              {/* Topic Header */}
              <div className="p-4 flex items-center gap-4">
                <GripVertical className="w-5 h-5 text-gray-400 cursor-grab" />
                <span className="text-sm font-medium text-gray-500 w-6">{index + 1}</span>
                <input
                  type="text"
                  value={topic.topic}
                  onChange={(e) => handleTopicChange(topic.id, "topic", e.target.value)}
                  placeholder="Topic name (e.g., Data Structures, React Hooks)"
                  className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 placeholder-gray-400"
                />
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-600">{topic.question_count} Q</span>
                  <span className="text-gray-400">|</span>
                  <span className="text-gray-600">{topic.duration_minutes} min</span>
                  {topicQuestions.length > 0 && (
                    <>
                      <span className="text-gray-400">|</span>
                      <span className="text-green-600 font-medium">{topicQuestions.length} generated</span>
                    </>
                  )}
                </div>
                <button
                  onClick={() => handleToggleExpand(topic.id)}
                  className="p-2 hover:bg-gray-100 rounded"
                >
                  {topic.isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-gray-500" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-500" />
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
                      {QUESTION_TYPES.map((qt) => {
                        const isSelected = topic.question_types?.includes(qt.value);
                        return (
                          <label
                            key={qt.value}
                            className={`flex items-center gap-2 px-4 py-2 border rounded-lg cursor-pointer transition-colors ${
                              isSelected
                                ? "border-blue-500 bg-blue-50 text-blue-700"
                                : "border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleQuestionType(topic.id, qt.value)}
                              className="hidden"
                            />
                            <span className="text-sm font-medium">{qt.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Difficulty Level */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Difficulty Level
                    </label>
                    <div className="flex gap-3">
                      {DIFFICULTY_LEVELS.map((level) => {
                        const isSelected = topic.difficulty_level === level.value;
                        return (
                          <button
                            key={level.value}
                            type="button"
                            onClick={() => handleDifficultyLevelChange(topic.id, level.value)}
                            className={`px-4 py-2 rounded-lg border transition-colors ${
                              isSelected
                                ? `${level.color} border-current font-medium`
                                : "border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50"
                            }`}
                          >
                            <span className="text-sm font-medium">{level.label}</span>
                          </button>
                        );
                      })}
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
                        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
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
                        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                      />
                    </div>
                  </div>

                  {/* Generate Questions Section */}
                  <div className="border-t pt-4 mt-4">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h4 className="font-medium text-gray-900">Questions</h4>
                        <p className="text-sm text-gray-500">
                          {topicQuestions.length} questions generated for this topic
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {topicQuestions.length > 0 && (
                          <button
                            onClick={() => setReviewingTopicId(isReviewing ? null : topic.id)}
                            className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                          >
                            <Eye className="w-4 h-4" />
                            {isReviewing ? "Hide" : "View"} Questions
                          </button>
                        )}
                        <button
                          onClick={() => handleGenerateQuestions(topic)}
                          disabled={generatingTopicId === topic.id || !topic.topic || topic.question_types.length === 0}
                          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {generatingTopicId === topic.id ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Generating...
                            </>
                          ) : (
                            <>
                              <Wand2 className="w-4 h-4" />
                              Generate Questions
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Existing Questions Preview */}
                    {isReviewing && topicQuestions.length > 0 && (
                      <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                        <h5 className="text-sm font-medium text-gray-700 mb-2">Saved Questions</h5>
                        {topicQuestions.map((q, idx) => (
                          <div key={q.id} className="bg-white p-3 rounded border">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-medium text-gray-500">#{idx + 1}</span>
                                  <span className={`text-xs px-2 py-0.5 rounded ${
                                    q.question_type === 'mcq' ? 'bg-blue-100 text-blue-700' :
                                    q.question_type === 'code' ? 'bg-purple-100 text-purple-700' :
                                    'bg-gray-100 text-gray-700'
                                  }`}>
                                    {q.question_type.toUpperCase()}
                                  </span>
                                  <span className={`text-xs px-2 py-0.5 rounded ${
                                    q.difficulty === 'easy' ? 'bg-green-100 text-green-700' :
                                    q.difficulty === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                                    'bg-red-100 text-red-700'
                                  }`}>
                                    {q.difficulty}
                                  </span>
                                </div>
                                <p className="text-sm font-medium text-gray-900">
                                  {q.title && q.title.length < 60 ? q.title : extractTitle(q)}
                                </p>
                                {q.problem_statement && (
                                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                                    {q.problem_statement.substring(0, 120)}...
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Pending Generated Questions for Review */}
                    {pendingQuestions.length > 0 && (
                      <div className="bg-purple-50 rounded-lg p-4 space-y-3 mt-4">
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="text-sm font-medium text-purple-800">
                            Review Generated Questions ({pendingQuestions.filter(q => q.selected).length}/{pendingQuestions.length} selected)
                          </h5>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setGeneratedQuestions(prev => ({
                                ...prev,
                                [topic.id]: []
                              }))}
                              className="text-sm text-gray-600 hover:text-gray-800"
                            >
                              Discard All
                            </button>
                            <button
                              onClick={() => handleSaveGeneratedQuestions(topic.id)}
                              disabled={savingQuestions || pendingQuestions.filter(q => q.selected).length === 0}
                              className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50"
                            >
                              {savingQuestions ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Check className="w-3 h-3" />
                              )}
                              Save Selected
                            </button>
                          </div>
                        </div>

                        {pendingQuestions.map((q, idx) => (
                          <div
                            key={idx}
                            className={`bg-white p-3 rounded border cursor-pointer transition-colors ${
                              q.selected ? 'border-purple-300 ring-1 ring-purple-200' : 'border-gray-200 opacity-60'
                            }`}
                            onClick={() => handleToggleQuestionSelection(topic.id, idx)}
                          >
                            <div className="flex items-start gap-3">
                              <div className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center mt-0.5 ${
                                q.selected ? 'bg-purple-600 border-purple-600' : 'border-gray-300'
                              }`}>
                                {q.selected && <Check className="w-3 h-3 text-white" />}
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={`text-xs px-2 py-0.5 rounded ${
                                    q.question_type === 'mcq' ? 'bg-blue-100 text-blue-700' :
                                    q.question_type === 'code' ? 'bg-purple-100 text-purple-700' :
                                    'bg-gray-100 text-gray-700'
                                  }`}>
                                    {q.question_type.toUpperCase()}
                                  </span>
                                  <span className="text-sm font-medium text-gray-900">
                                    {q.title || extractTitle(q)}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-600 mt-1">
                                  {q.problem_statement?.substring(0, 150)}
                                  {q.problem_statement && q.problem_statement.length > 150 && '...'}
                                </p>
                                {q.options && q.options.length > 0 && (
                                  <div className="mt-2 space-y-1">
                                    {q.options.map((opt, optIdx) => (
                                      <div key={optIdx} className={`text-xs px-2 py-1 rounded ${
                                        opt.is_correct ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-600'
                                      }`}>
                                        {opt.id}. {opt.text}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Add Topic Button */}
        <button
          onClick={handleAddTopic}
          className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-500 hover:text-blue-600 flex items-center justify-center gap-2"
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
        <div className="flex items-center gap-3">
          {!hasAllQuestionsGenerated && totalQuestions > 0 && (
            <span className="text-sm text-orange-600">
              Generate questions before continuing
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={!isValid || isSaving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? "Saving..." : "Save & Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
