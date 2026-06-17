import React from 'react';
import { PR_CREATION_STEPS } from '../../config/prCreationQuestions';

interface Props {
  currentIndex: number;
}

export const PRWizardStepper: React.FC<Props> = ({ currentIndex }) => (
  <nav className="mb-8">
    <ol className="flex flex-wrap gap-2 md:gap-0 md:justify-between">
      {PR_CREATION_STEPS.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li
            key={step.id}
            className={`flex items-center gap-2 text-xs md:text-sm font-medium px-2 py-1 rounded ${
              active ? 'text-[#1a3a6b] bg-blue-50' : done ? 'text-green-700' : 'text-slate-400'
            }`}
          >
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs border ${
                active
                  ? 'border-[#1a3a6b] bg-[#1a3a6b] text-white'
                  : done
                    ? 'border-green-600 bg-green-600 text-white'
                    : 'border-slate-300 text-slate-500'
              }`}
            >
              {done ? '✓' : index + 1}
            </span>
            <span className="hidden sm:inline">{step.label}</span>
          </li>
        );
      })}
    </ol>
    <p className="mt-3 text-sm text-slate-500">{PR_CREATION_STEPS[currentIndex].description}</p>
  </nav>
);
