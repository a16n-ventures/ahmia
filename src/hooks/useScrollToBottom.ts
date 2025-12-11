import { useRef, useEffect, useCallback } from 'react';
import { Message } from '@/types/messages';

export const useScrollToBottom = (messages: Message[]) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const scrollToBottom = useCallback((smooth = true) => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;
    requestAnimationFrame(() => {
      scrollContainer.scrollTo({ 
        top: scrollContainer.scrollHeight, 
        behavior: smooth ? 'smooth' : 'auto' 
      });
    });
  }, []);

  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;
    
    requestAnimationFrame(() => {
      const lastMessage = messages[messages.length - 1];
      const isCloseToBottom = scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight < 200;
      const isMe = lastMessage?.is_me;
      
      if (isCloseToBottom || isMe) {
        scrollToBottom();
      }
    });
  }, [messages.length, messages[messages.length - 1]?.id, scrollToBottom]);
  
  return { scrollRef, scrollToBottom };
};
