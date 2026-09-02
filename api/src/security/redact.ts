const DUMMY_ROUTER_PASSWORD = 'dummypasswordhasbeenissued';

export function publicServer<T extends { password?: string | null; type?: unknown }>(row: T) {
  const { password, ...rest } = row;
  return {
    ...rest,
    passwordSet: Boolean(password && password !== DUMMY_ROUTER_PASSWORD),
  };
}

export function isDummyRouterPassword(password?: string | null) {
  return !password || password === DUMMY_ROUTER_PASSWORD;
}

export { DUMMY_ROUTER_PASSWORD };
