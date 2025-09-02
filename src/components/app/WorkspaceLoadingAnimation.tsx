import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import logoSvg from "@/assets/icons/logo.svg";

const LOADING_STEPS = [
  { key: "checkingAuth", duration: 800 },
  { key: "loadingData", duration: 600 },
  { key: "preparingInterface", duration: 700 },
  { key: "finalizing", duration: 500 },
] as const;

export function WorkspaceLoadingAnimation() {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let progressInterval: NodeJS.Timeout;

    const runStep = (stepIndex: number) => {
      if (stepIndex >= LOADING_STEPS.length) {
        setIsComplete(true);
        return;
      }

      setCurrentStep(stepIndex);
      const step = LOADING_STEPS[stepIndex];

      if (!step) return; // Prevent undefined error

      // Reset progress
      setProgress(0);

      // Progressive progress animation
      progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            clearInterval(progressInterval);
            return 100;
          }

          return prev + 100 / (step.duration / 50); // 50ms intervals
        });
      }, 50);

      // Move to next step after completion
      timeoutId = setTimeout(() => {
        clearInterval(progressInterval);
        runStep(stepIndex + 1);
      }, step.duration);
    };

    runStep(0);

    return () => {
      clearTimeout(timeoutId);
      clearInterval(progressInterval);
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-background-primary flex items-center justify-center">
      <div className="flex flex-col items-center justify-center max-w-md mx-auto px-8">
        {/* Logo Animation */}
        <div className="relative mb-8">
          <div
            className="transition-all duration-1000 ease-out"
            style={{
              transform: `scale(${isComplete ? 1.2 : 0.9}) rotate(${progress * 3.6}deg)`,
              opacity: isComplete ? 1 : 0.8 + (progress / 100) * 0.2,
            }}>
            <div className="relative">
              <img src={logoSvg} alt="logo" width={37} height={37} />
              {/* Glow effect */}
              <div
                className="absolute inset-0 bg-fill-theme-thick rounded-full blur-xl opacity-30"
                style={{
                  animation: `pulse 2s ease-in-out infinite`,
                  transform: `scale(${1.2 + (progress / 100) * 0.8})`,
                }}
              />
            </div>
          </div>

          {/* Circular progress ring */}
          <div className="absolute -inset-6 flex items-center justify-center">
            <svg
              className="w-28 h-28 transform -rotate-90"
              viewBox="0 0 100 100">
              {/* Background ring */}
              <circle
                cx="50"
                cy="50"
                r="45"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
                className="text-border-primary opacity-20"
              />
              {/* Progress ring */}
              <circle
                cx="50"
                cy="50"
                r="45"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
                strokeDasharray={`${2 * Math.PI * 45}`}
                strokeDashoffset={`${2 * Math.PI * 45 * (1 - (currentStep * 25 + progress * 0.25) / 100)}`}
                className="text-fill-theme-thick transition-all duration-300 ease-out"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        {/* Main title */}
        <div className="text-center mb-4">
          <h1
            className="text-2xl font-bold text-text-primary transition-all duration-500 ease-out"
            style={{
              transform: `translateY(${isComplete ? 0 : 10}px)`,
              opacity: isComplete ? 1 : 0.9,
            }}>
            {isComplete ? t("global-loading.welcome") : t("global-loading.installing")}
          </h1>
        </div>

        {/* Simple status text */}
        <div className="text-center mb-6">
          <p
            className="text-sm text-text-secondary transition-all duration-300"
            style={{
              opacity: isComplete ? 0 : 1,
            }}>
            {!isComplete && t(`global-loading.steps.${LOADING_STEPS[currentStep]?.key}`)}
          </p>
        </div>

        {/* Progress percentage */}
        <div className="text-center">
          <div className="text-xs text-text-tertiary">
            {Math.round(currentStep * 25 + progress * 0.25)}%
          </div>
        </div>
      </div>

      {/* Background particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-fill-theme-thick rounded-full opacity-20"
            style={{
              left: `${25 + i * 20}%`,
              top: `${40 + (i % 2) * 20}%`,
              animation: `float 4s ease-in-out infinite ${i * 0.8}s`,
              animationDirection: i % 2 === 0 ? "normal" : "reverse",
            }}
          />
        ))}
      </div>

     
    </div>
  );
}