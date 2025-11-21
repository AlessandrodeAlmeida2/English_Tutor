import React from 'react';
import { TranscriptionItem } from '../types';

interface MessageItemProps {
  item: TranscriptionItem;
}

const MessageItem: React.FC<MessageItemProps> = ({ item }) => {
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
};

export default MessageItem;