import { createClient, type ApiError, type Session } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';
import { skHelper } from '../instance';
import {
  setCookies,
  parseCookie,
  COOKIE_OPTIONS,
  type CookieOptions,
  SvelteKitRequestAdapter,
  SvelteKitResponseAdapter,
  jwtDecoder,
  TOKEN_REFRESH_MARGIN
} from '@supabase/auth-helpers-shared';
import type { RequestResponse } from '../types';

export interface GetUserOptions {
  cookieOptions?: CookieOptions;
  forceRefresh?: boolean;
  tokenRefreshMargin?: number;
}

interface UserResponse {
  user: User | null; 
  accessToken: string | null;
  refreshToken?: string;
  error?: string
}

/**
 * Get a user from a cookie or from the supabase API
 * Note: This function no longer saves the token into a cookie, for this
 * you will need to use the getUserAndSaveTokens function instead.
 * @param req Request
 * @param options GetUserOptions
 * @returns Promise<UserResponse>
 */
export async function getUser(
  req: Request,
  options: GetUserOptions = { forceRefresh: false }
): Promise<UserResponse> {
  try {
    const {
      apiInfo: { supabaseUrl, supabaseAnonKey }
    } = skHelper();
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error(
        'supabaseUrl and supabaseAnonKey env variables are required!'
      );
    }

    if (!req.headers.has('cookie')) {
      throw new Error('Cookie not found!');
    }

    const cookieOptions = { ...COOKIE_OPTIONS, ...options.cookieOptions };
    const tokenRefreshMargin =
      options.tokenRefreshMargin ?? TOKEN_REFRESH_MARGIN;

    const cookies = parseCookie(req.headers.get('cookie'));

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const access_token = cookies[`${cookieOptions.name}-access-token`];
    const refresh_token = cookies[`${cookieOptions.name}-refresh-token`];

    if (!access_token) {
      throw new Error('No cookie found!');
    }

    // if we have a token, set the client to use it so we can make authorized requests to Supabase
    supabase.auth.setAuth(access_token);

    // Get payload from access token.
    const jwtUser = jwtDecoder(access_token);
    if (!jwtUser?.exp) {
      throw new Error('Not able to parse JWT payload!');
    }
    const timeNow = Math.round(Date.now() / 1000);
    if (options.forceRefresh || jwtUser.exp < timeNow + tokenRefreshMargin) {
      // JWT is expired, let's refresh from Gotrue
      if (!refresh_token) {
        throw new Error('No refresh_token cookie found!');
      }

      const { data, error } = await supabase.auth.api.refreshAccessToken(
        refresh_token
      );

      if (error) {
        throw error;
      }
      return { user: data!.user!, accessToken: data!.access_token, refreshToken: data?.refresh_token };
    } else {
      const { user, error: getUserError } = await supabase.auth.api.getUser(
        access_token
      );
      if (getUserError) {
        throw getUserError;
      }
      return { user, accessToken: access_token };
    }
  } catch (e) {
    const error = e as ApiError;
    return { user: null, accessToken: null, error: error.message };
  }
}

export function saveTokens(
  { req, res }: RequestResponse,
  session: UserResponse,
  options: GetUserOptions = { forceRefresh: false }
) {
  try {
    if (session.error) {
      throw new Error('Cookies cannot be saved!')
    }
    const cookieOptions = { ...COOKIE_OPTIONS, ...options.cookieOptions };
    const tokenRefreshMargin =
      options.tokenRefreshMargin ?? TOKEN_REFRESH_MARGIN;

    const cookies = parseCookie(req.headers.get('cookie'));
    const access_token = cookies[`${cookieOptions.name}-access-token`];
    const refresh_token = cookies[`${cookieOptions.name}-refresh-token`];

    if (!access_token) {
      throw new Error('No cookie found!');
    }

    // Get payload from access token.
    const jwtUser = jwtDecoder(access_token);
    if (!jwtUser?.exp) {
      throw new Error('Not able to parse JWT payload!');
    }
    const timeNow = Math.round(Date.now() / 1000);
    if (options.forceRefresh || jwtUser.exp < timeNow + tokenRefreshMargin) {
      // JWT is expired, let's refresh from Gotrue
      if (!refresh_token) {
        throw new Error('No refresh_token cookie found!');
      }

      setCookies(
        new SvelteKitRequestAdapter(req),
        new SvelteKitResponseAdapter(res),
        [
          { key: 'access-token', value: session!.accessToken! },
          { key: 'refresh-token', value: session!.refreshToken! }
        ].map((token) => ({
          name: `${cookieOptions.name}-${token.key}`,
          value: token.value,
          domain: cookieOptions.domain,
          maxAge: cookieOptions.lifetime ?? 0,
          path: cookieOptions.path,
          sameSite: cookieOptions.sameSite
        }))
      );
      return { user: session.user, accessToken: session.accessToken };
    }
  } catch (e) {
    const error = e as ApiError;
    return { user: null, accessToken: null, error: error.message };
  }
}

export default async function getUserAndSaveTokens(
  { req, res }: RequestResponse,
  options: GetUserOptions = { forceRefresh: false }
): Promise<UserResponse> {
  const session = await getUser(req, options)
  await saveTokens({req, res}, session, options);
  return session;
}
