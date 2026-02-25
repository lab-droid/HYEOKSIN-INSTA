import React, { useState, useRef, useEffect } from 'react';
import CryptoJS from 'crypto-js';
import { saveAs } from 'file-saver';
import { GoogleGenAI } from '@google/genai';
import { Key, Upload, Download, CheckCircle, XCircle, Loader2, X } from 'lucide-react';

interface ApiKeyManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onKeyUpdated: () => void;
}

export default function ApiKeyManager({ isOpen, onClose, onKeyUpdated }: ApiKeyManagerProps) {
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem('gemini_api_key');
    if (stored) setApiKey(stored);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTest = async () => {
    if (!apiKey) {
      setMessage('API 키를 입력해주세요.');
      setStatus('error');
      return;
    }
    setStatus('testing');
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: 'Hello',
      });
      if (response.text) {
        setStatus('success');
        setMessage('연결 테스트 성공! 이 키가 앱에 적용됩니다.');
        localStorage.setItem('gemini_api_key', apiKey);
        onKeyUpdated();
      } else {
        throw new Error('No response');
      }
    } catch (e: any) {
      const errorString = typeof e === 'string' ? e : JSON.stringify(e, Object.getOwnPropertyNames(e));
      
      // 503 에러는 모델 과부하 상태이지만, API 키 자체는 유효함을 의미합니다.
      if (errorString.includes('503') || errorString.includes('UNAVAILABLE') || errorString.includes('high demand')) {
        setStatus('success');
        setMessage('API 키가 유효합니다! (현재 구글 서버에 일시적인 트래픽이 있으나 키는 정상 등록되었습니다.)');
        localStorage.setItem('gemini_api_key', apiKey);
        onKeyUpdated();
      } else {
        setStatus('error');
        setMessage(`연결 실패: ${e.message || '알 수 없는 오류가 발생했습니다.'}`);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900/50">
          <h3 className="text-lg font-medium flex items-center gap-2">
            <Key className="w-5 h-5 text-indigo-400" />
            외부 API 키 관리
          </h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">Gemini API Key</label>
            <input
              id="apiKeyInput"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AI Studio API 키 입력"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
            />
          </div>

          <div className="pt-2">
            <button
              onClick={handleTest}
              disabled={status === 'testing'}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white font-medium py-3 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              {status === 'testing' ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
              연결 테스트 및 적용
            </button>
          </div>

          {message && (
            <div className={`p-3 rounded-lg text-sm flex items-start gap-2 ${status === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
              {status === 'success' ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" /> : <XCircle className="w-4 h-4 mt-0.5 shrink-0" />}
              <p className="break-all">{message}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
