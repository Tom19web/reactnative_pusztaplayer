/**
 * WinHTTP-based HTTP module - replaces broken RNW native HTTP module.
 */
import { NativeModules } from 'react-native';

const { WinHttpModule } = NativeModules;

export interface HttpResponse {
  status: number;
  body: string;
}

export async function winHttpFetch(url: string, method: string = 'GET', body: string = ''): Promise<HttpResponse> {
  if (!WinHttpModule || !WinHttpModule.request) {
    throw new Error('WinHttpModule not available');
  }
  return new Promise((resolve, reject) => {
    WinHttpModule.request(url, method, body, (...args: any[]) => {
      if (Array.isArray(args[0]) && args[0].length === 2) {
        resolve({ status: args[0][0], body: args[0][1] } as HttpResponse);
      } else if (args.length === 2 && typeof args[0] === 'number' && typeof args[1] === 'string') {
        resolve({ status: args[0], body: args[1] } as HttpResponse);
      } else if (typeof args[0] === 'string') {
        reject(new Error(args[0]));
      } else {
        reject(new Error('Unknown error'));
      }
    });
  });
}
