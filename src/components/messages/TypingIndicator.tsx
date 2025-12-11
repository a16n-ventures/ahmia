import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface TypingUser {
  userId: string;
  name: string;
  avatar?: string;
}

interface TypingIndicatorProps {
  typingUsers: TypingUser[];
  showAvatars?: boolean;
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({ 
  typingUsers, 
  showAvatars = false 
}) => {
  if (typingUsers.length === 0) return null;

  const names = typingUsers.map(u => u.name);
  const displayText = names.length === 1 
    ? `${names[0]} is typing...`
    : names.length === 2 
      ? `${names[0]} and ${names[1]} are typing...`
      : `${names[0]} and ${names.length - 1} others are typing...`;

  return (
    <div className="flex items-center gap-2 mb-3 animate-in fade-in-50 slide-in-from-bottom-2 pl-4">
      {showAvatars && typingUsers.length <= 3 && (
        <div className="flex -space-x-2">
          {typingUsers.slice(0, 3).map((user) => (
            <Avatar key={user.userId} className="w-6 h-6 border-2 border-background">
              <AvatarImage src={user.avatar} />
              <AvatarFallback className="text-[10px]">{user.name[0]}</AvatarFallback>
            </Avatar>
          ))}
        </div>
      )}
      <div className="bg-muted/80 rounded-2xl rounded-tl-sm px-4 py-2.5 flex items-center gap-1.5 shadow-sm">
        <div className="w-1.5 h-1.5 bg-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-1.5 h-1.5 bg-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-1.5 h-1.5 bg-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
      <span className="text-xs text-muted-foreground animate-pulse">
        {displayText}
      </span>
    </div>
  );
};
