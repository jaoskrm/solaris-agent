import React, { useEffect, useState, useCallback, useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { cn } from "@/lib/utils";

export function CustomScrollbar() {
  const { scrollYProgress } = useScroll();
  const [windowHeight, setWindowHeight] = useState(0);

  useEffect(() => {
    const updateHeight = () => setWindowHeight(window.innerHeight);
    updateHeight();
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, []);

  const thumbHeight = 128;
  const maxTranslate = Math.max(0, windowHeight - thumbHeight);

  // Map scroll progress to y translation
  const y = useTransform(scrollYProgress, [0, 1], [0, maxTranslate]);

  // Opacity for bumpers: 1 only at 0 or 1
  const topBumperOpacity = useTransform(scrollYProgress, (val) => (val <= 0.001 ? 1 : 0));
  const bottomBumperOpacity = useTransform(scrollYProgress, (val) => (val >= 0.999 ? 1 : 0));

  const ScrollIndicator = ({ side }: { side: "left" | "right" }) => {
    const thumbRef = useRef<HTMLDivElement>(null);
    const isDragging = useRef(false);
    const dragStartY = useRef(0);
    const scrollStartY = useRef(0);

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
      isDragging.current = true;
      dragStartY.current = e.clientY;
      scrollStartY.current = window.scrollY;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      document.body.style.userSelect = "none";
    }, []);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
      if (!isDragging.current) return;
      const deltaY = e.clientY - dragStartY.current;
      const scrollableHeight = document.documentElement.scrollHeight - windowHeight;
      const trackHeight = windowHeight - thumbHeight;
      if (trackHeight <= 0) return;
      const scrollDelta = (deltaY / trackHeight) * scrollableHeight;
      window.scrollTo({ top: scrollStartY.current + scrollDelta, behavior: "instant" as ScrollBehavior });
    }, [windowHeight]);

    const handlePointerUp = useCallback((e: React.PointerEvent) => {
      isDragging.current = false;
      document.body.style.userSelect = "";
    }, []);

    const handleTrackClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      // Only handle clicks on the track, not the thumb
      if ((e.target as HTMLElement).dataset.thumb) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const clickY = e.clientY - rect.top;
      const ratio = clickY / windowHeight;
      const scrollableHeight = document.documentElement.scrollHeight - windowHeight;
      window.scrollTo({ top: ratio * scrollableHeight, behavior: "smooth" });
    }, [windowHeight]);

    return (
      <div
        onClick={handleTrackClick}
        className={cn(
          "fixed top-0 bottom-0 w-[20px] z-50 flex justify-center cursor-pointer",
          side === "left" ? "left-1" : "right-1"
        )}
      >
        <motion.div
          ref={thumbRef}
          data-thumb="true"
          style={{ y }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="relative w-[4px] h-32 bg-white rounded-full shadow-[0_0_15px_rgba(255,255,255,0.8)] cursor-grab active:cursor-grabbing touch-none"
        >
          {/* Top Bumper */}
          <motion.div
            style={{ opacity: topBumperOpacity }}
            className="absolute top-0 left-1/2 -translate-x-1/2 w-[12px] h-[2px] bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.8)]"
          />

          {/* Bottom Bumper */}
          <motion.div
            style={{ opacity: bottomBumperOpacity }}
            className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[12px] h-[2px] bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.8)]"
          />
        </motion.div>
      </div>
    );
  };

  return (
    <>
      <ScrollIndicator side="left" />
      <ScrollIndicator side="right" />
    </>
  );
}
