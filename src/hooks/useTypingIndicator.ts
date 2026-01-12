import { useState, useCallback, useRef, useEffect } from 'react';

interface TypingUser {
  userId: string;
  name: string;
  avatar?: string;
}

export const useTypingIndicator = () => {
  const [typingUsers, setTypingUsers] = useState<Map<string, TypingUser>>(new Map());
  const timeoutsRef = useRef<Map<string, number>>(new Map());

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
      timeoutsRef.current.clear();
    };
  }, []);

  const handleTypingUpdate = useCallback((typingUser: TypingUser, isTyping: boolean) => {
    setTypingUsers(prev => {
      const next = new Map(prev);
      const { userId } = typingUser;
      
      // Always clear existing timeout for this user first
      const existingTimeout = timeoutsRef.current.get(userId);
      if (existingTimeout) {
        window.clearTimeout(existingTimeout);
        timeoutsRef.current.delete(userId);
      }

      if (isTyping) {
        // Add user to state
        next.set(userId, typingUser);
        
        // Auto remove after 3 seconds of inactivity
        const timeout = window.setTimeout(() => {
          setTypingUsers(current => {
            const updated = new Map(current);
            updated.delete(userId);
            return updated;
          });
          timeoutsRef.current.delete(userId);
        }, 3000);
        
        timeoutsRef.current.set(userId, timeout);
      } else {
        // Remove user immediately
        next.delete(userId);
      }
      
      return next;
    });
  }, []);

  const clearTyping = useCallback(() => {
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
