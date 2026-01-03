"use client";

import { useState, useEffect } from "react";
import { X, Plus, Sparkles } from "lucide-react";
import { Assessment, SkillConfig } from "@/lib/api";

const JOB_DESIGNATIONS = [
  "SDE I (Entry Level)",
  "SDE II (Mid Level)",
  "SDE III (Senior)",
  "Staff Engineer",
  "Principal Engineer",
  "Engineering Manager",
  "Tech Lead",
];

const DEPARTMENTS = [
  "Engineering",
  "Product",
  "Data Science",
  "DevOps",
  "QA",
  "Security",
];

const SKILL_CATEGORIES = {
  Languages: ["JavaScript", "TypeScript", "Python", "Java", "Go", "Rust", "C++", "C#", "Ruby", "PHP", "Kotlin", "Swift"],
  Frameworks: ["React", "Next.js", "Vue.js", "Angular", "Node.js", "Express", "Django", "FastAPI", "Spring Boot", "Rails"],
  Databases: ["PostgreSQL", "MySQL", "MongoDB", "Redis", "DynamoDB", "Cassandra", "Elasticsearch"],
  Cloud: ["AWS", "GCP", "Azure", "Kubernetes", "Docker", "Terraform"],
  Concepts: ["Data Structures", "Algorithms", "System Design", "REST APIs", "GraphQL", "Microservices", "CI/CD"],
};

interface Step1Props {
  assessment: Assessment;
  onSave: (data: {
    title: string;
    job_designation: string;
    department?: string;
    experience_min: number;
    experience_max: number;
    include_freshers: boolean;
    skills: SkillConfig[];
    enable_skill_weights: boolean;
    description?: string;
  }) => Promise<Assessment>;
  onNext: () => void;
}

export default function Step1AssessmentDetails({ assessment, onSave, onNext }: Step1Props) {
  const [title, setTitle] = useState(assessment.title || "");
  const [jobDesignation, setJobDesignation] = useState(assessment.job_designation || "");
  const [customDesignation, setCustomDesignation] = useState("");
  const [department, setDepartment] = useState(assessment.department || "");
  const [experienceMin, setExperienceMin] = useState(assessment.experience_min || 0);
  const [experienceMax, setExperienceMax] = useState(assessment.experience_max || 10);
  const [includeFreshers, setIncludeFreshers] = useState(assessment.include_freshers || false);
  const [skills, setSkills] = useState<SkillConfig[]>(assessment.skills || []);
  const [enableSkillWeights, setEnableSkillWeights] = useState(assessment.enable_skill_weights || false);
  const [description, setDescription] = useState(assessment.description || "");
  const [skillSearch, setSkillSearch] = useState("");
  const [showSkillDropdown, setShowSkillDropdown] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const isCustomDesignation = !JOB_DESIGNATIONS.includes(jobDesignation) && jobDesignation !== "";

  const handleAddSkill = (skillName: string, category: string) => {
    if (!skills.find((s) => s.name === skillName)) {
      setSkills([
        ...skills,
        {
          id: `skill-${Date.now()}`,
          name: skillName,
          category,
          weight: enableSkillWeights ? 50 : undefined,
        },
      ]);
    }
    setSkillSearch("");
    setShowSkillDropdown(false);
  };

  const handleRemoveSkill = (skillId: string) => {
    setSkills(skills.filter((s) => s.id !== skillId));
  };

  const handleSkillWeightChange = (skillId: string, weight: number) => {
    setSkills(
      skills.map((s) => (s.id === skillId ? { ...s, weight } : s))
    );
  };

  const filteredSkills = Object.entries(SKILL_CATEGORIES).flatMap(([category, categorySkills]) =>
    categorySkills
      .filter(
        (skill) =>
          skill.toLowerCase().includes(skillSearch.toLowerCase()) &&
          !skills.find((s) => s.name === skill)
      )
      .map((skill) => ({ skill, category }))
  );

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({
        title,
        job_designation: isCustomDesignation ? customDesignation : jobDesignation,
        department: department || undefined,
        experience_min: experienceMin,
        experience_max: experienceMax,
        include_freshers: includeFreshers,
        skills,
        enable_skill_weights: enableSkillWeights,
        description: description || undefined,
      });
      onNext();
    } catch (error) {
      console.error("Failed to save step 1:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const isValid = title.trim() && (jobDesignation || customDesignation) && skills.length > 0;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-1">Assessment Details</h2>
        <p className="text-gray-500">Configure the basic information for this assessment</p>
      </div>

      {/* Basic Information */}
      <div className="bg-white rounded-lg border p-6 space-y-6">
        <h3 className="font-medium text-gray-900 border-b pb-3">Basic Information</h3>

        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Title of Assessment <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Senior Software Engineer Assessment"
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 placeholder-gray-400"
            maxLength={100}
          />
          <p className="text-xs text-gray-400 mt-1">{title.length}/100 characters</p>
        </div>

        {/* Job Designation & Department */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Job Designation <span className="text-red-500">*</span>
            </label>
            <select
              value={isCustomDesignation ? "custom" : jobDesignation}
              onChange={(e) => {
                if (e.target.value === "custom") {
                  setJobDesignation("");
                } else {
                  setJobDesignation(e.target.value);
                  setCustomDesignation("");
                }
              }}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 placeholder-gray-400"
            >
              <option value="">Select designation...</option>
              {JOB_DESIGNATIONS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
              <option value="custom">Custom...</option>
            </select>
            {(isCustomDesignation || jobDesignation === "") && (
              <input
                type="text"
                value={customDesignation}
                onChange={(e) => setCustomDesignation(e.target.value)}
                placeholder="Enter custom designation"
                className="w-full mt-2 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Department (Optional)
            </label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 placeholder-gray-400"
            >
              <option value="">Select department...</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Experience Requirements */}
      <div className="bg-white rounded-lg border p-6 space-y-6">
        <h3 className="font-medium text-gray-900 border-b pb-3">Experience Requirements</h3>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Experience Range (Years) <span className="text-red-500">*</span>
          </label>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <input
                type="range"
                min={0}
                max={15}
                value={experienceMin}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setExperienceMin(val);
                  if (val > experienceMax) setExperienceMax(val);
                }}
                className="w-full"
              />
            </div>
            <span className="text-sm text-gray-600 w-20 text-center">
              {experienceMin} - {experienceMax} years
            </span>
            <div className="flex-1">
              <input
                type="range"
                min={0}
                max={15}
                value={experienceMax}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setExperienceMax(val);
                  if (val < experienceMin) setExperienceMin(val);
                }}
                className="w-full"
              />
            </div>
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={includeFreshers}
            onChange={(e) => setIncludeFreshers(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">Include freshers (0 experience)</span>
        </label>
      </div>

      {/* Skills to Assess */}
      <div className="bg-white rounded-lg border p-6 space-y-6">
        <h3 className="font-medium text-gray-900 border-b pb-3">Skills to Assess</h3>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Select the technical skills you want to evaluate <span className="text-red-500">*</span>
          </label>

          {/* Search Input */}
          <div className="relative">
            <input
              type="text"
              value={skillSearch}
              onChange={(e) => {
                setSkillSearch(e.target.value);
                setShowSkillDropdown(true);
              }}
              onFocus={() => setShowSkillDropdown(true)}
              placeholder="Search skills..."
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 placeholder-gray-400"
            />
            {showSkillDropdown && skillSearch && filteredSkills.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-auto">
                {filteredSkills.slice(0, 10).map(({ skill, category }) => (
                  <button
                    key={skill}
                    onClick={() => handleAddSkill(skill, category)}
                    className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center justify-between"
                  >
                    <span>{skill}</span>
                    <span className="text-xs text-gray-400">{category}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selected Skills */}
          {skills.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {skills.map((skill) => (
                <span
                  key={skill.id}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm"
                >
                  {skill.name}
                  <button
                    onClick={() => handleRemoveSkill(skill.id)}
                    className="hover:text-blue-900"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-400 mt-2">
            Minimum 1 skill required, Maximum 15 skills
          </p>
        </div>

        {/* AI Suggestions */}
        {jobDesignation && (
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-900">AI-Suggested Skills</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {["PostgreSQL", "Redis", "Docker", "AWS", "TypeScript", "GraphQL", "REST APIs", "Git", "CI/CD"]
                .filter((s) => !skills.find((sk) => sk.name === s))
                .slice(0, 6)
                .map((skill) => (
                  <button
                    key={skill}
                    onClick={() => handleAddSkill(skill, "Suggested")}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-white border border-blue-200 text-blue-700 rounded-full text-sm hover:bg-blue-100"
                  >
                    <Plus className="w-3 h-3" />
                    {skill}
                  </button>
                ))}
            </div>
          </div>
        )}

        {/* Skill Weights */}
        <div>
          <label className="flex items-center gap-2 cursor-pointer mb-4">
            <input
              type="checkbox"
              checked={enableSkillWeights}
              onChange={(e) => setEnableSkillWeights(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Enable custom skill weights</span>
          </label>

          {enableSkillWeights && skills.length > 0 && (
            <div className="space-y-3 pl-6">
              {skills.map((skill) => (
                <div key={skill.id} className="flex items-center gap-4">
                  <span className="text-sm text-gray-700 w-32">{skill.name}</span>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    value={skill.weight || 50}
                    onChange={(e) => handleSkillWeightChange(skill.id, parseInt(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-sm text-gray-500 w-12">{skill.weight || 50}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Description */}
      <div className="bg-white rounded-lg border p-6 space-y-4">
        <h3 className="font-medium text-gray-900 border-b pb-3">Assessment Description (Optional)</h3>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the assessment objectives, expectations, and any special instructions for candidates..."
          rows={4}
          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-white text-gray-900 placeholder-gray-400"
          maxLength={2000}
        />
        <p className="text-xs text-gray-400">{description.length}/2000 characters</p>
      </div>

      {/* Actions */}
      <div className="flex justify-between pt-4 border-t">
        <button
          disabled
          className="px-4 py-2 text-gray-400 cursor-not-allowed"
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
