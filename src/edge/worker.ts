const WWW_HOST = 'www.vectraa.com';

export interface AssetsEnv {
  ASSETS: {
    fetch(request: Request): Promise<Response> | Response;
  };
}

/** 301 www.vectraa.com to the apex, preserving path and query. Other hosts return null. */
export function wwwRedirect(request: Request): Response | null {
  const url = new URL(request.url);
  if (url.hostname !== WWW_HOST) return null;

  url.protocol = 'https:';
  url.hostname = 'vectraa.com';
  url.port = '';
  return Response.redirect(url.toString(), 301);
}

export default {
  fetch(request: Request, env: AssetsEnv): Response | Promise<Response> {
    return wwwRedirect(request) ?? env.ASSETS.fetch(request);
  },
};
