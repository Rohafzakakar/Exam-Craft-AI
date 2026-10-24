declare module 'arabic-persian-reshaper' {
  const reshaper: {
    PersianShaper: {
      convertArabic: (text: string) => string;
      convertArabicBack: (text: string) => string;
    };
    ArabicShaper: {
      convertArabic: (text: string) => string;
      convertArabicBack: (text: string) => string;
    };
  };
  export default reshaper;
}

declare module 'bidi-js' {
  export default function bidiFactory(): {
    getEmbeddingLevels: (text: string, direction?: string) => Uint8Array | number[];
    getReorderedString: (text: string, levels: any) => string;
    getReorderedIndices: (text: string, levels: any) => number[];
  };
}

declare module 'mammoth' {
  interface MammothResult {
    value: string;
    messages: any[];
  }
  export function extractRawText(options: { buffer?: Buffer; path?: string }): Promise<MammothResult>;
  export function convertToHtml(options: { buffer?: Buffer; path?: string }): Promise<MammothResult>;
  export function convertToMarkdown(options: { buffer?: Buffer; path?: string }): Promise<MammothResult>;
}
