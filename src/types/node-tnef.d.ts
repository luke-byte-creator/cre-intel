declare module 'node-tnef' {
  interface TnefAttachment {
    name?: string;
    data: Buffer;
    size?: number;
  }

  interface TnefData {
    attachments?: TnefAttachment[];
    message?: string;
  }

  export function parse(buffer: Buffer): TnefData;
}