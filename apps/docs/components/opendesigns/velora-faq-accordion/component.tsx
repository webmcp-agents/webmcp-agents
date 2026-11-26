"use client";

import { Message01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
} from "@/components/ui/avatar";
import { LinkButton } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import { useId, useState } from "react";
import type { ReactNode } from "react";

import { brand, useBrandName } from "../_shared/brand";
import { faqGuideTopics, resolveFaqValue } from "./faq";
import type { FaqGuideTopic, FaqStudyAction, FaqStudyQuestion } from "./faq";

import "./styles.css";

export type { FaqGuideTopic, FaqStudyAction, FaqStudyQuestion } from "./faq";

export interface FaqAccordionProps {
  className?: string;
  contactAction: FaqStudyAction;
  defaultValue?: string;
  description?: string;
  emptyAnswer?: string;
  emptyDescription?: string;
  emptyTitle?: string;
  eyebrow?: string;
  guideDescription?: string;
  /** Rendered in the guide card under its copy (a docs search, say). */
  guideExtra?: ReactNode;
  guideTitle?: string;
  isDisabled?: boolean;
  onValueChange?: (value: string) => void;
  questions: readonly FaqStudyQuestion[];
  title?: string;
  topics?: readonly FaqGuideTopic[];
  value?: string;
}

const ReadingAction = ({
  action,
  icon = false,
}: {
  action: FaqStudyAction;
  icon?: boolean;
}) => (
  <LinkButton
    href={action.href}
    size="touch"
    variant={icon ? "default" : "outline"}
    className="max-w-full"
  >
    {icon && (
      <HugeiconsIcon
        icon={Message01Icon}
        data-icon="inline-start"
        aria-hidden="true"
      />
    )}
    <span className="min-w-0 text-balance whitespace-normal">
      {action.label}
    </span>
  </LinkButton>
);

const QuestionList = ({
  emptyAnswer,
  isDisabled,
  onSelection,
  questions,
  selected,
}: {
  emptyAnswer: string;
  isDisabled: boolean;
  onSelection: (value: string) => void;
  questions: readonly FaqStudyQuestion[];
  selected: string;
}) => (
  <div className="velora-faq-surface">
    <Accordion
      type="single"
      collapsible
      value={selected}
      onValueChange={onSelection}
      isDisabled={isDisabled}
    >
      {questions.map((question) => (
        <AccordionItem
          key={question.id}
          value={question.id}
          disabled={question.disabled}
        >
          <div className="velora-faq-row-space" data-faq={question.id}>
            <AccordionTrigger>
              <span className="min-w-0">
                {question.question.trim()
                  ? question.question
                  : "Question not provided"}
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="velora-faq-answer">
                <p>{question.answer.trim() ? question.answer : emptyAnswer}</p>
                {question.action && (
                  <div className="velora-faq-answer-action">
                    <ReadingAction action={question.action} />
                  </div>
                )}
              </div>
            </AccordionContent>
          </div>
        </AccordionItem>
      ))}
    </Accordion>
  </div>
);

const GuideTopics = ({ topics }: { topics: readonly FaqGuideTopic[] }) => {
  const brandName = useBrandName();
  if (topics.length === 0) {
    return null;
  }
  return (
    <div className="velora-faq-topics">
      <AvatarGroup aria-hidden="true">
        {topics.map((topic) => (
          <Avatar key={topic.id}>
            <AvatarFallback>{topic.initials}</AvatarFallback>
          </Avatar>
        ))}
      </AvatarGroup>
      <p className="sr-only">
        Explore {brandName}: {topics.map((topic) => topic.label).join(", ")}.
      </p>
    </div>
  );
};

const ContactGuide = ({
  action,
  description = "Find a collection, explore the library or get in touch with a question.",
  extra,
  id,
  title = "Looking for something more?",
  topics,
}: {
  action: FaqStudyAction;
  description?: string;
  extra?: ReactNode;
  id: string;
  title?: string;
  topics: readonly FaqGuideTopic[];
}) => (
  <aside aria-labelledby={`${id}-guide-title`} className="velora-faq-guide">
    <GuideTopics topics={topics} />
    <div className="velora-faq-guide-copy">
      <h3 id={`${id}-guide-title`}>
        {title.trim() ? title : "Explore the library"}
      </h3>
      {description && <p>{description}</p>}
    </div>
    <div className="velora-faq-guide-action">
      <ReadingAction action={action} icon />
    </div>
    {extra && <div className="velora-faq-guide-extra">{extra}</div>}
  </aside>
);

const FaqHeading = ({
  description = `A few helpful answers about the ${brand.name} library and your next creative project.`,
  eyebrow = `${brand.name} / Questions`,
  id,
  title = "A little clarity, one question at a time.",
}: Pick<FaqAccordionProps, "description" | "eyebrow" | "title"> & {
  id: string;
}) => {
  useBrandName();
  return (
    <div className="velora-faq-heading">
      {eyebrow && <p className="velora-faq-eyebrow">{eyebrow}</p>}
      <h2 id={`${id}-title`} className="velora-faq-title">
        {title}
      </h2>
      {description && <p className="velora-faq-description">{description}</p>}
    </div>
  );
};

const NoQuestions = ({
  description = "More answers are on the way. Explore the library in the meantime.",
  title = "No questions have been added",
}: {
  description?: string;
  title?: string;
}) => (
  <Empty>
    <EmptyHeader>
      <EmptyTitle>{title}</EmptyTitle>
      <EmptyDescription>{description}</EmptyDescription>
    </EmptyHeader>
  </Empty>
);

/** One user-selected answer, including a genuine all-collapsed state, with no automatic selection schedule. */
export const FaqAccordion = ({
  className,
  contactAction,
  defaultValue,
  emptyAnswer = "This answer is unavailable. Contact us for more information.",
  emptyDescription,
  emptyTitle,
  guideDescription,
  guideExtra,
  guideTitle,
  isDisabled = false,
  onValueChange,
  questions,
  topics = faqGuideTopics,
  value,
  ...heading
}: FaqAccordionProps) => {
  const id = useId();
  const [inner, setInner] = useState(
    () =>
      defaultValue ?? questions.find((question) => !question.disabled)?.id ?? ""
  );
  const selected = resolveFaqValue(questions, value ?? inner);
  const handleSelection = (next: string) => {
    if (
      isDisabled ||
      next === selected ||
      (next !== "" &&
        !questions.some(
          (question) => question.id === next && !question.disabled
        ))
    ) {
      return;
    }
    if (value === undefined) {
      setInner(next);
    }
    onValueChange?.(next);
  };
  return (
    <section
      aria-labelledby={`${id}-title`}
      className={cn("velora-faq-section", className)}
    >
      <div className="velora-faq-inner">
        <FaqHeading {...heading} id={id} />
        <div className="velora-faq-questions">
          {questions.length > 0 ? (
            <QuestionList
              emptyAnswer={emptyAnswer}
              isDisabled={isDisabled}
              onSelection={handleSelection}
              questions={questions}
              selected={selected}
            />
          ) : (
            <NoQuestions description={emptyDescription} title={emptyTitle} />
          )}
        </div>
        <ContactGuide
          action={contactAction}
          description={guideDescription}
          extra={guideExtra}
          id={id}
          title={guideTitle}
          topics={topics}
        />
      </div>
    </section>
  );
};
