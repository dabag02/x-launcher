import React, { createContext, useContext, useCallback } from 'react';

type SoundType = 'focus' | 'select' | 'back' | 'launch';

interface AudioContextType {
  play: (type: SoundType) => void;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

const SOUNDS: Record<SoundType, string> = {
  focus: 'https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3',
  select: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3',
  back: 'https://assets.mixkit.co/active_storage/sfx/2567/2567-preview.mp3',
  launch: 'https://assets.mixkit.co/active_storage/sfx/2569/2569-preview.mp3'
};

export const AudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const play = useCallback((type: SoundType) => {
    const audio = new Audio(SOUNDS[type]);
    audio.volume = 0.5;
    audio.play().catch(() => {}); // Browser might block if no interaction
  }, []);

  return (
    <AudioContext.Provider value={{ play }}>
      {children}
    </AudioContext.Provider>
  );
};

export const useAudio = () => {
  const context = useContext(AudioContext);
  if (!context) throw new Error('useAudio must be used within AudioProvider');
  return context;
};
