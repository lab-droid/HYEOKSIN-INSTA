import { useState, useEffect } from 'react';
import { AspectRatio, CarouselSegment, InstagramPostData } from './types';
import { generatePlan, generateImage, getApiKey, generateInstagramPost } from './services/ai';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { Loader2, Download, Image as ImageIcon, LayoutTemplate, Settings2, Key, ChevronRight, Sparkles, Wand2, Heart, MessageCircle, Send, Bookmark, MoreHorizontal, Copy, CheckCircle2, CircleDashed, Search, ArrowRight, Home, Upload, X } from 'lucide-react';
import ApiKeyManager from './components/ApiKeyManager';
import { motion } from 'motion/react';

type WorkflowState = 'idle' | 'planning' | 'generating_images' | 'generating_caption' | 'completed';
type ScreenState = 'home' | 'planner';

export default function App() {
  const [screen, setScreen] = useState<ScreenState>('home');
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState<number>(5);
  const [ratio, setRatio] = useState<AspectRatio>('1:1');
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [segments, setSegments] = useState<CarouselSegment[]>([]);
  const [postData, setPostData] = useState<InstagramPostData | null>(null);
  const [workflowState, setWorkflowState] = useState<WorkflowState>('idle');
  const [hasApiKey, setHasApiKey] = useState(true);
  const [isKeyManagerOpen, setIsKeyManagerOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    checkApiKey();
  }, []);

  const checkApiKey = () => {
    const key = getApiKey();
    setHasApiKey(!!key);
  };

  const handleGoHome = () => {
    setTopic('');
    setSegments([]);
    setReferenceImages([]);
    setPostData(null);
    setWorkflowState('idle');
    setScreen('home');
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (referenceImages.length + files.length > 20) {
      alert('참고 이미지는 최대 20장까지만 업로드 가능합니다.');
      return;
    }
    
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setReferenceImages(prev => [...prev, event.target!.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removeReferenceImage = (index: number) => {
    setReferenceImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleStartAutomation = async () => {
    if (!hasApiKey) {
      setIsKeyManagerOpen(true);
      return;
    }
    if (!topic) return;
    
    setSegments([]);
    setPostData(null);
    setCopied(false);
    
    try {
      // Step 1: Planning
      setWorkflowState('planning');
      const plan = await generatePlan(topic, count, ratio, referenceImages);
      setSegments(plan);

      // Step 2: Images
      setWorkflowState('generating_images');
      const newSegments = [...plan];
      for (let i = 0; i < newSegments.length; i++) {
        const imgUrl = await generateImage(newSegments[i], ratio, referenceImages);
        newSegments[i].imageUrl = imgUrl;
        setSegments([...newSegments]); // Update UI progressively
      }

      // Step 3: Caption & Hashtags
      setWorkflowState('generating_caption');
      const post = await generateInstagramPost(topic, newSegments);
      setPostData(post);

      // Done
      setWorkflowState('completed');
    } catch (e: any) {
      console.error(e);
      setWorkflowState('idle');
      if (e.message?.includes('Requested entity was not found')) {
        setHasApiKey(false);
        alert('API 키가 유효하지 않습니다. 다시 선택해주세요.');
      } else {
        alert(`자동화 처리 중 오류가 발생했습니다: ${e.message}`);
      }
    }
  };

  const handleCopy = () => {
    if (!postData) return;
    const textToCopy = `${postData.caption}\n\n${postData.hashtags.join(' ')}`;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadImage = (url: string, filename: string) => {
    saveAs(url, filename);
  };

  const downloadAll = async () => {
    const zip = new JSZip();
    let hasImages = false;
    segments.forEach((seg, idx) => {
      if (seg.imageUrl) {
        hasImages = true;
        const base64Data = seg.imageUrl.split(',')[1];
        zip.file(`slide_${idx + 1}.png`, base64Data, { base64: true });
      }
    });
    if (!hasImages) return;
    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, 'carousel_images.zip');
  };

  const downloadMergedPNG = async () => {
    const validSegments = segments.filter(seg => seg.imageUrl);
    if (validSegments.length === 0) return;

    try {
      const loadedImages = await Promise.all(validSegments.map(seg => {
        return new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = seg.imageUrl!;
        });
      }));

      const maxWidth = Math.max(...loadedImages.map(img => img.width));
      const totalHeight = loadedImages.reduce((sum, img) => sum + img.height, 0);

      const canvas = document.createElement('canvas');
      canvas.width = maxWidth;
      canvas.height = totalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      let currentY = 0;
      loadedImages.forEach(img => {
        ctx.drawImage(img, 0, currentY, img.width, img.height);
        currentY += img.height;
      });

      canvas.toBlob((blob) => {
        if (blob) saveAs(blob, 'carousel_merged.png');
      }, 'image/png');
    } catch (e) {
      console.error("Failed to merge images", e);
      alert("이미지 병합에 실패했습니다.");
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 font-sans selection:bg-indigo-500/30 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] opacity-20 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-500 via-purple-500 to-transparent blur-[100px] rounded-full mix-blend-screen" />
      </div>

      <header className="border-b border-white/5 bg-zinc-950/50 backdrop-blur-xl sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div 
            className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={handleGoHome}
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <LayoutTemplate className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-400">
              혁신 캐러셀 AI
            </h1>
          </div>
          <button
            onClick={() => setIsKeyManagerOpen(true)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-all shadow-sm ${
              hasApiKey 
                ? 'bg-zinc-900 border border-white/10 hover:bg-zinc-800 text-zinc-300' 
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/25'
            }`}
          >
            <Key className="w-4 h-4" />
            <span>{hasApiKey ? 'API 키 관리' : 'API 키 설정'}</span>
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        {screen === 'home' ? (
          <div className="flex flex-col items-center justify-center py-12 sm:py-20 min-h-[75vh]">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center max-w-3xl mx-auto"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-sm font-medium mb-8">
                <Sparkles className="w-4 h-4" />
                Gemini 3.1 Pro & Nano Banana Powered
              </div>
              <h2 className="text-5xl sm:text-6xl font-bold text-white tracking-tight mb-6 leading-tight">
                단 한 줄의 주제로<br />
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
                  완벽한 인스타그램 캐러셀을.
                </span>
              </h2>
              <p className="text-lg text-zinc-400 mb-10 leading-relaxed max-w-2xl mx-auto">
                구글 딥리서치 기반의 탄탄한 기획부터 고품질 인포그래픽 이미지, 알고리즘에 최적화된 캡션까지 원클릭으로 완성하세요.
              </p>
              <button
                onClick={() => setScreen('planner')}
                className="inline-flex items-center gap-2 bg-white text-black hover:bg-zinc-200 font-bold text-lg px-8 py-4 rounded-2xl transition-all shadow-xl shadow-white/10 hover:shadow-white/20 hover:-translate-y-1"
              >
                시작하기
                <ArrowRight className="w-5 h-5" />
              </button>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-24 w-full"
            >
              <div className="bg-zinc-900/50 backdrop-blur-sm border border-white/5 p-8 rounded-3xl text-left">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-6 border border-blue-500/20">
                  <Search className="w-6 h-6 text-blue-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-3">구글 딥리서치 기획</h3>
                <p className="text-zinc-400 leading-relaxed">최신 트렌드와 신뢰할 수 있는 팩트 기반 데이터를 수집하여 후킹부터 클로징까지 완벽한 논리를 설계합니다.</p>
              </div>
              <div className="bg-zinc-900/50 backdrop-blur-sm border border-white/5 p-8 rounded-3xl text-left">
                <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-6 border border-purple-500/20">
                  <ImageIcon className="w-6 h-6 text-purple-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-3">고품질 인포그래픽</h3>
                <p className="text-zinc-400 leading-relaxed">나노바나나 모델을 활용하여 한국어 텍스트가 완벽하게 렌더링된 세련된 디자인의 이미지를 자동 생성합니다.</p>
              </div>
              <div className="bg-zinc-900/50 backdrop-blur-sm border border-white/5 p-8 rounded-3xl text-left">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-6 border border-emerald-500/20">
                  <MessageCircle className="w-6 h-6 text-emerald-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-3">알고리즘 최적화 캡션</h3>
                <p className="text-zinc-400 leading-relaxed">인스타그램 노출에 최적화된 본문 캡션과 해시태그를 함께 생성하여 즉시 업로드 가능한 상태로 제공합니다.</p>
              </div>
            </motion.div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Sidebar - Controls */}
            <div className="lg:col-span-4 space-y-6">
          <div className="bg-zinc-900/60 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-6 text-white">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              AI 기획 에이전트
            </h2>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">주제 (Topic)</label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="예: 직장인을 위한 시간 관리 비법"
                  className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-white placeholder:text-zinc-600"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-zinc-400">
                    장수 (Slides)
                  </label>
                  <span className="text-sm font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-md">{count}장</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={count}
                  onChange={(e) => setCount(parseInt(e.target.value))}
                  className="w-full accent-indigo-500 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">비율 (Aspect Ratio)</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setRatio('1:1')}
                    className={`py-3.5 rounded-2xl border text-sm font-medium transition-all ${
                      ratio === '1:1' 
                        ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300 shadow-inner shadow-indigo-500/20' 
                        : 'bg-black/40 border-white/5 text-zinc-400 hover:border-white/20 hover:bg-zinc-800/50'
                    }`}
                  >
                    1:1 (피드용)
                  </button>
                  <button
                    onClick={() => setRatio('4:5')}
                    className={`py-3.5 rounded-2xl border text-sm font-medium transition-all ${
                      ratio === '4:5' 
                        ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300 shadow-inner shadow-indigo-500/20' 
                        : 'bg-black/40 border-white/5 text-zinc-400 hover:border-white/20 hover:bg-zinc-800/50'
                    }`}
                  >
                    4:5 (세로형)
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-zinc-400">참고 이미지 (선택, 최대 20장)</label>
                  <span className="text-xs text-zinc-500">{referenceImages.length}/20</span>
                </div>
                
                <div className="bg-black/40 border border-white/5 rounded-2xl p-4">
                  {referenceImages.length > 0 && (
                    <div className="flex flex-wrap gap-3 mb-4">
                      {referenceImages.map((img, idx) => (
                        <div key={idx} className="relative w-16 h-16 rounded-xl overflow-hidden border border-white/10 group">
                          <img src={img} alt={`Ref ${idx}`} className="w-full h-full object-cover" />
                          <button
                            onClick={() => removeReferenceImage(idx)}
                            className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-4 h-4 text-white" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <label className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-dashed border-white/20 text-sm font-medium text-zinc-400 hover:text-white hover:border-white/40 hover:bg-white/5 transition-all cursor-pointer ${referenceImages.length >= 20 ? 'opacity-50 pointer-events-none' : ''}`}>
                    <Upload className="w-4 h-4" />
                    이미지 업로드
                    <input 
                      type="file" 
                      accept="image/*" 
                      multiple 
                      className="hidden" 
                      onChange={handleImageUpload}
                      disabled={referenceImages.length >= 20}
                    />
                  </label>
                </div>
              </div>

              <button
                onClick={handleStartAutomation}
                disabled={!topic || workflowState !== 'idle'}
                className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:from-zinc-800 disabled:to-zinc-800 disabled:text-zinc-500 text-white font-semibold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 mt-2 shadow-lg shadow-indigo-500/25 disabled:shadow-none"
              >
                {workflowState !== 'idle' ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    자동화 진행 중...
                  </>
                ) : (
                  <>
                    AI 자동 생성 시작
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Workflow Progress */}
          {workflowState !== 'idle' && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-zinc-900/60 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl"
            >
              <h2 className="text-lg font-semibold flex items-center gap-2 mb-4 text-white">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                생성 진행 상황
              </h2>
              <div className="space-y-4">
                <StepItem 
                  status={workflowState === 'planning' ? 'active' : (workflowState === 'idle' ? 'pending' : 'completed')} 
                  label="1. 딥리서치 및 기획안 생성" 
                />
                <StepItem 
                  status={workflowState === 'generating_images' ? 'active' : (['idle', 'planning'].includes(workflowState) ? 'pending' : 'completed')} 
                  label="2. 고품질 이미지 렌더링" 
                />
                <StepItem 
                  status={workflowState === 'generating_caption' ? 'active' : (['idle', 'planning', 'generating_images'].includes(workflowState) ? 'pending' : 'completed')} 
                  label="3. 캡션 및 해시태그 생성" 
                />
              </div>
            </motion.div>
          )}

          {segments.some(s => s.imageUrl) && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-zinc-900/60 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl"
            >
              <h2 className="text-lg font-semibold flex items-center gap-2 mb-4 text-white">
                <Download className="w-5 h-5 text-emerald-400" />
                결과물 다운로드
              </h2>
              <div className="space-y-3">
                <button
                  onClick={downloadAll}
                  className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-medium py-3.5 rounded-2xl transition-all flex items-center justify-center gap-2 border border-white/5"
                >
                  <Download className="w-4 h-4" />
                  전체 일괄 다운로드 (ZIP)
                </button>
                <button
                  onClick={downloadMergedPNG}
                  className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-medium py-3.5 rounded-2xl transition-all flex items-center justify-center gap-2 border border-white/5"
                >
                  <LayoutTemplate className="w-4 h-4" />
                  전체 병합 다운로드 (1장 PNG)
                </button>
              </div>

              {workflowState === 'completed' && (
                <div className="mt-6 pt-6 border-t border-white/10">
                  <button
                    onClick={handleGoHome}
                    className="w-full bg-white/5 hover:bg-white/10 text-white font-medium py-3.5 rounded-2xl transition-all flex items-center justify-center gap-2 border border-white/10"
                  >
                    <Home className="w-4 h-4" />
                    홈으로 돌아가기 (새로 만들기)
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </div>

        {/* Main Content - Preview */}
        <div className="lg:col-span-8 space-y-6">
          {segments.length === 0 ? (
            <div className="h-full min-h-[600px] border border-white/5 bg-white/[0.02] rounded-3xl flex flex-col items-center justify-center text-zinc-500 p-8 text-center relative overflow-hidden shadow-2xl">
              {/* Subtle background pattern */}
              <div className="absolute inset-0 opacity-[0.03] bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]"></div>
              
              <div className="relative z-10 flex flex-col items-center">
                <div className="w-20 h-20 rounded-3xl bg-indigo-500/10 flex items-center justify-center mb-6 border border-indigo-500/20 shadow-inner shadow-indigo-500/20">
                  <Wand2 className="w-10 h-10 text-indigo-400" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-3 tracking-tight">주제를 입력하고 시작해보세요</h2>
                <p className="text-zinc-400 max-w-md leading-relaxed">
                  좌측 패널에 주제를 입력하고 'AI 자동 생성 시작' 버튼을 누르면 딥리서치부터 이미지 렌더링까지 모든 과정이 자동으로 진행됩니다.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between bg-zinc-900/40 backdrop-blur-md border border-white/10 px-6 py-4 rounded-2xl">
                <h2 className="text-lg font-semibold text-white">기획 및 렌더링 결과</h2>
                <span className="text-sm font-medium text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full">총 {segments.length}장</span>
              </div>
              
              <div className="grid grid-cols-1 gap-8">
                {segments.map((segment, idx) => (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    key={segment.id} 
                    className="bg-zinc-900/40 backdrop-blur-sm border border-white/10 rounded-3xl overflow-hidden flex flex-col xl:flex-row shadow-xl"
                  >
                    {/* Instagram Mockup Area */}
                    <div className="p-6 border-b xl:border-b-0 xl:border-r border-white/10 flex items-center justify-center bg-black/20">
                      <div className={`bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl flex flex-col ${ratio === '1:1' ? 'w-[320px]' : 'w-[320px]'}`}>
                        {/* IG Header */}
                        <div className="flex items-center justify-between p-3 border-b border-zinc-800 bg-zinc-950">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-500 p-[2px]">
                              <div className="w-full h-full bg-zinc-900 rounded-full flex items-center justify-center">
                                <Sparkles className="w-4 h-4 text-zinc-400" />
                              </div>
                            </div>
                            <span className="text-sm font-semibold text-white">aha_original</span>
                          </div>
                          <MoreHorizontal className="w-5 h-5 text-zinc-500" />
                        </div>
                        
                        {/* IG Image */}
                        <div className={`relative bg-zinc-900 flex items-center justify-center ${ratio === '1:1' ? 'aspect-square' : 'aspect-[4/5]'}`}>
                          {segment.imageUrl ? (
                            <img src={segment.imageUrl} alt={`Slide ${idx + 1}`} className="w-full h-full object-cover" />
                          ) : (
                            <div className="text-zinc-600 flex flex-col items-center gap-3">
                              {workflowState === 'generating_images' ? (
                                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                              ) : (
                                <ImageIcon className="w-10 h-10 opacity-30" />
                              )}
                              <span className="text-xs font-medium uppercase tracking-wider">
                                {workflowState === 'generating_images' ? 'AI가 디자인 중...' : '이미지 대기중'}
                              </span>
                            </div>
                          )}
                        </div>
                        
                        {/* IG Footer */}
                        <div className="p-3 bg-zinc-950">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-4">
                              <Heart className="w-6 h-6 text-white" />
                              <MessageCircle className="w-6 h-6 text-white" />
                              <Send className="w-6 h-6 text-white" />
                            </div>
                            <Bookmark className="w-6 h-6 text-white" />
                          </div>
                          <p className="text-xs text-zinc-400"><span className="font-semibold text-white">aha_original</span> {segment.logicalStep} 단계 디자인 시안입니다.</p>
                        </div>
                      </div>
                    </div>
                    
                    {/* Plan Details Area */}
                    <div className="p-8 flex-1 flex flex-col">
                      <div className="flex items-center gap-3 mb-6">
                        <span className="bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-bold px-3 py-1.5 rounded-lg uppercase tracking-wider">
                          Slide {idx + 1}
                        </span>
                        <span className="text-sm font-semibold text-zinc-300">
                          {segment.logicalStep}
                        </span>
                      </div>
                      
                      <div className="space-y-6 flex-1">
                        <div className="bg-black/20 rounded-2xl p-5 border border-white/5">
                          <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                            <LayoutTemplate className="w-4 h-4" />
                            Key Message (한국어 카피)
                          </h3>
                          <p className="text-lg font-medium leading-snug text-white">
                            {segment.keyMessage}
                          </p>
                        </div>
                        
                        <div className="bg-black/20 rounded-2xl p-5 border border-white/5">
                          <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                            <ImageIcon className="w-4 h-4" />
                            Visual Prompt
                          </h3>
                          <p className="text-sm text-zinc-400 leading-relaxed">
                            {segment.visualPrompt}
                          </p>
                        </div>
                        
                        {segment.imageUrl && (
                          <div className="pt-4 mt-auto">
                            <button
                              onClick={() => downloadImage(segment.imageUrl!, `slide_${idx + 1}.png`)}
                              className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium rounded-xl transition-all flex items-center justify-center gap-2 border border-white/5"
                            >
                              <Download className="w-4 h-4" />
                              이 슬라이드만 다운로드 (PNG)
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Caption & Hashtags Section */}
              {postData && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-zinc-900/40 backdrop-blur-sm border border-white/10 rounded-3xl overflow-hidden shadow-xl mt-8"
                >
                  <div className="p-6 border-b border-white/10 flex items-center justify-between bg-black/20">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                      <MessageCircle className="w-5 h-5 text-indigo-400" />
                      인스타그램 캡션 & 해시태그
                    </h2>
                    <button
                      onClick={handleCopy}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-xl transition-colors text-sm font-medium border border-indigo-500/20"
                    >
                      {copied ? (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          복사 완료
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          내용 복사하기
                        </>
                      )}
                    </button>
                  </div>
                  <div className="p-8">
                    <div className="bg-black/20 rounded-2xl p-6 border border-white/5 whitespace-pre-wrap text-zinc-300 leading-relaxed">
                      {postData.caption}
                      <br /><br />
                      <span className="text-indigo-400 font-medium">{postData.hashtags.join(' ')}</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </div>
      </div>
      )}
      </main>

      <footer className="border-t border-white/5 py-8 mt-12 text-center text-zinc-500 text-sm relative z-10">
        이 앱은 정혁신이 개발하였습니다.
      </footer>

      <ApiKeyManager 
        isOpen={isKeyManagerOpen} 
        onClose={() => setIsKeyManagerOpen(false)} 
        onKeyUpdated={checkApiKey}
      />
    </div>
  );
}

function StepItem({ status, label }: { status: 'pending' | 'active' | 'completed', label: string }) {
  return (
    <div className="flex items-center gap-3">
      {status === 'completed' && <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />}
      {status === 'active' && <Loader2 className="w-5 h-5 text-indigo-400 animate-spin shrink-0" />}
      {status === 'pending' && <CircleDashed className="w-5 h-5 text-zinc-600 shrink-0" />}
      <span className={`text-sm font-medium ${
        status === 'completed' ? 'text-zinc-300' : 
        status === 'active' ? 'text-indigo-400' : 'text-zinc-600'
      }`}>
        {label}
      </span>
    </div>
  );
}
