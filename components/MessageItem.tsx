import React from 'react';
import { TranscriptionItem } from '../types';

interface MessageItemProps {
  item: TranscriptionItem;
}

// Using React.memo is critical for performance in streaming chat apps.
// It prevents old messages from re-rendering when a new token arrives.
const MessageItem: React.FC<MessageItemProps> = React.memo(({ item }) => {
  const isUser = item.role === 'user';
  
  return (
    <div className={`flex w-full mb-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div 
        className={`
          max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed
          ${isUser 
            ? 'bg-indigo-600 text-white rounded-tr-none' 
            : 'bg-white text-gray-800 shadow-sm border border-gray-200 rounded-tl-none'
          }
        `}
      >
        <div className="font-semibold text-xs mb-1 opacity-75 uppercase tracking-wider">
          {isUser ? 'You' : 'Profa. Alice'}
        </div>
        <div>
           {item.text}
        </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Only re-render if the text content or completion status changes
  return prevProps.item.text === nextProps.item.text && 
         prevProps.item.isComplete === nextProps.item.isComplete;
});

export default MessageItem;