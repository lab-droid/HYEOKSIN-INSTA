import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { AspectRatio, CardnewsSegment, InstagramPostData } from "../types";

export const getApiKey = () => {
  // 플랫폼에서 선택한 키 (GEMINI_API_KEY)를 최우선으로 사용합니다. 
  // 이는 구 버전의 수동 입력 키가 남아있어 403 오류가 발생하는 것을 방지하기 위함입니다.
  return process.env.GEMINI_API_KEY || localStorage.getItem('gemini_api_key') || process.env.API_KEY;
};

async function withRetry<T>(fn: () => Promise<T>, maxRetries: number = 10): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // 타임아웃을 180초로 대폭 증가 (고부하 환경에서는 생성 시간이 길어질 수 있음)
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Request Timeout")), 180000)
      );
      return await Promise.race([fn(), timeoutPromise]) as T;
    } catch (e: any) {
      lastError = e;
      const errorString = typeof e === 'string' ? e : JSON.stringify(e, Object.getOwnPropertyNames(e));
      
      // 재시도 대상 에러 범위 확장: 503, 429(Quota), 시간초과, 과부하, 서버 점검 등
      const isRetryable = 
        errorString.includes('503') || 
        errorString.includes('429') ||
        errorString.includes('Deadline expired') || 
        errorString.includes('high demand') || 
        errorString.includes('overloaded') ||
        errorString.includes('UNAVAILABLE') ||
        errorString.includes('Timeout') ||
        errorString.includes('rate limit') ||
        errorString.includes('quota') ||
        errorString.includes('No image data');

      if (isRetryable) {
        if (attempt < maxRetries) {
          // 지수 백오프 + 지터(Jitter) 최적화
          // 초반에는 빠르게 재시도하다가, 뒤로 갈수록 대기 시간을 대폭 늘림 (서버 회복 기간 확보)
          const baseDelay = Math.min(Math.pow(2, attempt) * 3000, 45000); 
          const jitter = Math.random() * 2000;
          const delay = baseDelay + jitter;
          
          console.log(`[Attempt ${attempt}/${maxRetries}] AI Service busy, retrying in ${Math.round(delay/1000)}s...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
      throw e;
    }
  }
  throw lastError;
}

export async function generatePlan(
  topic: string, 
  count: number | 'auto', 
  ratio: AspectRatio, 
  referenceImages: string[] = [], 
  contentDraft?: string,
  design: string = 'AI 자동추천',
  referenceContent?: string
): Promise<CardnewsSegment[]> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API Key is missing.");
  
  // 기획안 생성 속도 최적화를 위해 Flash Lite 모델을 최우선 사용
  const models = ["gemini-3.1-flash-lite-preview", "gemini-3-flash-preview", "gemini-3.1-pro-preview"];
  let lastError: any;

  for (const modelName of models) {
    try {
      console.log(`Attempting plan generation with model: ${modelName} (Speed Optimized)`);
      return await withRetry(async () => {
        const ai = new GoogleGenAI({ apiKey });
        const promptText = `
당신은 대한민국 최고의 SNS 콘텐츠 바이럴 전략가이자 딥리서치 전문가입니다.
${referenceContent ? `제공된 '참고할 내용'을 최우선으로 분석하여 기획안을 작성하세요.\n참고할 내용: ${referenceContent}\n` : ''}
${contentDraft ? `제공된 '콘텐츠 초안' 내용을 참고하여 기획안을 작성하세요.\n콘텐츠 초안: ${contentDraft}\n` : (referenceContent ? '' : '구글 검색을 활용하여 사용자의 주제와 관련된 가장 최신의, 신뢰할 수 있는 고품질 데이터와 트렌드를 깊이 있게 조사(Deep Research)하세요.')}
조사한 팩트 기반의 정보를 바탕으로 ${count === 'auto' ? '주제에 가장 적합한 장수(보통 4~10장 사이)' : `장수(${count}장)`}에 맞춰 논리적 흐름을 짜주세요.

논리 구조 적용: Hook(후킹) -> Info(정보 전달, 구체적 수치나 팩트 포함) -> Solution(해결책) -> Closing(마무리) 순으로 자동 구성.
한국어 카피는 트렌디하고 직관적이어야 합니다.
제약: 카피 내 영어를 절대 쓰지 마세요. Premium 대신 '최고급', Best 대신 '최고의'를 사용하세요.
중요: 모든 슬라이드의 상단 중앙(Top 20%)은 로고를 위한 '세이프 존'입니다. 카피가 너무 길어지지 않도록 주의하고, 시각적 요소들이 하단과 중앙에 집중되도록 기획하세요.

디자인 스타일: ${design === 'AI 자동추천' ? '주제에 가장 어울리는 세련된 인포그래픽 스타일' : design}
비주얼 프롬프트(visualPrompt) 작성 시, 선택된 디자인 스타일을 반영하여 정보성 인포그래픽(표, 리스트, 그리드, 아이콘, 뱃지 등) 스타일로 구성되도록 영어로 상세히 묘사해주세요. (예: "A dark mode infographic table with neon badges...", "A clean light green background list with bar charts...")
${referenceImages.length > 0 ? '\n중요: 첨부된 참고 이미지들의 디자인 스타일, 톤앤매너, 색감, 레이아웃을 완벽하게 분석하여 visualPrompt 묘사에 반영하세요.' : ''}

주제: ${topic}
장수: ${count === 'auto' ? 'AI 추천' : `${count}장`}
사이즈: ${ratio}
`;

        const parts: any[] = [{ text: promptText }];
        for (const img of referenceImages) {
          const mimeType = img.match(/data:(.*?);base64/)?.[1] || 'image/jpeg';
          const data = img.split(',')[1];
          if (data) {
            parts.push({ inlineData: { data, mimeType } });
          }
        }

        const response = await ai.models.generateContent({
          model: modelName,
          contents: { parts },
          config: {
            tools: [{ googleSearch: {} }],
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.INTEGER, description: "슬라이드 번호 (1부터 시작)" },
                  logicalStep: { type: Type.STRING, description: "논리 단계 (예: Hook, Info, Solution, Closing)" },
                  keyMessage: { type: Type.STRING, description: "이미지에 렌더링될 100% 한글 카피" },
                  visualPrompt: { type: Type.STRING, description: "Imagen 3 전용 비주얼 묘사 (영어)" }
                },
                required: ["id", "logicalStep", "keyMessage", "visualPrompt"]
              }
            },
            // 속도 최적화
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
          }
        });

        const text = response.text;
        if (!text) throw new Error("Failed to generate plan");
        trackUsage('plan');
        return JSON.parse(text) as CardnewsSegment[];
      }, 2);
    } catch (e) {
      console.warn(`Plan generation failed with ${modelName}, trying next model...`, e);
      lastError = e;
    }
  }
  throw lastError;
}

export async function generateImage(segment: CardnewsSegment, ratio: AspectRatio, referenceImages: string[] = []): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("API Key is missing.");
  }
  
  // 사용자 요청: 한글 깨짐이 절대 없는 나노바나나2(gemini-3.1-flash-image-preview) 모델만 엄격히 사용합니다.
  // 다른 모델로의 자동 폴백을 제거하여 최상의 한글 렌더링 품질을 보장합니다.
  const models = ['gemini-3.1-flash-image-preview'];
  let lastError: any;

  for (const modelName of models) {
    try {
      console.log(`[Image] Strictly using ${modelName} for perfect Korean rendering...`);
      
      return await withRetry(async () => {
        const aiImage = new GoogleGenAI({ apiKey });
        
        const promptText = `
  Create a professional, high-end infographic image for a Korean Instagram cardnews.
  
  CRITICAL REQUIREMENT: You MUST render the Korean text below perfectly. 
  NO character corruption, NO typos, NO overlapping text. Use a clean, modern typeface.
  Text: "${segment.keyMessage}"
  
  Safety: Keep the top 20% area COMPLETELY EMPTY for a logo.
  Visual Style: ${segment.visualPrompt}
  Style: Clean, professional, minimal, high contrast, high resolution.
  `;

        const parts: any[] = [{ text: promptText }];
        for (const img of referenceImages) {
          const mimeType = img.match(/data:(.*?);base64/)?.[1] || 'image/jpeg';
          const data = img.split(',')[1];
          if (data) {
            parts.push({ inlineData: { data, mimeType } });
          }
        }

        const config: any = {
          imageConfig: {
            aspectRatio: ratio,
            imageSize: "1K"
          }
        };

        const response = await aiImage.models.generateContent({
          model: modelName,
          contents: { parts },
          config
        });

        if (response.candidates?.[0]?.content?.parts) {
          for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
              trackUsage('image');
              return `data:image/png;base64,${part.inlineData.data}`;
            }
          }
        }
        
        throw new Error("No image data in response candidates");
      }, 5); // 모델별 재시도 횟수를 적절히 조정하여 장애 발생 시 다음 모델로 빠르게 넘어가도록 함
    } catch (e: any) {
      const errorString = typeof e === 'string' ? e : JSON.stringify(e, Object.getOwnPropertyNames(e));
      
      // 403 PERMISSION_DENIED: 사용자가 특정 모델에 대한 권한이 없는 경우
      if (errorString.includes('403') || errorString.includes('PERMISSION_DENIED')) {
        console.warn(`${modelName} is not permitted, trying next high-quality model...`);
        lastError = new Error(`권한 오류(403): ${modelName} 모델을 사용할 권한이 없습니다. 상단 '설정(Key)' 메뉴에서 [플랫폼 API 키 선택]을 통해 권한이 있는 키를 선택해주세요.`);
        continue;
      }
      
      // 404 NOT_FOUND인 경우(모델이 계정/지역에서 지원되지 않음) 다음 고품질 모델 시도
      if (errorString.includes('404') || errorString.includes('NOT_FOUND')) {
        console.warn(`${modelName} is not available, trying next high-quality model...`);
        lastError = e;
        continue;
      }
      
      // 그 외 전치리 가능한 에러는 withRetry 내부에서 처리되었으나, 루프 탈출 조건
      console.error(`Image generation with ${modelName} failed:`, e);
      lastError = e;
    }
  }
  throw lastError;
}

// 비용 추적 유틸리티
export interface ApiUsage {
  planCalls: number;
  imageCalls: number;
  captionCalls: number;
  draftCalls: number;
}

export const PRICING = {
  PLAN_KRW: 10,
  IMAGE_KRW: 40,
  CAPTION_KRW: 5,
  DRAFT_KRW: 10
};

export function getUsage(): ApiUsage {
  if (typeof window === 'undefined') return { planCalls: 0, imageCalls: 0, captionCalls: 0, draftCalls: 0 };
  const usage = localStorage.getItem('api_usage');
  return usage ? JSON.parse(usage) : { planCalls: 0, imageCalls: 0, captionCalls: 0, draftCalls: 0 };
}

export function getTotalCost(): number {
  const usage = getUsage();
  return (
    usage.planCalls * PRICING.PLAN_KRW +
    usage.imageCalls * PRICING.IMAGE_KRW +
    usage.captionCalls * PRICING.CAPTION_KRW +
    usage.draftCalls * PRICING.DRAFT_KRW
  );
}

function trackUsage(type: 'plan' | 'image' | 'caption' | 'draft') {
  if (typeof window === 'undefined') return;
  const usage = getUsage();
  if (type === 'plan') usage.planCalls++;
  else if (type === 'image') usage.imageCalls++;
  else if (type === 'caption') usage.captionCalls++;
  else if (type === 'draft') usage.draftCalls++;
  localStorage.setItem('api_usage', JSON.stringify(usage));
  window.dispatchEvent(new Event('api_usage_updated'));
}

export function resetUsage() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('api_usage');
  window.dispatchEvent(new Event('api_usage_updated'));
}

export async function generateInstagramPost(topic: string, segments: CardnewsSegment[]): Promise<InstagramPostData> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API Key is missing.");
  
  const models = ["gemini-3.1-flash-lite-preview", "gemini-3-flash-preview", "gemini-3.1-pro-preview"];
  let lastError: any;

  for (const modelName of models) {
    try {
      console.log(`Attempting caption generation with model: ${modelName} (Speed Optimized)`);
      return await withRetry(async () => {
        const ai = new GoogleGenAI({ apiKey });

        const summary = segments.map(s => `- ${s.logicalStep}: ${s.keyMessage}`).join('\n');
        const prompt = `
당신은 인스타그램 알고리즘 전문가이자 전문 카피라이터입니다.
다음 카드뉴스 기획안을 바탕으로 인스타그램 피드에 올릴 최적화된 본문(캡션)과 해시태그를 작성해주세요.

주제: ${topic}
카드뉴스 내용 요약:
${summary}

요구사항:
1. 캡션은 후킹하는 첫 문장, 본문 요약, 소통을 유도하는 질문(Call to Action)을 포함할 것.
2. 해시태그는 검색 노출에 최적화된 10~15개 사이로 작성할 것.
3. 텍스트 내에 적절한 이모지를 사용할 것.
`;

        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                caption: { type: Type.STRING, description: "인스타그램 본문 캡션 (이모지 포함)" },
                hashtags: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "해시태그 배열 (예: ['#직장인', '#시간관리'])"
                }
              },
              required: ["caption", "hashtags"]
            },
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
          }
        });

        const text = response.text;
        if (!text) throw new Error("Failed to generate post data");
        trackUsage('caption');
        return JSON.parse(text) as InstagramPostData;
      }, 2);
    } catch (e) {
      console.warn(`Caption generation failed with ${modelName}, trying next model...`, e);
      lastError = e;
    }
  }
  throw lastError;
}

export async function generateDraftFromLinks(links: string[]): Promise<{ topic: string; draft: string }> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API Key is missing.");
  if (links.length === 0) return { topic: "", draft: "" };

  // 속도 최적화를 위해 Flash Lite 모델을 최우선 사용
  const models = ["gemini-3.1-flash-lite-preview", "gemini-3-flash-preview", "gemini-3.1-pro-preview"];
  let lastError: any;

  for (const modelName of models) {
    try {
      console.log(`Attempting draft generation with model: ${modelName} (Speed Optimized)`);
      return await withRetry(async () => {
        const ai = new GoogleGenAI({ apiKey });
        
        // URL Context 도구를 사용하여 링크들의 내용을 기반으로 주제와 초안 생성
        const prompt = `
당신은 전문 콘텐츠 에디터입니다. 
제공된 참고 링크들의 내용을 상세히 분석하여, 인스타그램 카드뉴스를 만들기 위한 '주제(Topic)'와 '핵심 요약 초안(Draft)'을 작성해주세요.

요구사항:
1. 주제(topic): 카드뉴스의 제목으로 쓰기 좋은 매력적이고 직관적인 한 줄 문장.
2. 초안(draft): 각 링크의 핵심 주제와 중요한 팩트, 수치, 인사이트를 모두 포함하여 카드뉴스로 제작하기 좋게 논리적인 순서(도입-전개-결론)로 정리.
3. 한국어로 작성하며, 전문적이면서도 이해하기 쉬운 톤을 유지하세요.
4. 초안은 상세하게 작성해주세요.
`;

        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt + "\n\n참고 링크:\n" + links.join("\n"),
          config: {
            tools: [{ urlContext: {} }],
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                topic: { type: Type.STRING, description: "카드뉴스 주제 (한 줄)" },
                draft: { type: Type.STRING, description: "상세 콘텐츠 초안" }
              },
              required: ["topic", "draft"]
            },
            // 속도 최적화를 위해 추론 레벨을 낮춤
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
          }
        });

        const text = response.text;
        if (!text) throw new Error("Failed to generate draft");
        trackUsage('draft');
        return JSON.parse(text) as { topic: string; draft: string };
      }, 2); // 재시도 횟수를 줄여서 더 빠르게 실패하고 다음 모델로 넘어가도록 함
    } catch (e) {
      console.warn(`Draft generation failed with ${modelName}, trying next model...`, e);
      lastError = e;
    }
  }
  
  throw lastError || new Error("Failed to generate draft from links after multiple attempts");
}

export async function generateDraftFromImage(base64Image: string): Promise<{ topic: string; draft: string }> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API Key is missing.");

  const models = ["gemini-3-flash-preview", "gemini-3.1-pro-preview"];
  let lastError: any;

  for (const modelName of models) {
    try {
      console.log(`Attempting draft generation from image with model: ${modelName}`);
      return await withRetry(async () => {
        const ai = new GoogleGenAI({ apiKey });
        
        const mimeType = base64Image.match(/data:(.*?);base64/)?.[1] || 'image/jpeg';
        const data = base64Image.split(',')[1];

        const prompt = `
당신은 전문 콘텐츠 에디터이자 이미지 분석 전문가입니다. 
제공된 이미지를 상세히 분석하여, 이 이미지를 활용한 인스타그램 카드뉴스를 만들기 위한 '주제(Topic)'와 '핵심 요약 초안(Draft)'을 작성해주세요.

요구사항:
1. 주제(topic): 이미지의 핵심 메시지를 담은 매력적이고 직관적인 한 줄 문장.
2. 초안(draft): 이미지에서 읽어낼 수 있는 정보, 분위기, 텍스트, 상황 등을 바탕으로 카드뉴스로 제작하기 좋게 논리적인 순서(도입-전개-결론)로 정리.
3. 한국어로 작성하며, 전문적이면서도 이해하기 쉬운 톤을 유지하세요.
4. 초안은 상세하게 작성해주세요.
`;

        const response = await ai.models.generateContent({
          model: modelName,
          contents: {
            parts: [
              { text: prompt },
              { inlineData: { data, mimeType } }
            ]
          },
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                topic: { type: Type.STRING, description: "카드뉴스 주제 (한 줄)" },
                draft: { type: Type.STRING, description: "상세 콘텐츠 초안" }
              },
              required: ["topic", "draft"]
            }
          }
        });

        const text = response.text;
        if (!text) throw new Error("Failed to generate draft from image");
        trackUsage('draft');
        return JSON.parse(text) as { topic: string; draft: string };
      }, 2);
    } catch (e) {
      console.warn(`Draft generation from image failed with ${modelName}, trying next model...`, e);
      lastError = e;
    }
  }
  
  throw lastError || new Error("Failed to generate draft from image after multiple attempts");
}
