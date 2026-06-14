import { useState, useEffect, useCallback } from 'react';

export function useResizer(initialWidth, minWidth = 200, maxWidth = 800, reverse = false) {
  const [width, setWidth] = useState(initialWidth);
  const [isDragging, setIsDragging] = useState(false);

  const startDrag = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e) => {
      let newWidth;
      if (reverse) {
        // For right-aligned panels, width is window.innerWidth - clientX
        newWidth = window.innerWidth - e.clientX - 16; // 16px for margin
      } else {
        // For left-aligned panels, width is clientX
        newWidth = e.clientX - 16; // 16px for margin
      }
      
      if (newWidth >= minWidth && newWidth <= maxWidth) {
        setWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, minWidth, maxWidth, reverse]);

  return { width, startDrag, isDragging };
}
