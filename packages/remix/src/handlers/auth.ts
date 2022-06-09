import {
  CookieOptions,
  COOKIE_OPTIONS,
  TOKEN_REFRESH_MARGIN
} from '@supabase/auth-helpers-shared';
import handleCallback from './callback';
import handleUser from './user';
import handleLogout from './logout';

export interface HandleAuthOptions {
  cookieOptions?: CookieOptions;
  logout?: { returnTo?: string };
  tokenRefreshMargin?: number;
}

export default function handleAuth(options: HandleAuthOptions = {}) {
  return async ({
    request,
    response,
    params
  }: {
    request: Request;
    response: Response;
    // TODO! Fix params: any
    params: any;
  }): Promise<Response> => {
    const { logout } = options;
    const cookieOptions = { ...COOKIE_OPTIONS, ...options.cookieOptions };
    const tokenRefreshMargin =
      options.tokenRefreshMargin ?? TOKEN_REFRESH_MARGIN;

    const route = params['*'];

    switch (route) {
      case 'callback':
        return handleCallback(request, response, {
          cookieOptions
        });
      case 'user':
        return await handleUser(request, response, {
          cookieOptions,
          tokenRefreshMargin
        });
      case 'logout':
        return handleLogout(request, response, {
          cookieOptions,
          ...logout
        });
      default:
        return new Response('Not found', {
          status: 404
        });
    }
  };
}
