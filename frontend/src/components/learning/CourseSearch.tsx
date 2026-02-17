"use client";

import { useState, useCallback } from "react";
import { Search, BookOpen, Loader2, X, Play } from "lucide-react";
import { courseApi, ExternalCourse } from "@/lib/api";
import { CourseCard } from "./CourseCard";

interface CourseSearchProps {
  onImportCourse?: (course: ExternalCourse) => Promise<unknown>;
  suggestedSkills?: string[];
  learningPathId?: string;
  milestoneId?: string;
}

const providerOptions = [
  { id: "youtube", label: "YouTube", icon: Play },
  // { id: "coursera", label: "Coursera", icon: BookOpen },
  // { id: "udemy", label: "Udemy", icon: BookOpen },
];

export function CourseSearch({
  onImportCourse,
  suggestedSkills = [],
  learningPathId: _learningPathId,
  milestoneId: _milestoneId,
}: CourseSearchProps) {
  // These props are passed through for future use but not currently needed
  void _learningPathId;
  void _milestoneId;
  const [query, setQuery] = useState("");
  const [selectedProviders, setSelectedProviders] = useState<string[]>(["youtube"]);
  const [courses, setCourses] = useState<ExternalCourse[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [importingCourseId, setImportingCourseId] = useState<string | null>(null);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;

    setIsSearching(true);
    setHasSearched(true);

    try {
      const response = await courseApi.searchCourses(
        query,
        selectedProviders.join(","),
        10
      );
      setCourses(response.courses);
    } catch (error) {
      console.error("Failed to search courses:", error);
      setCourses([]);
    } finally {
      setIsSearching(false);
    }
  }, [query, selectedProviders]);

  const handleSuggestedSkillClick = (skill: string) => {
    setQuery(skill);
    // Auto-search after setting the skill
    setTimeout(async () => {
      setIsSearching(true);
      setHasSearched(true);
      try {
        const response = await courseApi.searchCourses(skill, selectedProviders.join(","), 10);
        setCourses(response.courses);
      } catch (error) {
        console.error("Failed to search courses:", error);
        setCourses([]);
      } finally {
        setIsSearching(false);
      }
    }, 0);
  };

  const handleImport = async (course: ExternalCourse) => {
    if (!onImportCourse) return;
    setImportingCourseId(course.external_id);
    try {
      await onImportCourse(course);
    } finally {
      setImportingCourseId(null);
    }
  };

  const toggleProvider = (providerId: string) => {
    if (selectedProviders.includes(providerId)) {
      if (selectedProviders.length > 1) {
        setSelectedProviders(selectedProviders.filter((p) => p !== providerId));
      }
    } else {
      setSelectedProviders([...selectedProviders, providerId]);
    }
  };

  const clearSearch = () => {
    setQuery("");
    setCourses([]);
    setHasSearched(false);
  };

  return (
    <div className="space-y-4">
      {/* Search input */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search for courses... (e.g., React, Python, Docker)"
            className="w-full pl-9 pr-9 py-2 bg-muted border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {query && (
            <button
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          onClick={handleSearch}
          disabled={isSearching || !query.trim()}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isSearching ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching
            </>
          ) : (
            <>
              <Search className="h-4 w-4" />
              Search
            </>
          )}
        </button>
      </div>

      {/* Provider filters */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Providers:</span>
        {providerOptions.map((provider) => {
          const Icon = provider.icon;
          const isSelected = selectedProviders.includes(provider.id);
          return (
            <button
              key={provider.id}
              onClick={() => toggleProvider(provider.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition ${
                isSelected
                  ? "bg-blue-600 text-white"
                  : "bg-muted text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              <Icon className="h-4 w-4" />
              {provider.label}
            </button>
          );
        })}
      </div>

      {/* Suggested skills */}
      {suggestedSkills.length > 0 && !hasSearched && (
        <div>
          <p className="text-sm text-muted-foreground mb-2">Suggested skills from your path:</p>
          <div className="flex flex-wrap gap-2">
            {suggestedSkills.map((skill) => (
              <button
                key={skill}
                onClick={() => handleSuggestedSkillClick(skill)}
                className="px-3 py-1.5 bg-accent hover:bg-muted text-foreground rounded-lg text-sm transition"
              >
                {skill}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {isSearching ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      ) : hasSearched ? (
        courses.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {courses.map((course) => (
              <CourseCard
                key={`${course.provider}-${course.external_id}`}
                course={course}
                onImport={onImportCourse ? () => handleImport(course) : undefined}
                isImporting={importingCourseId === course.external_id}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <BookOpen className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
            <p>No courses found for "{query}"</p>
            <p className="text-sm">Try a different search term or provider</p>
          </div>
        )
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <Search className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
          <p>Search for courses to add to your learning activities</p>
        </div>
      )}
    </div>
  );
}
