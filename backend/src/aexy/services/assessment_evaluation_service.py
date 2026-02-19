"""Service for evaluating assessment submissions."""

import json
import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.llm.gateway import get_llm_gateway
from aexy.llm.prompts import (
    CODE_EVALUATION_SYSTEM_PROMPT,
    CODE_EVALUATION_PROMPT,
    SUBJECTIVE_EVALUATION_SYSTEM_PROMPT,
    SUBJECTIVE_EVALUATION_PROMPT,
    OVERALL_CANDIDATE_FEEDBACK_SYSTEM_PROMPT,
    OVERALL_CANDIDATE_FEEDBACK_PROMPT,
)
from aexy.models.assessment import (
    Question,
    QuestionSubmission,
    SubmissionEvaluation,
    AssessmentAttempt,
    QuestionType,
)

logger = logging.getLogger(__name__)


class AssessmentEvaluationService:
    """Service for evaluating candidate submissions."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.gateway = get_llm_gateway()

    async def _call_llm(
        self,
        system_prompt: str,
        user_prompt: str,
    ) -> dict[str, Any] | None:
        """Call LLM with prompts and parse JSON response."""
        if not self.gateway:
            logger.warning("LLM gateway not available for evaluation")
            return None

        try:
            provider = self.gateway.provider

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ]

            if hasattr(provider, 'client'):
                response = await provider.client.messages.create(
                    model=provider.model_name,
                    max_tokens=4096,
                    messages=messages,
                )
                response_text = response.content[0].text
            elif hasattr(provider, '_call_api'):
                response_text = await provider._call_api(messages)
            else:
                return None

            try:
                return json.loads(response_text)
            except json.JSONDecodeError:
                start = response_text.find('{')
                end = response_text.rfind('}') + 1
                if start >= 0 and end > start:
                    return json.loads(response_text[start:end])
                return None

        except Exception as e:
            logger.error(f"LLM call failed: {e}")
            return None

    async def evaluate_mcq_submission(
        self,
        submission: QuestionSubmission,
        question: Question,
    ) -> SubmissionEvaluation:
        """Evaluate an MCQ submission.

        MCQs are auto-graded by comparing the selected answer with the correct answer.
        """
        selected_answer = submission.content.get("selected_answer")
        correct_answer = next(
            (opt.get("id") for opt in (question.options or []) if opt.get("is_correct")),
            None,
        )

        is_correct = selected_answer == correct_answer
        marks = question.max_marks if is_correct else 0

        # Find the explanation for the selected option
        feedback = ""
        for option in question.options or []:
            if option.get("id") == selected_answer:
                feedback = option.get("explanation", "")
                break

        pct = round((marks / question.max_marks * 100), 2) if question.max_marks else 0
        evaluation = SubmissionEvaluation(
            submission_id=submission.id,
            marks_obtained=marks,
            max_marks=question.max_marks,
            percentage=pct,
            feedback=feedback,
            test_case_results=None,
            ai_analysis=None,
        )

        self.db.add(evaluation)
        await self.db.commit()
        await self.db.refresh(evaluation)

        return evaluation

    async def evaluate_code_submission(
        self,
        submission: QuestionSubmission,
        question: Question,
        test_results: list[dict[str, Any]] | None = None,
    ) -> SubmissionEvaluation:
        """Evaluate a code submission.

        Uses test case results and AI analysis for comprehensive evaluation.
        """
        code = submission.content.get("code", "")
        language = submission.language or "python"

        # Calculate score from test results
        test_score = 0
        total_test_points = 0
        test_case_results = []

        if test_results:
            for idx, result in enumerate(test_results):
                test_case = question.test_cases[idx] if idx < len(question.test_cases or []) else {}
                points = test_case.get("points", 10)
                total_test_points += points

                passed = result.get("passed", False)
                if passed:
                    test_score += points

                test_case_results.append({
                    "test_id": idx,
                    "passed": passed,
                    "points": points if passed else 0,
                    "max_points": points,
                    "output": result.get("output"),
                    "expected": result.get("expected"),
                    "error": result.get("error"),
                })

        # Get AI analysis
        ai_analysis = None
        if self.gateway and code:
            prompt = CODE_EVALUATION_PROMPT.format(
                question=question.problem_statement,
                language=language,
                code=code,
                test_results=json.dumps(test_case_results, indent=2),
            )
            ai_analysis = await self._call_llm(CODE_EVALUATION_SYSTEM_PROMPT, prompt)

        # Calculate final score
        # Test results contribute 70%, AI analysis 30%
        ai_score = 0
        if ai_analysis:
            ai_score = ai_analysis.get("overall_score", 0)

        if total_test_points > 0:
            test_percentage = (test_score / total_test_points) * 100
            final_score = (test_percentage * 0.7) + (ai_score * 0.3)
        else:
            final_score = ai_score

        marks = int((final_score / 100) * question.max_marks)

        # Generate feedback
        feedback_parts = []
        if ai_analysis:
            feedback_parts.append(ai_analysis.get("detailed_feedback", ""))
            if ai_analysis.get("suggestions"):
                feedback_parts.append("Suggestions: " + ", ".join(ai_analysis["suggestions"]))
        else:
            if test_results:
                passed_count = sum(1 for r in test_results if r.get("passed"))
                feedback_parts.append(f"Passed {passed_count}/{len(test_results)} test cases.")

        code_pct = round((marks / question.max_marks * 100), 2) if question.max_marks else 0
        evaluation = SubmissionEvaluation(
            submission_id=submission.id,
            marks_obtained=marks,
            max_marks=question.max_marks,
            percentage=code_pct,
            feedback="\n".join(feedback_parts) or "Evaluation complete.",
            test_case_results=test_case_results,
            ai_analysis=ai_analysis,
        )

        self.db.add(evaluation)
        await self.db.commit()
        await self.db.refresh(evaluation)

        return evaluation

    async def evaluate_subjective_submission(
        self,
        submission: QuestionSubmission,
        question: Question,
    ) -> SubmissionEvaluation:
        """Evaluate a subjective submission using AI."""
        response_text = submission.content.get("text", "")

        # Use AI for evaluation
        ai_analysis = None
        if self.gateway and response_text:
            prompt = SUBJECTIVE_EVALUATION_PROMPT.format(
                question=question.problem_statement,
                rubric=json.dumps(question.evaluation_rubric or {}, indent=2),
                key_points=", ".join(question.key_points or []),
                response=response_text,
            )
            ai_analysis = await self._call_llm(SUBJECTIVE_EVALUATION_SYSTEM_PROMPT, prompt)

        # Calculate marks based on AI analysis
        if ai_analysis:
            score_percentage = ai_analysis.get("overall_score", 50)
            marks = int((score_percentage / 100) * question.max_marks)
            feedback = ai_analysis.get("detailed_feedback", "")

            # Add key points coverage to feedback
            if ai_analysis.get("key_points_coverage"):
                coverage_details = []
                for point in ai_analysis["key_points_coverage"]:
                    status = "Covered" if point.get("covered") else "Missing"
                    coverage_details.append(f"- {point.get('point', 'Unknown')}: {status}")
                if coverage_details:
                    feedback += "\n\nKey Points Coverage:\n" + "\n".join(coverage_details)
        else:
            # Fallback: basic keyword matching
            keywords_found = 0
            for keyword in question.key_points or []:
                if keyword.lower() in response_text.lower():
                    keywords_found += 1

            if question.key_points:
                score_percentage = (keywords_found / len(question.key_points)) * 100
            else:
                score_percentage = 50  # Default score when no keywords defined

            marks = int((score_percentage / 100) * question.max_marks)
            feedback = f"Found {keywords_found} of {len(question.key_points or [])} expected key concepts."

        subj_pct = round((marks / question.max_marks * 100), 2) if question.max_marks else 0
        evaluation = SubmissionEvaluation(
            submission_id=submission.id,
            marks_obtained=marks,
            max_marks=question.max_marks,
            percentage=subj_pct,
            feedback=feedback,
            test_case_results=None,
            ai_analysis=ai_analysis,
        )

        self.db.add(evaluation)
        await self.db.commit()
        await self.db.refresh(evaluation)

        return evaluation

    async def evaluate_submission(
        self,
        submission: QuestionSubmission,
        question: Question,
        test_results: list[dict[str, Any]] | None = None,
    ) -> SubmissionEvaluation:
        """Evaluate a submission based on question type.

        Args:
            submission: The candidate's submission.
            question: The question being answered.
            test_results: Test case results for code questions.

        Returns:
            Evaluation result.
        """
        if question.question_type == QuestionType.MCQ:
            return await self.evaluate_mcq_submission(submission, question)
        elif question.question_type == QuestionType.CODE:
            return await self.evaluate_code_submission(submission, question, test_results)
        elif question.question_type == QuestionType.SUBJECTIVE:
            return await self.evaluate_subjective_submission(submission, question)
        elif question.question_type == QuestionType.PSEUDO_CODE:
            # Treat pseudo-code like subjective for evaluation
            return await self.evaluate_subjective_submission(submission, question)
        else:
            # For audio and other types, create a basic evaluation with 0 marks
            # so the attempt score calculation still works
            logger.warning(f"No evaluator for question type: {question.question_type}, creating placeholder evaluation")
            evaluation = SubmissionEvaluation(
                submission_id=submission.id,
                marks_obtained=0,
                max_marks=question.max_marks,
                percentage=0,
                feedback=f"Automatic evaluation not supported for {question.question_type} questions. Manual review required.",
                test_case_results=None,
                ai_analysis=None,
            )
            self.db.add(evaluation)
            await self.db.commit()
            await self.db.refresh(evaluation)
            return evaluation

    async def calculate_attempt_score(
        self,
        attempt_id: str,
    ) -> dict[str, Any]:
        """Calculate total score for an attempt.

        Args:
            attempt_id: The attempt ID.

        Returns:
            Score summary.
        """
        # Get all submissions for this attempt
        submissions_query = select(QuestionSubmission).where(
            QuestionSubmission.attempt_id == attempt_id
        )
        result = await self.db.execute(submissions_query)
        submissions = result.scalars().all()

        total_marks = 0
        max_marks = 0
        topic_scores: dict[str, dict[str, int]] = {}
        question_results = []

        for submission in submissions:
            # Get evaluation
            eval_query = select(SubmissionEvaluation).where(
                SubmissionEvaluation.submission_id == submission.id
            )
            eval_result = await self.db.execute(eval_query)
            evaluation = eval_result.scalar_one_or_none()

            if evaluation:
                total_marks += evaluation.marks_obtained
                max_marks += evaluation.max_marks

                # Get question for topic info
                question_query = select(Question).where(Question.id == submission.question_id)
                q_result = await self.db.execute(question_query)
                question = q_result.scalar_one_or_none()

                if question and question.topic_id:
                    topic_id = str(question.topic_id)
                    if topic_id not in topic_scores:
                        topic_scores[topic_id] = {"marks": 0, "max_marks": 0}
                    topic_scores[topic_id]["marks"] += evaluation.marks_obtained
                    topic_scores[topic_id]["max_marks"] += evaluation.max_marks

                question_results.append({
                    "question_id": str(submission.question_id),
                    "marks": evaluation.marks_obtained,
                    "max_marks": evaluation.max_marks,
                })

        percentage = (total_marks / max_marks * 100) if max_marks > 0 else 0

        # Update attempt with score
        attempt_query = select(AssessmentAttempt).where(AssessmentAttempt.id == attempt_id)
        attempt_result = await self.db.execute(attempt_query)
        attempt = attempt_result.scalar_one_or_none()

        if attempt:
            attempt.total_score = total_marks
            attempt.max_possible_score = max_marks
            attempt.percentage_score = round(percentage, 2)
            await self.db.commit()

        return {
            "total_marks": total_marks,
            "max_marks": max_marks,
            "percentage": round(percentage, 2),
            "topic_scores": topic_scores,
            "question_results": question_results,
        }

    async def generate_candidate_feedback(
        self,
        attempt_id: str,
        assessment_title: str,
        job_role: str,
    ) -> dict[str, Any] | None:
        """Generate comprehensive feedback for a candidate.

        Args:
            attempt_id: The attempt ID.
            assessment_title: Title of the assessment.
            job_role: Job designation.

        Returns:
            Comprehensive feedback or None if generation failed.
        """
        # Calculate scores first
        scores = await self.calculate_attempt_score(attempt_id)

        if not self.gateway:
            # Return basic feedback without AI
            return {
                "summary": f"You scored {scores['percentage']}% on the assessment.",
                "strengths": [],
                "areas_for_improvement": [],
                "recommendations": [],
                "overall_assessment": f"Your overall score is {scores['percentage']}%.",
            }

        # Build detailed results for feedback generation
        topic_scores_str = json.dumps(scores["topic_scores"], indent=2)
        question_results_str = json.dumps(scores["question_results"], indent=2)

        prompt = OVERALL_CANDIDATE_FEEDBACK_PROMPT.format(
            assessment_title=assessment_title,
            job_role=job_role,
            topic_scores=topic_scores_str,
            question_results=question_results_str,
            overall_score=scores["percentage"],
            percentile=50,  # TODO: Calculate actual percentile
        )

        return await self._call_llm(OVERALL_CANDIDATE_FEEDBACK_SYSTEM_PROMPT, prompt)
