import React from "react";

type NumberedRowProps = {
  number: number;
  text: string | React.ReactNode;
};

/**
 * Component for displaying numbered steps in the How It Works section
 */
const NumberedRow: React.FC<NumberedRowProps> = ({ number, text }) => (
  <div className="flex gap-4">
    <div className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-fg-secondary">
      {number}
    </div>
    <div className="text-fg-primary">
      {text}
    </div>
  </div>
);

export default NumberedRow; 