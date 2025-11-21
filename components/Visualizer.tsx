
import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  volume: number;
  isActive: boolean;
}

const Visualizer: React.FC<VisualizerProps> = ({ volume, isActive }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let offset = 0;

    const animate = () => {
      if (!canvas) return;
      
      // High DPI scaling
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      
      // Only update size if changed to avoid flickering
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
          canvas.width = rect.width * dpr;
          canvas.height = rect.height * dpr;
          ctx.scale(dpr, dpr);
      }
      
      const width = rect.width;
      const height = rect.height;
      const centerY = height / 2;

      ctx.clearRect(0, 0, width, height);

      // Draw background line (inactive state)
      if (!isActive) {
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.lineTo(width, centerY);
        ctx.strokeStyle = '#e0e7ff'; 
        ctx.lineWidth = 2;
        ctx.stroke();
        return;
      }

      // Visualizer Settings
      const colors = ['#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe']; 
      const minAmplitude = 5;
      // Sensitivity multiplier
      const sensitivity = 400; 
      
      // Draw multiple waves
      colors.forEach((color, i) => {
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        
        const waveFrequency = 0.01 + (i * 0.005);
        const waveSpeed = 0.1 + (i * 0.05);
        // Calculate amplitude based on volume
        const amp = minAmplitude + (Math.min(0.5, volume) * sensitivity * (1 - i * 0.2));
        
        for (let x = 0; x < width; x++) {
          // Window function (Hanning-like) to taper ends
          const window = Math.sin((x / width) * Math.PI);
          
          const y = centerY + 
            Math.sin(x * waveFrequency + offset * waveSpeed) * 
            amp * 
            window;
            
          ctx.lineTo(x, y);
        }

        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.stroke();
      });

      offset += 0.2;
      requestRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isActive, volume]);

  return (
    <canvas 
      ref={canvasRef} 
      className="w-full h-32 rounded-xl bg-white"
      style={{ width: '100%', height: '128px' }}
    />
  );
};

export default Visualizer;
