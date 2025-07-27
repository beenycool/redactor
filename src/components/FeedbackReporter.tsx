import React, { useState } from 'react';

interface FeedbackReporterProps {
  onFeedback: (feedback: any) => void;
}

export const FeedbackReporter: React.FC<FeedbackReporterProps> = ({ onFeedback }) => {
  const [isReporting, setIsReporting] = useState(false);
  const [feedbackType, setFeedbackType] = useState<'false_positive' | 'false_negative' | ''>('');
  const [comment, setComment] = useState('');

  const handleReportFalsePositive = () => {
    setFeedbackType('false_positive');
    setIsReporting(true);
  };

  const handleReportFalseNegative = () => {
    setFeedbackType('false_negative');
    setIsReporting(true);
  };

  const handleSubmit = () => {
    if (feedbackType) {
      onFeedback({
        type: feedbackType,
        comment: comment.trim() || undefined,
        timestamp: new Date().toISOString()
      });
      resetForm();
    }
  };

  const resetForm = () => {
    setIsReporting(false);
    setFeedbackType('');
    setComment('');
  };

  if (isReporting) {
    return (
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-gray-700">
          {feedbackType === 'false_positive' ? 'False Positive' : 'False Negative'}
        </h4>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Describe the issue..."
          className="w-full px-2 py-1 text-xs border rounded focus:border-blue-500 focus:outline-none"
          rows={2}
        />
        <div className="flex gap-1">
          <button
            onClick={handleSubmit}
            className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Submit
          </button>
          <button
            onClick={resetForm}
            className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <h4 className="text-xs font-medium text-gray-700">Feedback</h4>
      <div className="flex gap-1">
        <button
          onClick={handleReportFalsePositive}
          className="px-2 py-1 text-xs bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200"
        >
          False +
        </button>
        <button
          onClick={handleReportFalseNegative}
          className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
        >
          False -
        </button>
      </div>
    </div>
  );
};