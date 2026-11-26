"use client";
import { createContext, useContext } from "react";
import type { ReactNode } from "react";

const MotionPolicy = createContext(false);
/** Internal deterministic capture policy; visitors never need to enable animations. */
export const useMotionPaused = () => useContext(MotionPolicy);
export const MotionBoundary = ({
  children,
  className = "ns-block-example",
}: {
  children: ReactNode;
  className?: string;
}) => {
  const paused = useMotionPaused();
  return (
    <div
      className={`relative isolate ${className}`}
      data-motion-paused={paused}
    >
      {children}
    </div>
  );
};
