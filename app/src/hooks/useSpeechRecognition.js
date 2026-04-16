import { useCallback, useEffect, useRef, useState } from 'react';

const SpeechRecognition = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;

export function useSpeechRecognition({ lang = 'vi-VN', continuous = true, onResult, onEnd } = {}) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const recognitionRef = useRef(null);

  useEffect(() => {
    setSupported(!!SpeechRecognition);
  }, []);

  const start = useCallback(() => {
    if (!SpeechRecognition || listening) return;
    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.continuous = continuous;
    recognition.interimResults = true;

    let finalText = '';

    recognition.onresult = (event) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += t;
        } else {
          interim += t;
        }
      }
      if (final) {
        finalText += (finalText ? '\n' : '') + final.trim();
        setTranscript(finalText);
        onResult?.(finalText, final.trim());
      }
      setInterimTranscript(interim);
    };

    recognition.onerror = (event) => {
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        console.warn('Speech recognition error:', event.error);
      }
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
      setInterimTranscript('');
      onEnd?.(finalText);
    };

    recognitionRef.current = recognition;
    setTranscript('');
    setInterimTranscript('');
    recognition.start();
    setListening(true);
  }, [lang, continuous, listening, onResult, onEnd]);

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setListening(false);
  }, []);

  const toggle = useCallback(() => {
    if (listening) {
      stop();
    } else {
      start();
    }
  }, [listening, start, stop]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  return { listening, supported, transcript, interimTranscript, start, stop, toggle, setTranscript };
}
