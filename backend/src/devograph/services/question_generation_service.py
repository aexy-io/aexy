"""Service for AI-powered question generation for assessments."""

import json
import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from devograph.llm.gateway import get_llm_gateway
from devograph.llm.prompts import (
    TOPIC_SUGGESTION_SYSTEM_PROMPT,
    TOPIC_SUGGESTION_PROMPT,
    CODE_QUESTION_SYSTEM_PROMPT,
    CODE_QUESTION_PROMPT,
    MCQ_QUESTION_SYSTEM_PROMPT,
    MCQ_QUESTION_PROMPT,
    SUBJECTIVE_QUESTION_SYSTEM_PROMPT,
    SUBJECTIVE_QUESTION_PROMPT,
)
from devograph.models.assessment import Question, DifficultyLevel, QuestionType
from devograph.schemas.assessment import TopicSuggestionResponse

logger = logging.getLogger(__name__)


class QuestionGenerationService:
    """Service for generating assessment questions using AI."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.gateway = get_llm_gateway()

    async def _call_llm(
        self,
        system_prompt: str,
        user_prompt: str,
    ) -> dict[str, Any] | None:
        """Call LLM with prompts and parse JSON response.

        Args:
            system_prompt: System prompt for the LLM.
            user_prompt: User prompt with the actual request.

        Returns:
            Parsed JSON response or None if failed.
        """
        if not self.gateway:
            logger.warning("LLM gateway not available for question generation")
            return None

        try:
            # Use the provider directly for custom prompts
            provider = self.gateway.provider

            # Call _call_api with system_prompt and user_prompt
            # Returns tuple of (response_text, total_tokens, input_tokens, output_tokens)
            result = await provider._call_api(system_prompt, user_prompt)
            response_text = result[0] if isinstance(result, tuple) else result

            # Parse JSON response - try to extract JSON from the response
            try:
                # Try direct parse first
                return json.loads(response_text)
            except json.JSONDecodeError:
                # Try to find JSON in the response (strip markdown code blocks)
                text = response_text.strip()
                if text.startswith("```json"):
                    text = text[7:]
                elif text.startswith("```"):
                    text = text[3:]
                if text.endswith("```"):
                    text = text[:-3]
                text = text.strip()

                try:
                    return json.loads(text)
                except json.JSONDecodeError:
                    # Try to find JSON object in the text
                    start = text.find('{')
                    end = text.rfind('}') + 1
                    if start >= 0 and end > start:
                        return json.loads(text[start:end])

                logger.error(f"Failed to parse JSON from response: {response_text[:200]}")
                return None

        except Exception as e:
            logger.error(f"LLM call failed: {e}")
            return None

    async def suggest_topics(
        self,
        skills: list[str],
        job_designation: str,
        experience_level: str = "mid",
        count: int = 5,
    ) -> TopicSuggestionResponse | None:
        """Suggest assessment topics based on job requirements.

        Args:
            skills: List of required skills.
            job_designation: Job title/designation.
            experience_level: junior, mid, or senior.
            count: Number of topics to suggest.

        Returns:
            Suggested topics or None if generation failed.
        """
        prompt = TOPIC_SUGGESTION_PROMPT.format(
            job_designation=job_designation,
            skills=", ".join(skills),
            experience_level=experience_level,
            count=count,
        )

        result = await self._call_llm(TOPIC_SUGGESTION_SYSTEM_PROMPT, prompt)

        if result:
            return TopicSuggestionResponse(
                topics=result.get("topics", []),
                coverage_summary=result.get("coverage_summary", ""),
            )

        return None

    async def generate_code_question(
        self,
        topic: str,
        subtopics: list[str] | None = None,
        difficulty: DifficultyLevel = DifficultyLevel.MEDIUM,
        languages: list[str] | None = None,
        time_limit: int = 30,
        experience_level: str = "mid",
    ) -> dict[str, Any] | None:
        """Generate a coding question.

        Args:
            topic: Main topic for the question.
            subtopics: Specific subtopics to cover.
            difficulty: Question difficulty level.
            languages: Programming languages to support.
            time_limit: Time limit in minutes.
            experience_level: Target experience level.

        Returns:
            Generated question data or None if failed.
        """
        prompt = CODE_QUESTION_PROMPT.format(
            topic=topic,
            subtopics=", ".join(subtopics or []),
            difficulty=difficulty.value,
            languages=", ".join(languages or ["Python", "JavaScript"]),
            time_limit=time_limit,
            experience_level=experience_level,
        )

        result = await self._call_llm(CODE_QUESTION_SYSTEM_PROMPT, prompt)

        if result and "question" in result:
            return result["question"]

        return None

    async def generate_mcq_question(
        self,
        topic: str,
        subtopics: list[str] | None = None,
        difficulty: DifficultyLevel = DifficultyLevel.MEDIUM,
        experience_level: str = "mid",
    ) -> dict[str, Any] | None:
        """Generate a multiple choice question.

        Args:
            topic: Main topic for the question.
            subtopics: Specific subtopics to cover.
            difficulty: Question difficulty level.
            experience_level: Target experience level.

        Returns:
            Generated question data or None if failed.
        """
        prompt = MCQ_QUESTION_PROMPT.format(
            topic=topic,
            subtopics=", ".join(subtopics or []),
            difficulty=difficulty.value,
            experience_level=experience_level,
        )

        result = await self._call_llm(MCQ_QUESTION_SYSTEM_PROMPT, prompt)

        if result and "question" in result:
            return result["question"]

        return None

    async def generate_subjective_question(
        self,
        topic: str,
        subtopics: list[str] | None = None,
        difficulty: DifficultyLevel = DifficultyLevel.MEDIUM,
        experience_level: str = "mid",
        response_length: str = "medium",  # short, medium, long
    ) -> dict[str, Any] | None:
        """Generate a subjective/open-ended question.

        Args:
            topic: Main topic for the question.
            subtopics: Specific subtopics to cover.
            difficulty: Question difficulty level.
            experience_level: Target experience level.
            response_length: Expected response length.

        Returns:
            Generated question data or None if failed.
        """
        prompt = SUBJECTIVE_QUESTION_PROMPT.format(
            topic=topic,
            subtopics=", ".join(subtopics or []),
            difficulty=difficulty.value,
            experience_level=experience_level,
            response_length=response_length,
        )

        result = await self._call_llm(SUBJECTIVE_QUESTION_SYSTEM_PROMPT, prompt)

        if result and "question" in result:
            return result["question"]

        return None

    async def generate_questions(
        self,
        topic: str,
        question_type: QuestionType,
        difficulty: DifficultyLevel = DifficultyLevel.MEDIUM,
        count: int = 1,
        subtopics: list[str] | None = None,
        context: str | None = None,
    ) -> list[dict[str, Any]]:
        """Generate multiple questions of a specific type.

        Args:
            topic: Main topic for the questions.
            question_type: Type of questions to generate.
            difficulty: Question difficulty level.
            count: Number of questions to generate.
            subtopics: Specific subtopics to cover.
            context: Additional context for generation.

        Returns:
            List of generated questions.
        """
        questions = []

        for _ in range(count):
            if question_type == QuestionType.CODE:
                question = await self.generate_code_question(
                    topic=topic,
                    subtopics=subtopics,
                    difficulty=difficulty,
                )
            elif question_type == QuestionType.MCQ:
                question = await self.generate_mcq_question(
                    topic=topic,
                    subtopics=subtopics,
                    difficulty=difficulty,
                )
            elif question_type == QuestionType.SUBJECTIVE:
                question = await self.generate_subjective_question(
                    topic=topic,
                    subtopics=subtopics,
                    difficulty=difficulty,
                )
            else:
                logger.warning(f"Unsupported question type: {question_type}")
                continue

            if question:
                questions.append(question)

        return questions

    async def create_question_from_generated(
        self,
        assessment_id: str,
        topic_id: str,
        generated_data: dict[str, Any],
        question_type: QuestionType,
        difficulty: DifficultyLevel,
        sequence: int = 1,
    ) -> Question:
        """Create a Question model from generated data.

        Args:
            assessment_id: Assessment ID.
            topic_id: Topic ID.
            generated_data: Generated question data from LLM.
            question_type: Type of question.
            difficulty: Question difficulty.
            sequence: Question sequence number.

        Returns:
            Created Question model instance.
        """
        question = Question(
            assessment_id=assessment_id,
            topic_id=topic_id,
            question_type=question_type,
            difficulty=difficulty,
            sequence=sequence,
        )

        if question_type == QuestionType.CODE:
            question.problem_statement = generated_data.get("problem_statement", "")
            question.starter_code = generated_data.get("starter_code", {})
            question.test_cases = generated_data.get("test_cases", [])
            question.constraints = generated_data.get("constraints", [])
            question.examples = generated_data.get("examples", [])
            question.max_marks = generated_data.get("total_points", 100)
            question.time_limit_seconds = generated_data.get("time_limit", 30) * 60
            question.metadata = {
                "hints": generated_data.get("hints", []),
                "time_complexity_hint": generated_data.get("time_complexity_hint"),
                "space_complexity_hint": generated_data.get("space_complexity_hint"),
                "tags": generated_data.get("tags", []),
            }
        elif question_type == QuestionType.MCQ:
            question.problem_statement = generated_data.get("question_text", "")
            question.options = generated_data.get("options", [])
            question.correct_answer = generated_data.get("correct_answer")
            question.explanation = generated_data.get("explanation", "")
            question.max_marks = generated_data.get("points", 10)
            question.time_limit_seconds = generated_data.get("time_estimate_seconds", 60)
            question.metadata = {
                "common_misconception": generated_data.get("common_misconception"),
                "tags": generated_data.get("tags", []),
            }
        elif question_type == QuestionType.SUBJECTIVE:
            question.problem_statement = generated_data.get("question_text", "")
            question.evaluation_rubric = generated_data.get("evaluation_rubric", {})
            question.expected_keywords = generated_data.get("key_points", [])
            question.max_marks = generated_data.get("total_points", 100)
            question.time_limit_seconds = generated_data.get("time_estimate_minutes", 10) * 60
            question.metadata = {
                "context": generated_data.get("context"),
                "sub_questions": generated_data.get("sub_questions", []),
                "expected_response_structure": generated_data.get("expected_response_structure"),
                "word_limit": generated_data.get("word_limit"),
                "tags": generated_data.get("tags", []),
            }

        self.db.add(question)
        await self.db.commit()
        await self.db.refresh(question)

        return question


# Fallback for when LLM is not available - return sample questions
SAMPLE_MCQ_QUESTIONS = {
    "Python": [
        {
            "question_text": "What is the output of `print(type([]) is list)`?",
            "options": [
                {"id": "A", "text": "True", "is_correct": True, "explanation": "type([]) returns <class 'list'>, which is equal to list"},
                {"id": "B", "text": "False", "is_correct": False, "explanation": "The type is exactly 'list'"},
                {"id": "C", "text": "list", "is_correct": False, "explanation": "The expression evaluates to a boolean"},
                {"id": "D", "text": "Error", "is_correct": False, "explanation": "This is valid Python syntax"},
            ],
            "correct_answer": "A",
            "explanation": "The `type()` function returns the type of an object. `type([])` returns `<class 'list'>`, which is the same as `list`, so the comparison returns True.",
            "points": 10,
            "time_estimate_seconds": 60,
        },
    ],
    "JavaScript": [
        {
            "question_text": "What is the result of `typeof null` in JavaScript?",
            "options": [
                {"id": "A", "text": "\"null\"", "is_correct": False, "explanation": "null is not a type string"},
                {"id": "B", "text": "\"object\"", "is_correct": True, "explanation": "This is a well-known JavaScript quirk"},
                {"id": "C", "text": "\"undefined\"", "is_correct": False, "explanation": "null and undefined are different"},
                {"id": "D", "text": "null", "is_correct": False, "explanation": "typeof always returns a string"},
            ],
            "correct_answer": "B",
            "explanation": "Due to a historical bug in JavaScript that was preserved for backwards compatibility, `typeof null` returns \"object\". This is widely considered a design flaw in the language.",
            "points": 10,
            "time_estimate_seconds": 60,
        },
    ],
}

SAMPLE_CODE_QUESTIONS = {
    "Data Structures": [
        {
            "title": "Two Sum",
            "problem_statement": "Given an array of integers `nums` and an integer `target`, return the indices of the two numbers that add up to `target`.\n\nYou may assume that each input would have exactly one solution, and you may not use the same element twice.\n\nYou can return the answer in any order.",
            "input_format": "An array of integers and a target integer",
            "output_format": "An array of two integers representing the indices",
            "constraints": [
                "2 <= nums.length <= 10^4",
                "-10^9 <= nums[i] <= 10^9",
                "-10^9 <= target <= 10^9",
                "Only one valid answer exists",
            ],
            "examples": [
                {"input": "nums = [2,7,11,15], target = 9", "output": "[0,1]", "explanation": "nums[0] + nums[1] = 2 + 7 = 9"},
                {"input": "nums = [3,2,4], target = 6", "output": "[1,2]", "explanation": "nums[1] + nums[2] = 2 + 4 = 6"},
            ],
            "starter_code": {
                "python": "def two_sum(nums: list[int], target: int) -> list[int]:\n    # Your code here\n    pass",
                "javascript": "function twoSum(nums, target) {\n    // Your code here\n}",
            },
            "test_cases": [
                {"input": "[[2,7,11,15], 9]", "expected_output": "[0,1]", "is_hidden": False, "points": 20},
                {"input": "[[3,2,4], 6]", "expected_output": "[1,2]", "is_hidden": False, "points": 20},
                {"input": "[[3,3], 6]", "expected_output": "[0,1]", "is_hidden": True, "points": 30},
                {"input": "[[-1,-2,-3,-4,-5], -8]", "expected_output": "[2,4]", "is_hidden": True, "points": 30},
            ],
            "total_points": 100,
            "time_complexity_hint": "O(n)",
            "space_complexity_hint": "O(n)",
            "hints": [
                "Consider using a hash map to store seen numbers",
                "For each number, check if target - number exists in the hash map",
            ],
            "tags": ["arrays", "hash-table"],
        },
    ],
}


async def get_sample_questions(
    question_type: QuestionType,
    topic: str,
    count: int = 1,
) -> list[dict[str, Any]]:
    """Get sample questions when LLM is not available.

    Args:
        question_type: Type of questions.
        topic: Topic name.
        count: Number of questions to return.

    Returns:
        List of sample questions.
    """
    if question_type == QuestionType.MCQ:
        questions = SAMPLE_MCQ_QUESTIONS.get(topic, list(SAMPLE_MCQ_QUESTIONS.values())[0])
    elif question_type == QuestionType.CODE:
        questions = SAMPLE_CODE_QUESTIONS.get(topic, list(SAMPLE_CODE_QUESTIONS.values())[0])
    else:
        questions = []

    return questions[:count]
