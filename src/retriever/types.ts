export interface RetrievedImage {
  url: string;
  contentType: string;
  bytes?: Uint8Array;
  dataUrl?: string;
  width?: number;
  height?: number;
  score: number;
  reason: string;
}

export interface RetrievedRecipePage {
  url: string;
  finalUrl: string;
  title: string;
  markdown: string;
  html: string;
  images: RetrievedImage[];
}

export interface RetrieveRecipePageOptions {
  maxMarkdownChars?: number;
  maxImages?: number;
  maxImageBytes?: number;
  fetch?: typeof fetch;
  userAgent?: string;
  includeImageBytes?: boolean;
}
