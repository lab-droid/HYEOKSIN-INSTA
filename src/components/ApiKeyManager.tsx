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
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem('CUSTOM_GEMINI_API_KEY');
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
        localStorage.setItem('CUSTOM_GEMINI_API_KEY', apiKey);
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
        localStorage.setItem('CUSTOM_GEMINI_API_KEY', apiKey);
        onKeyUpdated();
      } else {
        setStatus('error');
        setMessage(`연결 실패: ${e.message || '알 수 없는 오류가 발생했습니다.'}`);
      }
    }
  };

  const handleSave = () => {
    if (!apiKey || !password) {
      alert('API 키와 암호화 비밀번호를 모두 입력해주세요.');
      return;
    }
    try {
      const data = JSON.stringify({ GEMINI_API_KEY: apiKey });
      const encrypted = CryptoJS.AES.encrypt(data, password).toString();
      const blob = new Blob([encrypted], { type: 'text/plain;charset=utf-8' });
      saveAs(blob, 'api-keys.enc');
      localStorage.setItem('CUSTOM_GEMINI_API_KEY', apiKey);
      onKeyUpdated();
      alert('로컬 드라이브에 안전하게 저장되었습니다.');
    } catch (e) {
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  const handleLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!password) {
      alert('복호화를 위해 먼저 비밀번호를 입력해주세요.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const encrypted = event.target?.result as string;
        const decryptedBytes = CryptoJS.AES.decrypt(encrypted, password);
        const decryptedText = decryptedBytes.toString(CryptoJS.enc.Utf8);
        if (!decryptedText) throw new Error('복호화 실패');
        
        const parsed = JSON.parse(decryptedText);
        if (parsed.GEMINI_API_KEY) {
          setApiKey(parsed.GEMINI_API_KEY);
          localStorage.setItem('CUSTOM_GEMINI_API_KEY', parsed.GEMINI_API_KEY);
          onKeyUpdated();
          alert('API 키를 성공적으로 불러왔습니다. 연결 테스트를 진행해보세요.');
        }
      } catch (err) {
        alert('파일을 읽거나 복호화하는 데 실패했습니다. 비밀번호를 확인해주세요.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
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
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AI Studio API 키 입력"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">암호화/복호화 비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="로컬 파일 저장/불러오기용 비밀번호"
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

          <div className="grid grid-cols-2 gap-3 pt-4 border-t border-zinc-800">
            <button
              onClick={handleSave}
              className="bg-zinc-800 hover:bg-zinc-700 text-white font-medium py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
            >
              <Download className="w-4 h-4" />
              로컬 저장 (.enc)
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="bg-zinc-800 hover:bg-zinc-700 text-white font-medium py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
            >
              <Upload className="w-4 h-4" />
              로컬 불러오기
            </button>
            <input
              type="file"
              accept=".enc"
              ref={fileInputRef}
              onChange={handleLoad}
              className="hidden"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
