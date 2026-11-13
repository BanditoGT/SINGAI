import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play, X } from 'lucide-react';

export default function SignVideo({ src, autoplay = true, loop = false, onEnded }) {
  const media = useRef(null); const [paused, setPaused] = useState(!autoplay); const [error, setError] = useState('');
  useEffect(() => {
    const video = media.current; if (!video) return;
    setError(''); setPaused(!autoplay);
    video.muted = true;
    if (!autoplay) { video.pause(); return; }
    const start = () => video.play().catch(() => setPaused(true));
    if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) start();
    else video.addEventListener('canplay', start, { once: true });
    return () => video.removeEventListener('canplay', start);
  }, [src, autoplay]);
  const toggle = () => {
    const video = media.current; if (!video) return;
    setError(''); video.muted = true;
    if (video.paused) {
      if (video.ended) video.currentTime = 0;
      video.play().catch(() => setPaused(true));
    }
    else video.pause();
  };
  return <><video ref={media} className={src.split("?")[0].startsWith("/multimedia/") ? "video-original" : undefined} src={src} autoPlay={autoplay} loop={loop} muted playsInline preload="auto"
    onPlay={() => { setPaused(false); setError(''); }} onPause={() => setPaused(true)}
    onError={() => setError('No se pudo cargar este video.')} onEnded={onEnded}/>
    <button type="button" className="video-toggle" onClick={toggle} aria-label={paused ? 'Reproducir video' : 'Pausar video'} title={paused ? 'Reproducir' : 'Pausar'}>{paused ? <Play/> : <Pause/>}</button>
    {error && <div className="video-error"><X/>{error}</div>}</>;
}
