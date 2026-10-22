// Ambient shims so workspace TypeScript (not Deno) can also type-check edge functions.
// At deploy time Supabase's Deno runtime ignores this file and resolves real types.

declare namespace Deno {
  namespace env {
    function get(key: string): string | undefined;
    function set(key: string, value: string): void;
  }
  function serve(handler: (req: Request) => Promise<Response> | Response): void;
}

declare module "npm:@supabase/supabase-js@2" {
  export function createClient(
    url: string,
    key: string,
    options?: Record<string, unknown>,
  ): any;
}

declare module "npm:web-push@3.6.7" {
  const webpush: {
    setVAPIDKeys(keys: { publicKey: string; privateKey: string; subject?: string }): void;
    send(
      sub: { endpoint: string; keys: { p256dh: string; auth: string } },
      payload: string,
    ): Promise<unknown>;
  };
  export default webpush;
}

declare module "npm:pdf-lib@1.17.1" {
  export class PDFDocument {
    static create(): Promise<PDFDocument>;
    addPage(size?: [number, number]): any;
    embedFont(font: any): Promise<any>;
    save(): Promise<Uint8Array>;
  }
  export const StandardFonts: { Helvetica: string; HelveticaBold: string };
  export function rgb(r: number, g: number, b: number): any;
}
