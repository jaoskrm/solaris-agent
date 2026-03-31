export function ok(c: any, data: any) {
  return c.json({ success: true, data });
}

export function created(c: any, data: any) {
  return c.json({ success: true, data }, 201);
}

export function errorResponse(c: any, status: number, message: string) {
  return c.json({ success: false, error: message }, status);
}