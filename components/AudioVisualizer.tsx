
import React, { useEffect, useRef } from 'react';
import { AudioVisualizerProps } from '../types';

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ stream, isRecording }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!stream) {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    const audioCtx = audioCtxRef.current;
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;

    const draw = () => {
      animationId = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height;
        const hue = isRecording ? 0 : 220; 
        const lightness = isRecording ? 50 : 40;

        ctx.fillStyle = `hsl(${hue}, 80%, ${lightness}%)`;
        const y = (canvas.height - barHeight) / 2;
        
        ctx.beginPath();
        // Fallback for ctx.roundRect
        if ((ctx as any).roundRect) {
          (ctx as any).roundRect(x, y, barWidth - 2, barHeight, 4);
        } else {
          ctx.rect(x, y, barWidth - 2, barHeight);
        }
        ctx.fill();

        x += barWidth;
      }
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
      source.disconnect();
      analyser.disconnect();
    };
  }, [stream, isRecording]);

  useEffect(() => {
    return () => {
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
    };
  }, []);

  return (
    <div className="relative w-full h-32 flex items-center justify-center bg-slate-900 rounded-xl overflow-hidden border border-slate-700">
      <canvas 
        ref={canvasRef} 
        width={300} 
        height={100} 
        className="w-full h-full"
      />
      {!stream && <div className="absolute text-slate-700 text-[10px] font-bold tracking-[0.2em] uppercase">Input Idle</div>}
    </div>
  );
};

export default AudioVisualizer;
