export interface FaqStudyAction {
  href: string;
  label: string;
}
export interface FaqStudyQuestion {
  action?: FaqStudyAction;
  answer: string;
  disabled?: boolean;
  id: string;
  question: string;
}
export interface FaqGuideTopic {
  id: string;
  initials: string;
  label: string;
}

/** Empty string is an intentional collapse, including after later content changes. */
export const resolveFaqValue = (
  questions: readonly FaqStudyQuestion[],
  requested: string
) => {
  if (requested === "") {
    return "";
  }
  return (
    questions.find(
      (question) => question.id === requested && !question.disabled
    )?.id ??
    questions.find((question) => !question.disabled)?.id ??
    ""
  );
};

export const faqGuideTopics: readonly FaqGuideTopic[] = [
  { id: "content", initials: "CT", label: "Library" },
  { id: "layout", initials: "LY", label: "Collections" },
  { id: "states", initials: "ST", label: "Support" },
];
