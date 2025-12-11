import { useState, useCallback, useRef } from 'react';

interface TypingUser {
  userId: string;
  name: string;
  avatar?: string;
}

export const useTypingIndicator = () => {
  const [typingUsers, setTypingUsers] = useState<Map<string, TypingUser>>(new Map());
  const timeoutsRef = useRef<Map<string, number>>(new Map());

  const handleTypingUpdate = useCallback((typingUser: TypingUser, isTyping: boolean) => {
    setTypingUsers(prev => {
      const next = new Map(prev);
      
      // Clear existing timeout for this user
      const existingTimeout = timeoutsRef.current.get(typingUser.userId);
      if (existingTimeout) {
        window.clearTimeout(existingTimeout);
        timeoutsRef.current.delete(typingUser.userId);
      }

      if (isTyping) {
        next.set(typingUser.userId, typingUser);
        
        // Auto remove after 3 seconds
        const timeout = window.setTimeout(() => {
          setTypingUsers(current => {
            const updated = new Map(current);
            updated.delete(typingUser.userId);
            return updated;
          });
          timeoutsRef.current.delete(typingUser.userId);
        }, 3000);
        
        timeoutsRef.current.set(typingUser.userId, timeout);
      } else {
        next.delete(typingUser.userId);
      }
      
      return next;
    });
  }, []);

  const clearTyping = useCallback(() => {
    // Clear all timeouts
    timeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
    timeoutsRef.current.clear();
    setTypingUsers(new Map());
  }, []);

  return { 
    typingUsers: Array.from(typingUsers.values()), 
    handleTypingUpdate,
    clearTyping
  };
};
