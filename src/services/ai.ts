import { GoogleGenAI, Type } from "@google/genai";
import { AspectRatio, CarouselSegment, InstagramPostData } from "../types";

export const getApiKey = () => {
  return localStorage.getItem('gemini_api_key') || process.env.API_KEY || process.env.GEMINI_API_KEY;
};

async function withRetry<T>(fn: () => Promise<T>, maxRetries: number = 7): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // 120초 타임아웃으로 증가 (고품질 이미지 생성은 시간이 더 걸릴 수 있음)
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Request Timeout")), 120000)
      );
      return await Promise.race([fn(), timeoutPromise]) as T;
    } catch (e: any) {
      lastError = e;
      const errorString = typeof e === 'string' ? e : JSON.stringify(e, Object.getOwnPropertyNames(e));
      
      // 재시도 대상 에러: 503, 시간초과, 과부하, 데이터 없음 등
      const isRetryable = 
        errorString.includes('503') || 
        errorString.includes('Deadline expired') || 
        errorString.includes('high demand') || 
        errorString.includes('UNAVAILABLE') ||
        errorString.includes('Timeout') ||
        errorString.includes('No image data');

      if (isRetryable) {
        if (attempt < maxRetries) {
          // 지수 백오프 + 지터(Jitter) 추가하여 서버 부하 분산
          const baseDelay = Math.pow(2, attempt) * 2000; 
          const jitter = Math.random() * 1000;
          const delay = Math.min(baseDelay + jitter, 30000); // 최대 30초 대기
          
          console.log(`Attempt ${attempt} failed, retrying in ${Math.round(delay/1000)}s... Error: ${errorString.substring(0, 100)}`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
      throw e;
    }
  }
  throw lastError;
}

export async function generatePlan(topic: string, count: number, ratio: AspectRatio, referenceImages: string[] = []): Promise<CarouselSegment[]> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API Key is missing.");
  
  const models = ["gemini-3.1-pro-preview", "gemini-3-flash-preview"];
  let lastError: any;

  for (const modelName of models) {
    try {
      console.log(`Attempting plan generation with model: ${modelName}`);
      return await withRetry(async () => {
        const ai = new GoogleGenAI({ apiKey });
        const promptText = `
당신은 대한민국 최고의 SNS 콘텐츠 바이럴 전략가이자 딥리서치 전문가입니다.
구글 검색을 활용하여 사용자의 주제와 관련된 가장 최신의, 신뢰할 수 있는 고품질 데이터와 트렌드를 깊이 있게 조사(Deep Research)하세요.
조사한 팩트 기반의 정보를 바탕으로 장수(${count}장)에 맞춰 논리적 흐름을 짜주세요.

논리 구조 적용: Hook(후킹) -> Info(정보 전달, 구체적 수치나 팩트 포함) -> Solution(해결책) -> Closing(마무리) 순으로 자동 구성.
한국어 카피는 트렌디하고 직관적이어야 합니다.
제약: 카피 내 영어를 절대 쓰지 마세요. Premium 대신 '최고급', Best 대신 '최고의'를 사용하세요.

비주얼 프롬프트(visualPrompt) 작성 시, 정보성 인포그래픽(표, 리스트, 그리드, 아이콘, 뱃지 등) 스타일로 구성되도록 영어로 상세히 묘사해주세요. (예: "A dark mode infographic table with neon badges...", "A clean light green background list with bar charts...")
${referenceImages.length > 0 ? '\n중요: 첨부된 참고 이미지들의 디자인 스타일, 톤앤매너, 색감, 레이아웃을 완벽하게 분석하여 visualPrompt 묘사에 반영하세요.' : ''}

주제: ${topic}
장수: ${count}장
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
            }
          }
        });

        const text = response.text;
        if (!text) throw new Error("Failed to generate plan");
        return JSON.parse(text) as CarouselSegment[];
      }, 2);
    } catch (e) {
      console.warn(`Plan generation failed with ${modelName}, trying next model...`, e);
      lastError = e;
    }
  }
  throw lastError;
}

export async function generateImage(segment: CarouselSegment, ratio: AspectRatio, referenceImages: string[] = []): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("API Key is missing.");
  }
  
  // 모델 후보군: 가장 좋은 모델부터 순차적으로 시도
  const models = [
    'gemini-3-pro-image-preview',
    'gemini-3.1-flash-image-preview',
    'gemini-2.5-flash-image'
  ];

  let lastError: any;

  for (const modelName of models) {
    try {
      console.log(`Attempting image generation with model: ${modelName}`);
      // 모델별로 재시도 횟수를 조절 (상위 모델은 더 끈질기게 시도)
      const retriesForThisModel = modelName.includes('pro') ? 4 : 2;
      
      return await withRetry(async () => {
        const aiImage = new GoogleGenAI({ apiKey });
        
        const promptText = `
Create a high-quality infographic style image for a Korean Instagram carousel.
Style: Clean, professional, high-end design, structured layout, high contrast.
${referenceImages.length > 0 ? '\nCRITICAL: You MUST perfectly match the tone, manner, color palette, and overall style of the provided reference images (100% consistency).' : ''}
Background visual: ${segment.visualPrompt}

IMPORTANT: You MUST render the following Korean text perfectly and clearly without any character corruption or typos.
Text to render: "${segment.keyMessage}"
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
          }
        };

        // Pro 모델이나 3.1 Flash 모델은 1K 사이즈 지원
        if (modelName.includes('3')) {
          config.imageConfig.imageSize = "1K";
        }

        const response = await aiImage.models.generateContent({
          model: modelName,
          contents: { parts },
          config
        });

        for (const part of response.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData) {
            return `data:image/png;base64,${part.inlineData.data}`;
          }
        }
        throw new Error("No image data in response");
      }, retriesForThisModel); // 모델별 최적화된 재시도 횟수 적용
    } catch (e) {
      console.warn(`Model ${modelName} failed:`, e);
      lastError = e;
      // 다음 모델로 넘어감
    }
  }
  
  throw lastError || new Error("All models failed to generate image");
}

export async function generateInstagramPost(topic: string, segments: CarouselSegment[]): Promise<InstagramPostData> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API Key is missing.");
  
  const models = ["gemini-3.1-pro-preview", "gemini-3-flash-preview"];
  let lastError: any;

  for (const modelName of models) {
    try {
      console.log(`Attempting caption generation with model: ${modelName}`);
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
            }
          }
        });

        const text = response.text;
        if (!text) throw new Error("Failed to generate post data");
        return JSON.parse(text) as InstagramPostData;
      }, 2);
    } catch (e) {
      console.warn(`Caption generation failed with ${modelName}, trying next model...`, e);
      lastError = e;
    }
  }
  throw lastError;
}
