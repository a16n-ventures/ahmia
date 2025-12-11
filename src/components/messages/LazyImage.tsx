import React, { useState } from 'react';

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  onClick?: () => void;
  onLoad?: () => void;
}

export const LazyImage: React.FC<LazyImageProps> = ({ 
  src, 
  alt, 
  className, 
  onClick, 
  onLoad 
}) => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const handleLoad = () => {
    setLoaded(true);
    if (onLoad) onLoad();
  };

  if (error) {
    return (
      <div className="w-full h-32 flex items-center justify-center bg-muted text-muted-foreground text-xs rounded-xl border border-border/50">
        Failed to load image
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden ${!loaded ? 'bg-muted animate-pulse min-h-[150px]' : ''} ${className}`}>
      <img 
        src={src} 
        alt={alt} 
        className={`transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'} ${className}`}
        onLoad={handleLoad}
        onError={() => setError(true)}
        loading="lazy"
        onClick={onClick}
      />
    </div>
  );
};
