import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  message?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  message = 'Loading...' 
}) => {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="text-center space-y-4">
        <div className="relative">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
        </div>
        <p className="text-body font-medium">{message}</p>
        <div className="flex justify-center space-x-1">
          <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce"></div>
          <div className="w-2 h-2 bg-primary/80 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
          <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
        </div>
      </div>
    </div>
  );
};