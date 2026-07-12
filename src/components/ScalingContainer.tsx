import React, { useState, useEffect, useRef } from 'react';

interface ScalingContainerProps {
  children: React.ReactNode;
}

export const ScalingContainer: React.FC<ScalingContainerProps> = ({ children }) => {
  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const baseWidth = 1920;
  const baseHeight = 1080;

  useEffect(() => {
    const handleResize = () => {
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      
      const scaleX = windowWidth / baseWidth;
      const scaleY = windowHeight / baseHeight;
      
      // Use the smaller scale to ensure it fits both dimensions
      const newScale = Math.min(scaleX, scaleY);
      setScale(newScale);
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // Initial call

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div 
      className="w-screen h-screen overflow-hidden flex items-center justify-center bg-black"
    >
      <div 
        ref={containerRef}
        style={{
          width: `${baseWidth}px`,
          height: `${baseHeight}px`,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          flexShrink: 0,
          willChange: 'transform',
          backfaceVisibility: 'hidden'
        } as React.CSSProperties}
        className="relative shadow-2xl overflow-hidden bg-black"
      >
        {children}
      </div>
    </div>
  );
};
