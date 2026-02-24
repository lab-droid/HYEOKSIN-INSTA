export interface CarouselSegment {
  id: number;
  logicalStep: string;   // 예: "후킹(Hook)", "본론(Body)" 
  keyMessage: string;    // 이미지에 렌더링될 100% 한글 카피 
  visualPrompt: string;  // Imagen 3 전용 비주얼 묘사 (영어)
  imageUrl?: string;     // 생성된 이미지 URL (Base64/Blob) 
}

export interface InstagramPostData {
  caption: string;
  hashtags: string[];
}

export type AspectRatio = '1:1' | '4:5';

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

